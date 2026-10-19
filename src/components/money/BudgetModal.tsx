"use client";

import { useState } from "react";
import { Modal, useToast } from "@/components/ui";
import { monthKey, shiftMonth } from "@/lib/date";
import { won } from "@/lib/format";
import { useBudgets, useSaveBudgets, useTxCategories } from "@/lib/hooks/use-transactions";
import type { Budget } from "@/lib/types";
import { AmountInput } from "./fields";

interface Props {
  open: boolean;
  onClose: () => void;
  y: number;
  m: number;
  /** 처음 포커스할 분류 id(분류별 예산 카드의 "예산 설정") */
  focusCategoryId?: string | null;
}

/** TX-06 · Sitemap 4.3: 월 전체·분류별 예산. 비운 칸은 예산 없음 */
export function BudgetModal({ open, onClose, y, m, focusCategoryId }: Props) {
  const month = monthKey(y, m);
  const { data: budgets, isPending } = useBudgets(month);
  if (!open) return null;
  if (isPending || !budgets) return null;
  return <BudgetForm key={month} onClose={onClose} y={y} m={m} budgets={budgets} focusCategoryId={focusCategoryId} />;
}

/** 분류 id(월 전체는 "") → 금액. 0은 예산 0원, 키가 없으면 예산 없음 */
type Amounts = Record<string, number>;

const toAmounts = (budgets: Budget[]): Amounts =>
  Object.fromEntries(budgets.map((b) => [b.categoryId ?? "", b.amount]));

function BudgetForm({
  onClose,
  y,
  m,
  budgets,
  focusCategoryId,
}: Omit<Props, "open"> & { budgets: Budget[] }) {
  const toast = useToast();
  const month = monthKey(y, m);
  const prev = shiftMonth(y, m, -1);
  const { data: categories = [] } = useTxCategories();
  const { data: prevBudgets = [] } = useBudgets(monthKey(prev.y, prev.m));
  const save = useSaveBudgets();
  const [amounts, setAmounts] = useState<Amounts>(() => toAmounts(budgets));

  const expenseCategories = categories.filter((c) => c.type === "expense");
  const perCategorySum = expenseCategories.reduce((s, c) => s + (amounts[c.id] ?? 0), 0);
  const total = amounts[""];

  const setAmount = (key: string, n: number) =>
    setAmounts((a) => {
      const next = { ...a };
      if (n > 0) next[key] = n;
      else delete next[key];
      return next;
    });

  const copyPrev = () => {
    if (!prevBudgets.length) return toast.error(`${prev.m}월에 설정한 예산이 없어요.`);
    setAmounts(toAmounts(prevBudgets));
    toast.success(`${prev.m}월 예산을 불러왔어요. 저장하면 적용돼요.`);
  };

  const submit = () => {
    if (save.isPending) return;
    // 지운 분류의 예산은 함께 빼고 저장한다.
    const valid = new Set(["", ...expenseCategories.map((c) => c.id)]);
    const items = Object.entries(amounts)
      .filter(([k]) => valid.has(k))
      .map(([k, amount]) => ({ categoryId: k || null, amount }));
    save.mutate(
      { month, items },
      {
        onSuccess: () => {
          toast.success(`${m}월 예산을 저장했어요.`);
          onClose();
        },
        onError: () => toast.error("예산을 저장하지 못했어요."),
      },
    );
  };

  return (
    <Modal
      open
      onClose={onClose}
      title={`${y}년 ${m}월 예산`}
      subtitle="비워 두면 예산 없음 · 80% 주의, 100% 초과로 표시돼요"
      width={480}
      footer={
        <>
          <button type="button" onClick={copyPrev} className="pill px-4 py-2.5 text-[13px]">
            {prev.m}월 예산 복사
          </button>
          <button type="button" onClick={onClose} className="pill ml-auto px-4 py-2.5 text-[13px]">
            취소
          </button>
          <button type="button" onClick={submit} disabled={save.isPending} className="pill pill-accent px-5 py-2.5 text-[13px] disabled:opacity-45">
            {save.isPending ? "저장 중…" : "저장"}
          </button>
        </>
      }
    >
      <div className="flex flex-col gap-1.5 text-xs text-muted">
        월 전체 예산
        <AmountInput label="월 전체 예산" autoFocus={!focusCategoryId} value={total ?? 0} onChange={(n) => setAmount("", n)} />
        <span className="text-[11px] text-subtle">
          {total == null
            ? perCategorySum
              ? `비워 두면 분류별 예산의 합 ${won(perCategorySum)}을 월 예산으로 써요.`
              : "월 전체 예산이 없어요."
            : perCategorySum > total
              ? `분류별 예산의 합(${won(perCategorySum)})이 월 예산보다 커요.`
              : `분류별 예산 합 ${won(perCategorySum)}`}
        </span>
      </div>
      <div className="flex flex-col gap-2">
        <span className="text-xs text-muted">분류별 예산</span>
        {expenseCategories.map((c) => (
          <div key={c.id} className="grid grid-cols-[minmax(0,1fr)_180px] items-center gap-3">
            <span className="flex items-center gap-2 text-[13px]">
              <span className="size-2 flex-none rounded-full" style={{ background: c.color ?? "rgb(255 255 255 / .25)" }} />
              {c.name}
            </span>
            <AmountInput label={`${c.name} 예산`} autoFocus={focusCategoryId === c.id} value={amounts[c.id] ?? 0} onChange={(n) => setAmount(c.id, n)} />
          </div>
        ))}
      </div>
    </Modal>
  );
}
