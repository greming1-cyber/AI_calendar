"use client";

import { keepPreviousData, useMutation, useQuery, useQueryClient, type QueryKey } from "@tanstack/react-query";
import {
  countCategoryEvents,
  createCategory,
  deleteCategory,
  deleteEvent,
  listEventCategories,
  listEvents,
  listLinkedItems,
  listRecurringPayments,
  parseEventId,
  saveEvent,
  updateCategory,
} from "@/lib/data/events";
import type { CalendarEvent, DateRange, EventCategory, EventInput, RecurrenceScope } from "@/lib/types";
import { kickGoogleSync } from "./use-google";
import { useTimezone } from "./use-profile";

// 쿼리 키: 도메인명이 첫 원소. 쓰기 후에는 ["events"] 전체를 무효화한다.
export const eventKeys = {
  all: ["events"] as const,
  range: (from: string, to: string, tz: string) => ["events", from, to, tz] as const,
  categories: ["event-categories"] as const,
  linked: (rowId: string) => ["events", "linked", rowId] as const,
  categoryCount: (id: string) => ["event-categories", "count", id] as const,
  payments: (from: string, to: string) => ["recurring-transactions", "calendar", from, to] as const,
};

/**
 * range의 from~to(포함)에 걸치는 일정. 반복 일정은 회차로 펼친다(id `"<원본id>:<날짜>"`).
 * 범위를 바꾸는 동안에는 이전 결과를 유지한다.
 */
export function useEvents(range: DateRange, { expand = true }: { expand?: boolean } = {}) {
  const tz = useTimezone();
  return useQuery({
    queryKey: expand ? eventKeys.range(range.from, range.to, tz) : [...eventKeys.range(range.from, range.to, tz), "raw"],
    queryFn: () => listEvents(range.from, range.to, tz, { expand }),
    enabled: Boolean(range.from && range.to),
    placeholderData: keepPreviousData,
  });
}

export function useEventCategories() {
  return useQuery({ queryKey: eventKeys.categories, queryFn: listEventCategories, staleTime: 5 * 60_000 });
}

/** 카테고리 이름 → 색. 없으면 흐린 기본색 */
export const categoryColorOf = (categories: EventCategory[] | undefined, name: string) =>
  categories?.find((c) => c.name === name)?.color ?? "rgb(255 255 255 / 0.3)";

// ── 낙관적 업데이트 ──────────────────────────────────────

type Snapshot = [QueryKey, CalendarEvent[] | undefined][];

/** 캐시의 일정 목록(["events", from, to, tz])을 고친다. 롤백용 스냅샷을 돌려준다 */
async function patchLists(qc: ReturnType<typeof useQueryClient>, fn: (list: CalendarEvent[], from: string, to: string) => CalendarEvent[]) {
  await qc.cancelQueries({ queryKey: eventKeys.all });
  const snapshot: Snapshot = qc.getQueriesData<CalendarEvent[]>({ queryKey: eventKeys.all });
  for (const [key, list] of snapshot) {
    const [, from, to] = key as string[];
    if (Array.isArray(list) && from && to && key.length >= 4) qc.setQueryData(key, fn(list, from, to));
  }
  return snapshot;
}

const restore = (qc: ReturnType<typeof useQueryClient>, snapshot?: Snapshot) => snapshot?.forEach(([key, data]) => qc.setQueryData(key, data));

/** 입력값을 화면 일정에 덮어쓴다. 날짜 이동이 없는 범위 수정에서 쓴다 */
const applyFields = (e: CalendarEvent, input: EventInput, keepDate: boolean): CalendarEvent => ({
  ...e,
  ...input,
  date: keepDate ? e.date : input.date,
  endDate: keepDate ? e.endDate : (input.endDate ?? input.date),
  rrule: input.rrule !== undefined ? input.rrule : e.rrule,
});

export interface SaveEventVars {
  id: string | null;
  input: EventInput;
  categories: EventCategory[];
  /** 반복 회차를 고칠 때 범위. 기본 "all" */
  scope?: RecurrenceScope;
}

/** 등록·수정. 화면에 바로 반영하고(낙관적 업데이트) 실패하면 되돌린다. 오류 토스트는 호출한 화면이 띄운다 */
export function useSaveEvent() {
  const qc = useQueryClient();
  const tz = useTimezone();
  return useMutation({
    mutationFn: ({ id, input, categories, scope }: SaveEventVars) => saveEvent(id, input, categories, tz, scope),
    onMutate: async ({ id, input, scope = "all" }) => {
      if (!id) {
        if (input.rrule || (input.rrule === undefined && input.repeat !== "안 함")) return {};
        const temp: CalendarEvent = {
          ...input,
          id: `temp-${Date.now()}`,
          endDate: input.endDate ?? input.date,
          rrule: null,
          seriesId: null,
          occurrenceDate: null,
        };
        const endDate = temp.endDate;
        return { snapshot: await patchLists(qc, (list, from, to) => (input.date <= to && endDate >= from ? [...list, temp] : list)) };
      }
      const { rowId, date } = parseEventId(id);
      return {
        snapshot: await patchLists(qc, (list) =>
          list.map((e) => {
            if (e.id === id) return applyFields(e, input, false);
            // 범위 수정: 같은 시리즈의 다른 회차는 날짜를 그대로 두고 내용만 바꾼다.
            if (scope !== "this" && date && e.seriesId === rowId && e.occurrenceDate && (scope === "all" || e.date >= date))
              return applyFields(e, input, true);
            return e;
          }),
        ),
      };
    },
    onError: (_e, _v, ctx) => restore(qc, ctx?.snapshot),
    onSettled: () => qc.invalidateQueries({ queryKey: eventKeys.all }),
    // 구글 일정이면 바로 내보낸다(GCAL-05).
    onSuccess: (_d, { input }) => {
      if (input.source === "google") kickGoogleSync(qc);
    },
  });
}

/** 삭제. mutate(id) 또는 mutate({ id, scope }) */
export function useDeleteEvent() {
  const qc = useQueryClient();
  const tz = useTimezone();
  return useMutation({
    mutationFn: (vars: string | { id: string; scope?: RecurrenceScope }) =>
      typeof vars === "string" ? deleteEvent(vars, "all", tz) : deleteEvent(vars.id, vars.scope, tz),
    onMutate: async (vars) => {
      const { id, scope = "all" } = typeof vars === "string" ? { id: vars } : vars;
      const { rowId, date } = parseEventId(id);
      return {
        snapshot: await patchLists(qc, (list) => {
          const target = list.find((e) => e.id === id);
          const series = target?.seriesId ?? rowId;
          const from = date ?? target?.occurrenceDate ?? "";
          return list.filter((e) => {
            if (e.id === id || e.id === rowId) return false;
            if (scope === "this" || e.seriesId !== series) return true;
            return scope === "following" ? e.date < from : false;
          });
        }),
      };
    },
    onError: (_e, _v, ctx) => restore(qc, ctx?.snapshot),
    onSettled: () => qc.invalidateQueries({ queryKey: eventKeys.all }),
    // 구글 일정 삭제는 소프트 삭제로 남아 있다가 동기화가 구글에서 지운다(GCAL-05).
    onSuccess: () => kickGoogleSync(qc),
  });
}

// ── 연결 정보 (EVT-07, EVT-09) ──────────────────────────

/** 일정에 연결된 할일·내역. 반복 회차는 원본 기준 */
export function useLinkedItems(eventId: string | null) {
  const rowId = eventId ? parseEventId(eventId).rowId : "";
  return useQuery({
    queryKey: eventKeys.linked(rowId),
    queryFn: () => listLinkedItems(rowId),
    enabled: Boolean(rowId) && !rowId.startsWith("temp-"),
  });
}

/** 고정지출 결제 예정일 */
export function useRecurringPayments(range: DateRange, enabled = true) {
  return useQuery({
    queryKey: eventKeys.payments(range.from, range.to),
    queryFn: () => listRecurringPayments(range.from, range.to),
    enabled: enabled && Boolean(range.from && range.to),
    placeholderData: keepPreviousData,
  });
}

// ── 카테고리 (EVT-06) ───────────────────────────────────

const useCategoryMutation = <V,>(fn: (v: V) => Promise<unknown>) => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: fn,
    onSettled: () => {
      qc.invalidateQueries({ queryKey: eventKeys.categories });
      qc.invalidateQueries({ queryKey: eventKeys.all });
    },
  });
};

export const useCreateCategory = () => useCategoryMutation(createCategory);
export const useUpdateCategory = () =>
  useCategoryMutation(({ id, ...patch }: { id: string; name?: string; color?: string }) => updateCategory(id, patch));
export const useDeleteCategory = () =>
  useCategoryMutation(({ id, moveTo }: { id: string; moveTo?: string | null }) => deleteCategory(id, moveTo));

export function useCategoryEventCount(id: string | null) {
  return useQuery({ queryKey: eventKeys.categoryCount(id ?? ""), queryFn: () => countCategoryEvents(id!), enabled: Boolean(id) });
}
