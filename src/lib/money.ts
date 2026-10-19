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

/**
 * 전월 같은 기간 대비 지출 증감. current는 이번 달 1일~오늘, prev는 지난 달 1일~같은 날짜.
 * changePct는 소수 첫째 자리 퍼센트, 지난 달 지출이 없으면 null
 */
export const compareToPrevMonth = (txs: Transaction[], today: ISODate) => {
  const { y, m } = parts(today);
  const from = isoDate(y, m, 1);
  const current = txs.filter((t) => t.type === "expense" && t.date >= from && t.date <= today).reduce((s, t) => s + t.amount, 0);
  const prev = prevMonthSamePeriodExpense(txs, today);
  return { current, prev, changePct: prev ? Math.round(((current - prev) / prev) * 1000) / 10 : null };
};

/** 예산 사용률 단계: 80% 이상 주의, 100% 이상 초과 */
export const budgetLevel = (ratio: number): "ok" | "warn" | "over" =>
  ratio >= 1 ? "over" : ratio >= BUDGET_WARN ? "warn" : "ok";

/** start(y, m)부터 n개월의 월별 합계(월별 보기·추이) */
export const monthlySeries = (txs: Transaction[], y: number, m: number, n: number) =>
  Array.from({ length: n }, (_, i) => {
    const t = shiftMonth(y, m, i);
    const { income, expense, balance, list } = monthTotals(txs, t.y, t.m);
    return { y: t.y, m: t.m, income, expense, balance, count: list.length };
  });

const csvCell = (v: string | number) => {
  // 글자 칸이 =, +, -, @로 시작하면 엑셀이 수식으로 읽으므로 앞에 '를 붙인다.
  const s = typeof v === "string" && /^[=+\-@\t\r]/.test(v) ? `'${v}` : String(v);
  return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

/** SET-04: 내역 CSV. 엑셀에서 한글이 깨지지 않도록 UTF-8 BOM을 붙인다. 날짜 오름차순 */
export const transactionsCsv = (txs: Transaction[]) => {
  const header = ["날짜", "구분", "분류", "결제수단", "메모", "금액"];
  const rows = [...txs]
    .sort((a, b) => a.date.localeCompare(b.date))
    .map((t) => [t.date, t.type === "income" ? "수입" : "지출", t.category, t.method, t.memo, t.type === "income" ? t.amount : -t.amount]);
  return "﻿" + [header, ...rows].map((r) => r.map(csvCell).join(",")).join("\r\n") + "\r\n";
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
