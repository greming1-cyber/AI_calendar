"use client";

import { useState } from "react";
import { CardHead, ErrorState, LoadingState, ProgressBar, Segmented } from "@/components/ui";
import { isoDate, monthKey, monthRange, parts, shiftMonth, weekday } from "@/lib/date";
import { manwon, pct, signedWon, won } from "@/lib/format";
import { useToday } from "@/lib/hooks/use-today";
import {
  txCategoryColorOf,
  useBudgets,
  useRecurringTransactions,
  useTransactions,
  useTxCategories,
} from "@/lib/hooks/use-transactions";
import {
  BUDGET_WARN,
  budgetStatus,
  expenseByCategory,
  groupByDate,
  monthTotals,
  nextOccurrence,
  prevMonthSamePeriodExpense,
} from "@/lib/money";

const OTHER_COLOR = "rgb(255 255 255 / .25)";
const TREND_MONTHS = 6;

export function MoneyView() {
  const todayIso = useToday();
  const today = parts(todayIso);
  const [cursor, setCursor] = useState({ y: today.y, m: today.m });
  const isCurrent = cursor.y === today.y && cursor.m === today.m;

  const monthQuery = useTransactions(monthRange(cursor.y, cursor.m));
  // 월별 추이(최근 6개월)와 전월 같은 기간 비교용
  const trendStart = shiftMonth(today.y, today.m, -(TREND_MONTHS - 1));
  const trendQuery = useTransactions({ from: isoDate(trendStart.y, trendStart.m, 1), to: monthRange(today.y, today.m).to });
  const budgetsQuery = useBudgets(monthKey(cursor.y, cursor.m));
  const { data: categories } = useTxCategories();
  const { data: recurring } = useRecurringTransactions();

  const queries = [monthQuery, trendQuery, budgetsQuery];
  if (queries.some((q) => q.isPending)) return <LoadingState />;
  if (queries.some((q) => q.isError)) return <ErrorState retry={() => queries.forEach((q) => q.refetch())} />;
  const color = (name: string) => txCategoryColorOf(categories, name);

  const month = monthTotals(monthQuery.data ?? [], cursor.y, cursor.m);
  const expenses = month.list.filter((t) => t.type === "expense");
  const budget = budgetStatus(expenses, budgetsQuery.data ?? []);
  const groups = groupByDate(month.list);
  const prevExpense = prevMonthSamePeriodExpense(trendQuery.data ?? [], todayIso);
  const change = prevExpense ? Math.round(((month.expense - prevExpense) / prevExpense) * 1000) / 10 : null;
  const upcoming = (recurring ?? [])
    .filter((r) => r.type === "expense")
    .map((r) => ({ ...r, date: nextOccurrence(r, todayIso) }))
    .filter((r) => parts(r.date).m === today.m);

  // TX-08: 상위 4개 분류 + 기타
  const byCat = [...expenseByCategory(expenses).entries()].sort((a, b) => b[1] - a[1]);
  const share = [
    ...byCat.slice(0, 4).map(([name, v]) => ({ name: name || "분류 없음", value: v, color: color(name) })),
    ...(byCat.length > 4 ? [{ name: "기타", value: byCat.slice(4).reduce((s, [, v]) => s + v, 0), color: OTHER_COLOR }] : []),
  ];
  let acc = 0;
  const conic = share
    .map((s) => {
      const from = acc;
      acc += (s.value / (month.expense || 1)) * 100;
      return `${s.color} ${from}% ${acc}%`;
    })
    .join(",");

  const trend = Array.from({ length: TREND_MONTHS }, (_, i) => {
    const t = shiftMonth(trendStart.y, trendStart.m, i);
    return { label: `${t.m}월`, ...monthTotals(trendQuery.data ?? [], t.y, t.m) };
  });
  const trendMax = Math.max(...trend.flatMap((t) => [t.income, t.expense]), 1);
  return (
    <main className="flex flex-col gap-3 px-4 pb-7 md:px-7">
      <div className="flex flex-wrap items-center gap-3">
        <span className="text-2xl font-bold">가계부</span>
        <div className="flex items-center gap-1 text-sm text-muted">
          <button type="button" aria-label="이전 달" onClick={() => setCursor((c) => shiftMonth(c.y, c.m, -1))} className="px-1">
            ‹
          </button>
          {cursor.y}년 {cursor.m}월
          <button type="button" aria-label="다음 달" onClick={() => setCursor((c) => shiftMonth(c.y, c.m, 1))} className="px-1">
            ›
          </button>
        </div>
        <div className="sm:ml-2">
          <Segmented
            options={[
              { value: "daily", label: "일별" },
              { value: "monthly", label: "월별" },
            ]}
            value="daily"
            disabled={["monthly"]}
          />
        </div>
        <span className="pill ml-auto px-3 py-[7px]">필터 · 전체 분류 · 전체 결제수단</span>
        <span className="pill pill-accent">+ 내역</span>
      </div>

      <div className="grid grid-cols-[repeat(auto-fill,minmax(240px,1fr))] gap-3">
        <section className="card card-flat gap-1.5">
          <span className="text-[13px] text-muted">수입</span>
          <span className="text-[26px] font-semibold">{won(month.income)}</span>
          <span className="text-[11px] text-subtle">
            {month.incomeCount ? `${month.incomeCount}건` : "내역 없음"}
          </span>
        </section>
        <section className="card card-flat gap-1.5">
          <span className="text-[13px] text-muted">지출</span>
          <span className="text-[26px] font-semibold">{won(month.expense)}</span>
          {isCurrent && change != null && (
            <span className="text-[11px] text-accent">
              전월 같은 기간 대비 {change > 0 ? "+" : ""}
              {change}%
            </span>
          )}
        </section>
        <section className="card card-flat gap-1.5">
          <span className="text-[13px] text-muted">잔액</span>
          <span className="text-[26px] font-semibold">{won(month.balance)}</span>
          {isCurrent && upcoming.length > 0 && (
            <span className="text-[11px] text-subtle">
              고정지출 결제 예정 {upcoming.length}건 · {won(upcoming.reduce((s, f) => s + f.amount, 0))}
            </span>
          )}
        </section>

        {/* TX-06 */}
        <section className="card card-warm gap-3">
          <CardHead title="분류별 예산" meta={`${pct(budget.spent, budget.total)}% 사용`} />
          {budget.categories.map((b) => {
            const warn = b.ratio > BUDGET_WARN;
            return (
              <div key={b.category} className="flex flex-col gap-[5px]">
                <div className="flex justify-between text-xs">
                  <span>{b.category}</span>
                  <span style={{ color: warn ? "oklch(0.78 0.14 40)" : "var(--color-muted)" }}>
                    {manwon(b.used)} / {manwon(b.limit)}
                  </span>
                </div>
                <ProgressBar percent={b.ratio * 100} color={warn ? "oklch(0.7 0.17 35)" : "rgb(242 238 232 / .75)"} />
              </div>
            );
          })}
          {budget.categories
            .filter((b) => b.ratio >= BUDGET_WARN)
            .slice(0, 1)
            .map((b) => (
              <div key={b.category} className="mt-auto border-t border-white/[.08] pt-2.5 text-[11px] text-muted">
                {b.category} 예산 {Math.round(b.ratio * 100)}% 사용 · 초과 시 알림을 보내요
              </div>
            ))}
        </section>

        <div className="col-span-full grid grid-cols-[repeat(auto-fit,minmax(260px,1fr))] gap-3">
          {/* TX-02 */}
          <section className="card card-flat max-h-[430px] gap-2 overflow-auto">
            <CardHead title="내역" meta="CSV 내보내기" />
            {!groups.length && <span className="py-6 text-[13px] text-subtle">이 달의 내역이 없어요.</span>}
            {groups.map((g) => (
              <div key={g.date} className="flex flex-col">
                <div className="flex justify-between pt-2 text-xs text-subtle">
                  <span>
                    {parts(g.date).m}월 {parts(g.date).d}일 {weekday(g.date)}
                  </span>
                  <span>{signedWon(g.net)}</span>
                </div>
                {g.items.map((x) => (
                  <div key={x.id} className="grid grid-cols-[34px_minmax(0,1fr)_auto] items-center gap-3 border-b border-white/[.06] py-[7px]">
                    <span
                      className="flex size-[34px] items-center justify-center rounded-full text-[11px]"
                      style={{ background: `color-mix(in oklch, ${color(x.category)} 40%, #1c1a18)` }}
                    >
                      {x.category.slice(0, 2)}
                    </span>
                    <div className="flex min-w-0 flex-col gap-0.5">
                      <span className="truncate text-sm">{x.memo}</span>
                      <span className="text-[11px] text-subtle">
                        {x.category} · {x.method}
                        {x.viaClaude ? " · Claude" : ""}
                      </span>
                    </div>
                    <span
                      className="text-sm font-semibold whitespace-nowrap"
                      style={{ color: x.type === "income" ? "var(--color-income)" : "var(--color-fg)" }}
                    >
                      {signedWon(x.type === "income" ? x.amount : -x.amount)}
                    </span>
                  </div>
                ))}
              </div>
            ))}
          </section>

          {/* TX-08: 분류별 지출 */}
          <section className="card card-flat gap-3.5">
            <span className="text-[15px] font-semibold">분류별 지출</span>
            <div
              className="relative size-[150px] self-center rounded-full"
              style={{ background: month.expense ? `conic-gradient(${conic})` : "rgb(255 255 255 / .08)" }}
            >
              <div className="absolute inset-[22px] flex flex-col items-center justify-center rounded-full bg-panel">
                <span className="text-[11px] text-subtle">지출</span>
                <span className="text-base font-bold">{Math.round(month.expense / 10000)}만원</span>
              </div>
            </div>
            <div className="flex flex-col gap-[7px]">
              {share.map((s) => (
                <div key={s.name} className="flex items-center gap-2 text-xs">
                  <span className="size-2 rounded-xs" style={{ background: s.color }} />
                  {s.name}
                  <span className="ml-auto text-muted">{pct(s.value, month.expense)}%</span>
                </div>
              ))}
            </div>
          </section>

          {/* TX-08: 월별 추이 */}
          <section className="card card-flat gap-2.5">
            <CardHead title="월별 추이" meta="수입 · 지출" />
            <div className="flex min-h-[180px] flex-1 items-end gap-2">
              {trend.map((t, i) => (
                <div key={t.label} className="flex h-full flex-1 flex-col items-center justify-end gap-1.5" title={`수입 ${won(t.income)} · 지출 ${won(t.expense)}`}>
                  <div className="flex h-full w-full items-end gap-[3px]">
                    <div className="flex-1 rounded-[3px] bg-white/[.22]" style={{ height: `${(t.income / trendMax) * 100}%` }} />
                    <div
                      className="flex-1 rounded-[3px]"
                      style={{
                        height: `${(t.expense / trendMax) * 100}%`,
                        background: i === trend.length - 1 ? "var(--color-accent)" : "rgb(242 238 232 / .6)",
                      }}
                    />
                  </div>
                  <span className="text-[10px] text-subtle">{t.label}</span>
                </div>
              ))}
            </div>
          </section>
        </div>
      </div>
    </main>
  );
}
