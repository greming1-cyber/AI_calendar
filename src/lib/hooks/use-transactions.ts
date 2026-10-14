"use client";

import { useQuery } from "@tanstack/react-query";
import { listBudgets } from "@/lib/data/budgets";
import { listPaymentMethods, listRecurringTransactions, listTransactions, listTxCategories } from "@/lib/data/transactions";
import type { DateRange, TxCategory } from "@/lib/types";

export const txKeys = {
  all: ["transactions"] as const,
  range: (from: string, to: string) => ["transactions", from, to] as const,
  budgets: (month: string) => ["budgets", month] as const,
  categories: ["tx-categories"] as const,
  paymentMethods: ["payment-methods"] as const,
  recurring: ["recurring-transactions"] as const,
};

/** range의 from~to(포함) 내역, 최신순 */
export function useTransactions(range: DateRange) {
  return useQuery({
    queryKey: txKeys.range(range.from, range.to),
    queryFn: () => listTransactions(range.from, range.to),
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

/** 분류 이름 → 색. 색이 없는 분류는 흐린 기본색 */
export const txCategoryColorOf = (categories: TxCategory[] | undefined, name: string) =>
  categories?.find((c) => c.name === name)?.color ?? "rgb(255 255 255 / .25)";

// TODO(03): 등록·수정·삭제 뮤테이션(useSaveTransaction 등)
