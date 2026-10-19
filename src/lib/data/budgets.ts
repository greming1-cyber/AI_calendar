// 예산 데이터 계층. 조회 함수 시그니처는 공유 계약이므로 바꾸지 않는다.
import { createClient } from "@/lib/supabase/client";
import type { Budget } from "@/lib/types";

/** month(YYYY-MM)의 예산. category가 null인 항목이 월 전체 예산 */
export async function listBudgets(month: string): Promise<Budget[]> {
  const { data, error } = await createClient()
    .from("budgets")
    .select("amount, category_id, tx_categories(name, sort_order)")
    .eq("month", month);
  if (error) throw error;
  return data
    .map((b) => ({
      category: b.tx_categories?.name ?? null,
      categoryId: b.category_id,
      amount: b.amount,
      order: b.tx_categories?.sort_order ?? -1,
    }))
    .sort((a, b) => a.order - b.order)
    .map(({ category, categoryId, amount }) => ({ category, categoryId, amount }));
}

/** TX-06: 예산 설정. categoryId가 null이면 월 전체 예산. amount가 null이면 그 예산을 지운다. */
export async function upsertBudget(month: string, categoryId: string | null, amount: number | null) {
  const supabase = createClient();
  if (amount == null) {
    let q = supabase.from("budgets").delete().eq("month", month);
    q = categoryId ? q.eq("category_id", categoryId) : q.is("category_id", null);
    const { error } = await q;
    if (error) throw error;
    return;
  }
  if (!Number.isSafeInteger(amount) || amount < 0) throw new Error("예산은 0원 이상의 정수여야 합니다.");
  // unique nulls not distinct (user_id, month, category_id)
  const { error } = await supabase
    .from("budgets")
    .upsert({ month, category_id: categoryId, amount }, { onConflict: "user_id,month,category_id" });
  if (error) throw error;
}

/** 한 달 예산을 통째로 저장한다. 목록에 없는 기존 예산은 지운다. */
export async function saveMonthBudgets(month: string, items: { categoryId: string | null; amount: number }[]) {
  const supabase = createClient();
  for (const b of items) {
    if (!Number.isSafeInteger(b.amount) || b.amount < 0) throw new Error("예산은 0원 이상의 정수여야 합니다.");
  }
  // 먼저 넣거나 고치고(실패해도 기존 예산은 남는다), 그다음 빠진 것을 지운다.
  if (items.length) {
    const { error } = await supabase
      .from("budgets")
      .upsert(
        items.map((b) => ({ month, category_id: b.categoryId, amount: b.amount })),
        { onConflict: "user_id,month,category_id" },
      );
    if (error) throw error;
  }
  const { data: existing, error: listError } = await supabase.from("budgets").select("id, category_id").eq("month", month);
  if (listError) throw listError;
  const keep = new Set(items.map((b) => b.categoryId));
  const stale = existing.filter((b) => !keep.has(b.category_id)).map((b) => b.id);
  if (stale.length) {
    const { error } = await supabase.from("budgets").delete().in("id", stale);
    if (error) throw error;
  }
}

/** from 달의 예산을 to 달로 복사한다(to 달의 기존 예산은 바뀐다). 복사한 건수 */
export async function copyBudgets(from: string, to: string): Promise<number> {
  const source = await listBudgets(from);
  await saveMonthBudgets(
    to,
    source.map((b) => ({ categoryId: b.categoryId ?? null, amount: b.amount })),
  );
  return source.length;
}
