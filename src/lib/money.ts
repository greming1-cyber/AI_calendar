// 가계부 집계. 홈 대시보드와 가계부 화면이 같은 계산을 쓴다.
import { addDays, parts, weekday } from "./date";
import { BUDGETS, MONTHLY_BUDGET } from "./mock-data";
import type { ISODate, Transaction } from "./types";

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

export const budgetStatus = (txs: Transaction[]) => {
  const byCat = expenseByCategory(txs);
  const spent = [...byCat.values()].reduce((s, v) => s + v, 0);
  return {
    total: MONTHLY_BUDGET,
    spent,
    left: MONTHLY_BUDGET - spent,
    ratio: spent / MONTHLY_BUDGET,
    categories: BUDGETS.map((b) => {
      const used = byCat.get(b.category) ?? 0;
      return { category: b.category, used, limit: b.amount, ratio: used / b.amount };
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
