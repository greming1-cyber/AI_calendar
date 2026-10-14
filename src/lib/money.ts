// 가계부 집계. 홈 대시보드와 가계부 화면이 같은 계산을 쓴다.
import { addDays, isoDate, parts, shiftMonth, weekday } from "./date";
import type { Budget, ISODate, RecurringTransaction, Transaction } from "./types";

const inMonth = (t: Transaction, y: number, m: number) => {
  const p = parts(t.date);
  return p.y === y && p.m === m;
};

export const monthTotals = (txs: Transaction[], y: number, m: number) => {
  const list = txs.filter((t) => inMonth(t, y, m));
  const sum = (type: Transaction["type"]) => list.filter((t) => t.type === type).reduce((s, t) => s + t.amount, 0);
  const income = sum("income");
  const expense = sum("expense");
  return { list, income, expense, balance: income - expense, incomeCount: list.filter((t) => t.type === "income").length };
};

export const expenseByCategory = (txs: Transaction[]) => {
  const map = new Map<string, number>();
  for (const t of txs) if (t.type === "expense") map.set(t.category, (map.get(t.category) ?? 0) + t.amount);
  return map;
};

/**
 * 예산 대비 사용. budgets에서 category가 null인 항목이 월 전체 예산이고,
 * 없으면 분류별 예산의 합을 전체 예산으로 본다.
 */
export const budgetStatus = (txs: Transaction[], budgets: Budget[]) => {
  const byCat = expenseByCategory(txs);
  const spent = [...byCat.values()].reduce((s, v) => s + v, 0);
  const perCategory = budgets.filter((b): b is Budget & { category: string } => b.category != null);
  const total = budgets.find((b) => b.category == null)?.amount ?? perCategory.reduce((s, b) => s + b.amount, 0);
  return {
    total,
    spent,
    left: total - spent,
    ratio: total ? spent / total : 0,
    categories: perCategory.map((b) => {
      const used = byCat.get(b.category) ?? 0;
      return { category: b.category, used, limit: b.amount, ratio: b.amount ? used / b.amount : 0 };
    }),
  };
};

/** 예산 80% 이상이면 주의 */
export const BUDGET_WARN = 0.8;

export const dailyExpense = (txs: Transaction[], date: ISODate) =>
  txs.filter((t) => t.type === "expense" && t.date === date).reduce((s, t) => s + t.amount, 0);

/** 기준일 포함 최근 n일 지출 */
export const recentDays = (txs: Transaction[], today: ISODate, n = 7) =>
  Array.from({ length: n }, (_, i) => {
    const date = addDays(today, i - n + 1);
    return { date, label: weekday(date), amount: dailyExpense(txs, date) };
  });

/** 날짜별 그룹 (최신순) */
export const groupByDate = (txs: Transaction[]) => {
  const map = new Map<ISODate, Transaction[]>();
  for (const t of [...txs].sort((a, b) => b.date.localeCompare(a.date))) {
    map.set(t.date, [...(map.get(t.date) ?? []), t]);
  }
  return [...map.entries()].map(([date, items]) => ({
    date,
    items,
    net: items.reduce((s, t) => s + (t.type === "income" ? t.amount : -t.amount), 0),
  }));
};

/** 지난 달 1일~(오늘과 같은 날짜) 지출. 전월 같은 기간 대비 증감용 */
export const prevMonthSamePeriodExpense = (txs: Transaction[], today: ISODate) => {
  const { y, m, d } = parts(today);
  const from = isoDate(y, m - 1, 1);
  const lastDay = parts(isoDate(y, m, 0)).d;
  const to = isoDate(y, m - 1, Math.min(d, lastDay));
  return txs.filter((t) => t.type === "expense" && t.date >= from && t.date <= to).reduce((s, t) => s + t.amount, 0);
};

/** 고정지출의 다음 결제일(오늘 이후, 이번 달 또는 다음 달). 말일을 넘는 날짜는 그 달 말일로 */
export const nextOccurrence = (r: RecurringTransaction, today: ISODate): ISODate => {
  const { y, m } = parts(today);
  const on = (yy: number, mm: number) => {
    const last = parts(isoDate(yy, mm + 1, 0)).d;
    return isoDate(yy, mm, Math.min(r.dayOfMonth, last));
  };
  const thisMonth = on(y, m);
  if (thisMonth > today) return thisMonth;
  const next = shiftMonth(y, m, 1);
  return on(next.y, next.m);
};
