"use client";

import { useEffect } from "react";
import { useMutation, useQuery, useQueryClient, type QueryClient } from "@tanstack/react-query";
import { copyBudgets, listBudgets, saveMonthBudgets } from "@/lib/data/budgets";
import {
  createPaymentMethod,
  createRecurringTransaction,
  createTransaction,
  createTxCategory,
  deletePaymentMethod,
  deleteRecurringTransaction,
  deleteTransaction,
  deleteTxCategory,
  generateRecurringTransactions,
  listAllRecurringTransactions,
  listPaymentMethods,
  listRecurringTransactions,
  listTransactions,
  listTxCategories,
  reorder,
  updatePaymentMethod,
  updateRecurringTransaction,
  updateTransaction,
  updateTxCategory,
} from "@/lib/data/transactions";
import type {
  DateRange,
  ISODate,
  PaymentMethod,
  RecurringInput,
  Transaction,
  TransactionInput,
  TxCategory,
  TxFilter,
  TxType,
} from "@/lib/types";

export const txKeys = {
  all: ["transactions"] as const,
  range: (from: string, to: string, filter?: TxFilter) =>
    (filter ? ["transactions", from, to, filter] : ["transactions", from, to]) as readonly unknown[],
  budgetsAll: ["budgets"] as const,
  budgets: (month: string) => ["budgets", month] as const,
  categories: ["tx-categories"] as const,
  paymentMethods: ["payment-methods"] as const,
  recurring: ["recurring-transactions"] as const,
  recurringAll: ["recurring-transactions", "all"] as const,
};

/** 필터에 실제 조건이 있을 때만 쿼리 키·조회에 넣는다. */
const activeFilter = (f?: TxFilter): TxFilter | undefined =>
  f && (f.type || f.categoryIds?.length || f.paymentMethodIds?.length || f.keyword?.trim()) ? f : undefined;

/** range의 from~to(포함) 내역, 최신순. filter(TX-03)는 선택 */
export function useTransactions(range: DateRange, filter?: TxFilter) {
  const f = activeFilter(filter);
  return useQuery({
    queryKey: txKeys.range(range.from, range.to, f),
    queryFn: () => listTransactions(range.from, range.to, f),
    enabled: Boolean(range.from && range.to),
  });
}

/** month: YYYY-MM */
export function useBudgets(month: string) {
  return useQuery({ queryKey: txKeys.budgets(month), queryFn: () => listBudgets(month), enabled: Boolean(month) });
}

export function useTxCategories() {
  return useQuery({ queryKey: txKeys.categories, queryFn: listTxCategories, staleTime: 5 * 60_000 });
}

export function usePaymentMethods() {
  return useQuery({ queryKey: txKeys.paymentMethods, queryFn: listPaymentMethods, staleTime: 5 * 60_000 });
}

export function useRecurringTransactions() {
  return useQuery({ queryKey: txKeys.recurring, queryFn: listRecurringTransactions });
}

/** 꺼 둔 것까지 모든 고정지출(관리 화면) */
export function useAllRecurringTransactions() {
  return useQuery({ queryKey: txKeys.recurringAll, queryFn: listAllRecurringTransactions });
}

/** 분류 이름 → 색. 색이 없는 분류는 흐린 기본색 */
export const txCategoryColorOf = (categories: TxCategory[] | undefined, name: string) =>
  categories?.find((c) => c.name === name)?.color ?? "rgb(255 255 255 / .25)";

// ── 고정지출 자동 생성 (TX-07) ────────────────────────────

/**
 * 화면을 열 때 한 번, 결제일이 지난 고정지출 회차를 만든다(DB 함수, 중복 없음).
 * 새로 생긴 내역이 있으면 내역을 다시 읽는다. 실패해도 화면은 그대로 쓴다(pg_cron이 다시 만든다).
 */
export function useGenerateRecurring() {
  const qc = useQueryClient();
  useEffect(() => {
    let cancelled = false;
    generateRecurringTransactions()
      .then((n) => {
        if (!cancelled && n > 0) void qc.invalidateQueries({ queryKey: txKeys.all });
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [qc]);
}

// ── 내역 쓰기 (TX-01) ─────────────────────────────────────

type Snapshot = [readonly unknown[], Transaction[] | undefined][];

async function patchTransactions(qc: QueryClient, patch: (list: Transaction[]) => Transaction[]): Promise<{ prev: Snapshot }> {
  await qc.cancelQueries({ queryKey: txKeys.all });
  const prev = qc.getQueriesData<Transaction[]>({ queryKey: txKeys.all });
  qc.setQueriesData<Transaction[]>({ queryKey: txKeys.all }, (list) => list && patch(list));
  return { prev };
}

const rollback = (qc: QueryClient) => (_e: unknown, _v: unknown, ctx?: { prev: Snapshot }) =>
  ctx?.prev.forEach(([key, data]) => qc.setQueryData(key, data));

/**
 * 등록(id 없음)·수정. 수정은 화면에 바로 반영한다(낙관적 업데이트).
 * repeat이면 같은 내용으로 매월 그날(말일 보정)의 고정지출도 만들고 이 내역을 첫 회차로 묶는다.
 */
export function useSaveTransaction() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, input, repeat }: { id: string | null; input: TransactionInput; repeat?: boolean }) => {
      if (id) return updateTransaction(id, input).then(() => id);
      if (!repeat) return createTransaction(input);
      const recurringId = await createRecurringTransaction({
        type: input.type,
        title: input.memo,
        amount: input.amount,
        dayOfMonth: Number(input.date.slice(8, 10)),
        categoryId: input.categoryId,
        paymentMethodId: input.paymentMethodId,
        active: true,
      });
      return createTransaction(input, recurringId);
    },
    onMutate: ({ id, input }) => {
      if (!id) return { prev: [] as Snapshot };
      const category = qc.getQueryData<TxCategory[]>(txKeys.categories)?.find((c) => c.id === input.categoryId)?.name ?? "";
      const method = qc.getQueryData<PaymentMethod[]>(txKeys.paymentMethods)?.find((m) => m.id === input.paymentMethodId)?.name ?? "";
      return patchTransactions(qc, (list) =>
        list.map((t) =>
          t.id === id
            ? {
                ...t,
                type: input.type,
                amount: input.amount,
                date: input.date,
                categoryId: input.categoryId,
                category,
                paymentMethodId: input.paymentMethodId,
                method,
                memo: input.memo.trim(),
                eventId: input.eventId,
              }
            : t,
        ),
      );
    },
    onError: rollback(qc),
    onSettled: (_d, _e, v) =>
      Promise.all([
        qc.invalidateQueries({ queryKey: txKeys.all }),
        v.repeat && qc.invalidateQueries({ queryKey: txKeys.recurring }),
        // 01 일정 상세의 연결 내역(["events", "linked", rowId])
        qc.invalidateQueries({ queryKey: ["events", "linked"] }),
      ]),
  });
}

export function useDeleteTransaction() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: deleteTransaction,
    onMutate: (id: string) => patchTransactions(qc, (list) => list.filter((t) => t.id !== id)),
    onError: rollback(qc),
    onSettled: () =>
      Promise.all([qc.invalidateQueries({ queryKey: txKeys.all }), qc.invalidateQueries({ queryKey: ["events", "linked"] })]),
  });
}

// ── 분류·결제수단 (TX-04, TX-05) ──────────────────────────
// 이름·분류가 바뀌면 내역·예산·고정지출에 보이는 이름도 바뀌므로 함께 다시 읽는다.

const invalidateMoney = (qc: QueryClient) =>
  Promise.all(
    [txKeys.categories, txKeys.paymentMethods, txKeys.all, txKeys.budgetsAll, txKeys.recurring].map((queryKey) =>
      qc.invalidateQueries({ queryKey }),
    ),
  );

export function useSaveTxCategory() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, type, name, color }: { id: string | null; type: TxType; name: string; color: string | null }) =>
      id ? updateTxCategory(id, { name, color }) : createTxCategory({ type, name, color }),
    onSettled: () => invalidateMoney(qc),
  });
}

export function useDeleteTxCategory() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, moveTo }: { id: string; moveTo: string | null }) => deleteTxCategory(id, moveTo),
    onSettled: () => invalidateMoney(qc),
  });
}

export function useSavePaymentMethod() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, type, name }: { id: string | null; type: PaymentMethod["type"]; name: string }) =>
      id ? updatePaymentMethod(id, { name, type }) : createPaymentMethod({ type, name }),
    onSettled: () => invalidateMoney(qc),
  });
}

export function useDeletePaymentMethod() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, moveTo }: { id: string; moveTo: string | null }) => deletePaymentMethod(id, moveTo),
    onSettled: () => invalidateMoney(qc),
  });
}

/** 순서 바꾸기. 목록을 바로 바꾸고 실패하면 되돌린다. */
export function useReorder(table: "tx_categories" | "payment_methods") {
  const qc = useQueryClient();
  const key = table === "tx_categories" ? txKeys.categories : txKeys.paymentMethods;
  return useMutation({
    mutationFn: (ids: string[]) => reorder(table, ids),
    onMutate: async (ids) => {
      await qc.cancelQueries({ queryKey: key });
      const prev = qc.getQueryData<{ id: string }[]>(key);
      qc.setQueryData<{ id: string }[]>(key, (list) => {
        if (!list) return list;
        const rank = new Map(ids.map((id, i) => [id, i]));
        // 다른 구분(수입/지출)의 항목은 제자리에 두고, 바뀐 항목끼리만 순서를 맞춘다.
        const slots = list.map((x, i) => (rank.has(x.id) ? i : -1)).filter((i) => i >= 0);
        const moved = list.filter((x) => rank.has(x.id)).sort((a, b) => rank.get(a.id)! - rank.get(b.id)!);
        const next = [...list];
        slots.forEach((slot, i) => (next[slot] = moved[i]));
        return next;
      });
      return { prev };
    },
    onError: (_e, _v, ctx) => ctx?.prev && qc.setQueryData(key, ctx.prev),
    onSettled: () => qc.invalidateQueries({ queryKey: key }),
  });
}

// ── 예산 (TX-06) ──────────────────────────────────────────

export function useSaveBudgets() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ month, items }: { month: string; items: { categoryId: string | null; amount: number }[] }) =>
      saveMonthBudgets(month, items),
    onSettled: () => qc.invalidateQueries({ queryKey: txKeys.budgetsAll }),
  });
}

export function useCopyBudgets() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ from, to }: { from: string; to: string }) => copyBudgets(from, to),
    onSettled: () => qc.invalidateQueries({ queryKey: txKeys.budgetsAll }),
  });
}

// ── 고정지출 관리 (TX-07) ─────────────────────────────────

/** 등록·수정. 저장 후 바로 미생성 회차를 만든다(결제일이 오늘이면 오늘 내역이 생긴다). */
export function useSaveRecurring() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, input, resumeFrom }: { id: string | null; input: RecurringInput; resumeFrom?: ISODate }) => {
      if (id) await updateRecurringTransaction(id, input, resumeFrom);
      else await createRecurringTransaction(input);
      await generateRecurringTransactions().catch(() => 0);
    },
    onSettled: () =>
      Promise.all([qc.invalidateQueries({ queryKey: txKeys.recurring }), qc.invalidateQueries({ queryKey: txKeys.all })]),
  });
}

export function useDeleteRecurring() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: deleteRecurringTransaction,
    onSettled: () => qc.invalidateQueries({ queryKey: txKeys.recurring }),
  });
}
