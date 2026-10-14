"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { deleteEvent, listEventCategories, listEvents, saveEvent } from "@/lib/data/events";
import type { DateRange, EventCategory, EventInput } from "@/lib/types";
import { useTimezone } from "./use-profile";

// 쿼리 키: 도메인명이 첫 원소. 쓰기 후에는 ["events"] 전체를 무효화한다.
export const eventKeys = {
  all: ["events"] as const,
  range: (from: string, to: string, tz: string) => ["events", from, to, tz] as const,
  categories: ["event-categories"] as const,
};

/** range의 from~to(포함)에 시작하는 일정 */
export function useEvents(range: DateRange) {
  const tz = useTimezone();
  return useQuery({
    queryKey: eventKeys.range(range.from, range.to, tz),
    queryFn: () => listEvents(range.from, range.to, tz),
    enabled: Boolean(range.from && range.to),
  });
}

export function useEventCategories() {
  return useQuery({ queryKey: eventKeys.categories, queryFn: listEventCategories, staleTime: 5 * 60_000 });
}

/** 카테고리 이름 → 색. 없으면 흐린 기본색 */
export const categoryColorOf = (categories: EventCategory[] | undefined, name: string) =>
  categories?.find((c) => c.name === name)?.color ?? "rgb(255 255 255 / 0.3)";

// TODO(01): 낙관적 업데이트, 반복 범위
export function useSaveEvent() {
  const qc = useQueryClient();
  const tz = useTimezone();
  return useMutation({
    mutationFn: ({ id, input, categories }: { id: string | null; input: EventInput; categories: EventCategory[] }) =>
      saveEvent(id, input, categories, tz),
    onSettled: () => qc.invalidateQueries({ queryKey: eventKeys.all }),
  });
}

export function useDeleteEvent() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: deleteEvent,
    onSettled: () => qc.invalidateQueries({ queryKey: eventKeys.all }),
  });
}
