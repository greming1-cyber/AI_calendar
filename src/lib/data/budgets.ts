// 예산 데이터 계층. 조회 함수 시그니처는 공유 계약이므로 바꾸지 않는다.
import { createClient } from "@/lib/supabase/client";
import type { Budget } from "@/lib/types";

/** month(YYYY-MM)의 예산. category가 null인 항목이 월 전체 예산 */
export async function listBudgets(month: string): Promise<Budget[]> {
  const { data, error } = await createClient()
    .from("budgets")
    .select("amount, tx_categories(name, sort_order)")
    .eq("month", month);
  if (error) throw error;
  return data
    .map((b) => ({ category: b.tx_categories?.name ?? null, amount: b.amount, order: b.tx_categories?.sort_order ?? -1 }))
    .sort((a, b) => a.order - b.order)
    .map(({ category, amount }) => ({ category, amount }));
}

// TODO(03): 예산 설정(TX-06)
