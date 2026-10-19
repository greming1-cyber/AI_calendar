"use client";

import { useState } from "react";
import { CardHead, ErrorState, LoadingState, ProgressBar, Segmented, useToast } from "@/components/ui";
import { monthKey, monthRange, parts, shiftMonth, shortLabel, weekday } from "@/lib/date";
import { manwon, pct, signedWon, won } from "@/lib/format";
import { useToday } from "@/lib/hooks/use-today";
import {
  txCategoryColorOf,
  useBudgets,
  useGenerateRecurring,
  usePaymentMethods,
  useRecurringTransactions,
  useTransactions,
  useTxCategories,
} from "@/lib/hooks/use-transactions";
import {
  budgetLevel,
  budgetStatus,
  compareToPrevMonth,
  expenseByCategory,
  groupByDate,
  monthlySeries,
  monthTotals,
  nextOccurrence,
  transactionsCsv,
} from "@/lib/money";
import type { Transaction, TxCategory } from "@/lib/types";
import { BudgetModal } from "./BudgetModal";
import { ActiveFilterPills, EMPTY_FILTER, FilterPanel, isFiltered, type MoneyFilter } from "./FilterPanel";
import { ManageModal, type ManageTab } from "./ManageModal";
import { TransactionModal } from "./TransactionModal";

const OTHER_COLOR = "rgb(255 255 255 / .25)";
const TREND_MONTHS = 6;
const LEVEL_COLOR = { ok: "rgb(242 238 232 / .75)", warn: "var(--color-accent)", over: "var(--color-danger)" } as const;

type View = "daily" | "monthly";

const totalsOf = (list: Transaction[]) => {
  const sum = (type: Transaction["type"]) => list.filter((t) => t.type === type).reduce((s, t) => s + t.amount, 0);
  const income = sum("income");
  const expense = sum("expense");
  return {
    income,
    expense,
    balance: income - expense,
    incomeCount: list.filter((t) => t.type === "income").length,
    expenseCount: list.filter((t) => t.type === "expense").length,
  };
};

function downloadCsv(list: Transaction[], name: string) {
  const url = URL.createObjectURL(new Blob([transactionsCsv(list)], { type: "text/csv;charset=utf-8" }));
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function MoneyView() {
  useGenerateRecurring();
  const toast = useToast();
  const todayIso = useToday();
  const today = parts(todayIso);
  const [cursor, setCursor] = useState({ y: today.y, m: today.m });
  const [view, setView] = useState<View>("daily");
  const [filter, setFilter] = useState<MoneyFilter>(EMPTY_FILTER);
  const [filterOpen, setFilterOpen] = useState(false);
  const [txModal, setTxModal] = useState<{ tx?: Transaction } | null>(null);
  const [budgetModal, setBudgetModal] = useState<{ focus?: string | null } | null>(null);
  const [manage, setManage] = useState<ManageTab | null>(null);
  const isCurrent = cursor.y === today.y && cursor.m === today.m;
  const filtered = isFiltered(filter);

  const month = monthRange(cursor.y, cursor.m);
  const listRange = filter.period ?? month;
  const monthQuery = useTransactions(month);
  // 필터가 없으면 monthQuery와 같은 쿼리 키라 한 번만 읽는다.
  const listQuery = useTransactions(listRange, filter);
  // 월별 추이: 보고 있는 달까지 6개월. 이번 달이면 전월 같은 기간 비교에도 쓴다.
  const trendStart = shiftMonth(cursor.y, cursor.m, -(TREND_MONTHS - 1));
  const trendQuery = useTransactions({ from: monthRange(trendStart.y, trendStart.m).from, to: month.to });
  const yearQuery = useTransactions(view === "monthly" ? { from: `${cursor.y}-01-01`, to: `${cursor.y}-12-31` } : { from: "", to: "" });
  const budgetsQuery = useBudgets(monthKey(cursor.y, cursor.m));
  const { data: categories = [] } = useTxCategories();
  const { data: methods = [] } = usePaymentMethods();
  const { data: recurring } = useRecurringTransactions();

  const queries = [monthQuery, listQuery, budgetsQuery];
  const header = (
    <Header
      cursor={cursor}
      setCursor={setCursor}
      view={view}
      setView={setView}
      filtered={filtered}
      filterOpen={filterOpen}
      toggleFilter={() => setFilterOpen((v) => !v)}
      onAdd={() => setTxModal({})}
      onBudget={() => setBudgetModal({})}
      onManage={() => setManage("expense")}
    />
  );
  const modals = (
    <>
      <TransactionModal
        open={Boolean(txModal)}
        onClose={() => setTxModal(null)}
        transaction={txModal?.tx}
        initial={txModal && !txModal.tx && !isCurrent ? { date: month.from } : undefined}
      />
      <BudgetModal open={Boolean(budgetModal)} onClose={() => setBudgetModal(null)} y={cursor.y} m={cursor.m} focusCategoryId={budgetModal?.focus} />
      <ManageModal key={manage ?? "closed"} open={Boolean(manage)} onClose={() => setManage(null)} tab={manage ?? undefined} />
    </>
  );

  if (queries.some((q) => q.isPending))
    return (
      <main className="flex flex-col gap-3 px-4 pb-7 md:px-7">
        {header}
        <LoadingState />
      </main>
    );
  if (queries.some((q) => q.isError))
    return (
      <main className="flex flex-col gap-3 px-4 pb-7 md:px-7">
        {header}
        <ErrorState retry={() => queries.forEach((q) => q.refetch())} />
      </main>
    );

  const color = (name: string) => txCategoryColorOf(categories, name);
  const list = listQuery.data ?? [];
  const totals = totalsOf(list);
  const monthExpenses = monthTotals(monthQuery.data ?? [], cursor.y, cursor.m).list.filter((t) => t.type === "expense");
  const budget = budgetStatus(monthExpenses, budgetsQuery.data ?? []);
  const compare = isCurrent && !filtered ? compareToPrevMonth(trendQuery.data ?? [], todayIso) : null;
  const upcoming = (recurring ?? [])
    .filter((r) => r.type === "expense")
    .map((r) => ({ ...r, date: nextOccurrence(r, todayIso) }))
    .filter((r) => parts(r.date).m === today.m);
  const label = filtered ? "조건" : `${cursor.m}월`;

  const exportCsv = () => {
    if (!list.length) return toast.error("내보낼 내역이 없어요.");
    const name = filter.period ? `가계부_${filter.period.from}_${filter.period.to}.csv` : `가계부_${monthKey(cursor.y, cursor.m)}.csv`;
    downloadCsv(list, name);
    toast.success(`${list.length}건을 CSV로 내보냈어요.`);
  };

  return (
    <main className="flex flex-col gap-3 px-4 pb-7 md:px-7">
      {header}
      {filterOpen && (
        <FilterPanel
          value={filter}
          monthRange={month}
          categories={categories}
          methods={methods}
          onApply={(f) => {
            setFilter(f);
            setFilterOpen(false);
          }}
          onClose={() => setFilterOpen(false)}
        />
      )}
      <ActiveFilterPills filter={filter} categories={categories} methods={methods} onChange={setFilter} />

      <div className="grid grid-cols-[repeat(auto-fill,minmax(240px,1fr))] gap-3">
        <section className="card card-flat gap-1.5">
          <span className="text-[13px] text-muted">{label} 수입</span>
          <span className="text-[26px] font-semibold">{won(totals.income)}</span>
          <span className="text-[11px] text-subtle">{totals.incomeCount ? `${totals.incomeCount}건` : "내역 없음"}</span>
        </section>
        <section className="card card-flat gap-1.5">
          <span className="text-[13px] text-muted">{label} 지출</span>
          <span className="text-[26px] font-semibold">{won(totals.expense)}</span>
          {compare?.changePct != null ? (
            <span className="text-[11px] text-accent">
              전월 같은 기간 대비 {compare.changePct > 0 ? "+" : ""}
              {compare.changePct}%
            </span>
          ) : (
            <span className="text-[11px] text-subtle">{totals.expenseCount ? `${totals.expenseCount}건` : "내역 없음"}</span>
          )}
        </section>
        <section className="card card-flat gap-1.5">
          <span className="text-[13px] text-muted">{label} 잔액</span>
          <span className="text-[26px] font-semibold">{signedWon(totals.balance)}</span>
          {isCurrent && !filtered && upcoming.length > 0 && (
            <button type="button" onClick={() => setManage("recurring")} className="text-left text-[11px] text-subtle hover:text-fg">
              고정지출 결제 예정 {upcoming.length}건 · {won(upcoming.reduce((s, f) => s + f.amount, 0))}
            </button>
          )}
        </section>

        <BudgetCard
          budget={budget}
          categories={categories}
          spentByCategory={expenseByCategory(monthExpenses)}
          month={cursor.m}
          onEdit={(focus) => setBudgetModal({ focus })}
        />

        {view === "daily" ? (
          <div className="col-span-full grid grid-cols-[repeat(auto-fit,minmax(260px,1fr))] gap-3">
            <TransactionList list={list} filtered={filtered} color={color} onOpen={(tx) => setTxModal({ tx })} onAdd={() => setTxModal({})} onExport={exportCsv} />
            <CategoryShare list={list} expense={totals.expense} color={color} />
            <TrendCard query={trendQuery} start={trendStart} />
          </div>
        ) : (
          <div className="col-span-full grid grid-cols-[repeat(auto-fit,minmax(300px,1fr))] gap-3">
            <MonthlyTable
              y={cursor.y}
              query={yearQuery}
              current={cursor.m}
              onPick={(m) => {
                setCursor({ y: cursor.y, m });
                setView("daily");
              }}
            />
            <TrendCard query={trendQuery} start={trendStart} />
          </div>
        )}
      </div>
      {modals}
    </main>
  );
}

// ── 머리 ─────────────────────────────────────────────────

function Header({
  cursor,
  setCursor,
  view,
  setView,
  filtered,
  filterOpen,
  toggleFilter,
  onAdd,
  onBudget,
  onManage,
}: {
  cursor: { y: number; m: number };
  setCursor: (f: (c: { y: number; m: number }) => { y: number; m: number }) => void;
  view: View;
  setView: (v: View) => void;
  filtered: boolean;
  filterOpen: boolean;
  toggleFilter: () => void;
  onAdd: () => void;
  onBudget: () => void;
  onManage: () => void;
}) {
  return (
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
          value={view}
          onChange={setView}
        />
      </div>
      <div className="ml-auto flex flex-wrap gap-2">
        <button
          type="button"
          aria-expanded={filterOpen}
          onClick={toggleFilter}
          className={`pill px-3 py-[7px] ${filtered ? "bg-fg text-ink" : ""}`}
        >
          필터{filtered ? " · 적용 중" : ""}
        </button>
        <button type="button" onClick={onBudget} className="pill px-3 py-[7px]">
          예산
        </button>
        <button type="button" onClick={onManage} className="pill px-3 py-[7px]">
          관리
        </button>
        <button type="button" onClick={onAdd} className="pill pill-accent">
          + 내역
        </button>
      </div>
    </div>
  );
}

// ── 예산 (TX-06) ─────────────────────────────────────────

function BudgetCard({
  budget,
  categories,
  spentByCategory,
  month,
  onEdit,
}: {
  budget: ReturnType<typeof budgetStatus>;
  categories: TxCategory[];
  spentByCategory: Map<string, number>;
  month: number;
  onEdit: (focusCategoryId?: string | null) => void;
}) {
  const level = budgetLevel(budget.ratio);
  // 예산이 없는데 이번 달 지출이 있는 분류는 "예산 설정"을 보여 준다.
  const unbudgeted = categories.filter(
    (c) => c.type === "expense" && (spentByCategory.get(c.name) ?? 0) > 0 && !budget.categories.some((b) => b.category === c.name),
  );
  const alert = budget.categories.filter((b) => b.ratio >= 0.8).sort((a, b) => b.ratio - a.ratio)[0];

  return (
    <section className="card card-warm gap-3">
      <CardHead
        title="분류별 예산"
        meta={
          <button type="button" onClick={() => onEdit()} className="text-xs hover:text-fg">
            {budget.total ? `${pct(budget.spent, budget.total)}% 사용 · 설정` : "예산 설정"}
          </button>
        }
      />
      {budget.total > 0 && (
        <div className="flex flex-col gap-[5px]">
          <div className="flex justify-between text-xs">
            <span>{month}월 전체</span>
            <span style={{ color: level === "ok" ? "var(--color-muted)" : LEVEL_COLOR[level] }}>
              {manwon(budget.spent)} / {manwon(budget.total)}
            </span>
          </div>
          <ProgressBar percent={budget.ratio * 100} color={LEVEL_COLOR[level]} />
        </div>
      )}
      {budget.categories.map((b) => {
        const lv = budgetLevel(b.ratio);
        return (
          <div key={b.category} className="flex flex-col gap-[5px]">
            <div className="flex justify-between text-xs">
              <span>{b.category}</span>
              <span style={{ color: lv === "ok" ? "var(--color-muted)" : LEVEL_COLOR[lv] }}>
                {manwon(b.used)} / {manwon(b.limit)}
                {lv === "over" ? " · 초과" : ""}
              </span>
            </div>
            <ProgressBar percent={Math.min(b.ratio * 100, 100)} color={LEVEL_COLOR[lv]} />
          </div>
        );
      })}
      {unbudgeted.slice(0, 3).map((c) => (
        <div key={c.id} className="flex justify-between text-xs">
          <span className="text-muted">
            {c.name} · {manwon(spentByCategory.get(c.name) ?? 0)}
          </span>
          <button type="button" onClick={() => onEdit(c.id)} className="text-subtle underline-offset-2 hover:text-fg hover:underline">
            예산 설정
          </button>
        </div>
      ))}
      {!budget.total && !unbudgeted.length && <span className="text-[13px] text-subtle">이 달의 예산이 없어요.</span>}
      {alert && (
        <div className="mt-auto border-t border-white/[.08] pt-2.5 text-[11px]" style={{ color: LEVEL_COLOR[budgetLevel(alert.ratio)] }}>
          {alert.category} 예산 {Math.round(alert.ratio * 100)}% 사용{alert.ratio >= 1 ? " · 예산을 넘었어요" : " · 80%를 넘었어요"}
        </div>
      )}
    </section>
  );
}

// ── 내역 (TX-02) ─────────────────────────────────────────

function TransactionList({
  list,
  filtered,
  color,
  onOpen,
  onAdd,
  onExport,
}: {
  list: Transaction[];
  filtered: boolean;
  color: (name: string) => string;
  onOpen: (tx: Transaction) => void;
  onAdd: () => void;
  onExport: () => void;
}) {
  const groups = groupByDate(list);
  return (
    <section className="card card-flat max-h-[520px] gap-2 overflow-auto">
      <CardHead
        title="내역"
        meta={
          <button type="button" onClick={onExport} className="text-xs hover:text-fg">
            CSV 내보내기
          </button>
        }
      />
      {!groups.length && (
        <div className="flex flex-col items-start gap-2 py-6 text-[13px] text-subtle">
          {filtered ? "조건에 맞는 내역이 없어요." : "이 달의 내역이 없어요."}
          {!filtered && (
            <button type="button" onClick={onAdd} className="pill px-3.5 py-1.5 text-xs">
              + 첫 내역 등록
            </button>
          )}
        </div>
      )}
      {groups.map((g) => (
        <div key={g.date} className="flex flex-col">
          <div className="flex justify-between pt-2 text-xs text-subtle">
            <span>
              {parts(g.date).m}월 {parts(g.date).d}일 {weekday(g.date)}
            </span>
            <span>{signedWon(g.net)}</span>
          </div>
          {g.items.map((x) => (
            <button
              key={x.id}
              type="button"
              onClick={() => onOpen(x)}
              aria-label={`${x.memo || x.category || "내역"} ${won(x.amount)} 수정`}
              className="grid grid-cols-[34px_minmax(0,1fr)_auto] items-center gap-3 border-b border-white/[.06] py-[7px] text-left hover:bg-white/[.03]"
            >
              <span
                className="flex size-[34px] items-center justify-center rounded-full text-[11px]"
                style={{ background: `color-mix(in oklch, ${color(x.category)} 40%, var(--color-panel))` }}
              >
                {(x.category || "–").slice(0, 2)}
              </span>
              <span className="flex min-w-0 flex-col gap-0.5">
                <span className="truncate text-sm">{x.memo || x.category || (x.type === "income" ? "수입" : "지출")}</span>
                <span className="text-[11px] text-subtle">
                  {[x.category || "분류 없음", x.method].filter(Boolean).join(" · ")}
                  {x.recurringId ? " · 고정" : ""}
                  {x.viaClaude ? " · Claude" : ""}
                </span>
              </span>
              <span
                className="text-sm font-semibold whitespace-nowrap"
                style={{ color: x.type === "income" ? "var(--color-income)" : "var(--color-fg)" }}
              >
                {signedWon(x.type === "income" ? x.amount : -x.amount)}
              </span>
            </button>
          ))}
        </div>
      ))}
    </section>
  );
}

// ── 통계 (TX-08) ─────────────────────────────────────────

function CategoryShare({ list, expense, color }: { list: Transaction[]; expense: number; color: (name: string) => string }) {
  // 상위 4개 분류 + 기타
  const byCat = [...expenseByCategory(list).entries()].sort((a, b) => b[1] - a[1]);
  const share = [
    ...byCat.slice(0, 4).map(([name, v]) => ({ name: name || "분류 없음", value: v, color: color(name) })),
    ...(byCat.length > 4 ? [{ name: "기타", value: byCat.slice(4).reduce((s, [, v]) => s + v, 0), color: OTHER_COLOR }] : []),
  ];
  let acc = 0;
  const conic = share
    .map((s) => {
      const from = acc;
      acc += (s.value / (expense || 1)) * 100;
      return `${s.color} ${from}% ${acc}%`;
    })
    .join(",");

  return (
    <section className="card card-flat gap-3.5">
      <span className="text-[15px] font-semibold">분류별 지출</span>
      <div
        className="relative size-[150px] self-center rounded-full"
        style={{ background: expense ? `conic-gradient(${conic})` : "rgb(255 255 255 / .08)" }}
        role="img"
        aria-label={share.map((s) => `${s.name} ${pct(s.value, expense)}%`).join(", ") || "지출 없음"}
      >
        <div className="absolute inset-[22px] flex flex-col items-center justify-center rounded-full bg-panel">
          <span className="text-[11px] text-subtle">지출</span>
          <span className="text-base font-bold">{manwon(expense)}원</span>
        </div>
      </div>
      <div className="flex flex-col gap-[7px]">
        {!share.length && <span className="text-center text-xs text-subtle">지출 내역이 없어요.</span>}
        {share.map((s) => (
          <div key={s.name} className="flex items-center gap-2 text-xs">
            <span className="size-2 rounded-xs" style={{ background: s.color }} />
            {s.name}
            <span className="ml-auto text-muted">
              {won(s.value)} · {pct(s.value, expense)}%
            </span>
          </div>
        ))}
      </div>
    </section>
  );
}

function TrendCard({ query, start }: { query: ReturnType<typeof useTransactions>; start: { y: number; m: number } }) {
  if (query.isPending)
    return (
      <section className="card card-flat gap-2.5">
        <CardHead title="월별 추이" meta="수입 · 지출" />
        <span className="py-6 text-[13px] text-subtle">불러오는 중…</span>
      </section>
    );
  const trend = monthlySeries(query.data ?? [], start.y, start.m, TREND_MONTHS);
  const max = Math.max(...trend.flatMap((t) => [t.income, t.expense]), 1);
  return (
    <section className="card card-flat gap-2.5">
      <CardHead title="월별 추이" meta="수입 · 지출" />
      <div className="flex min-h-[180px] flex-1 items-end gap-2">
        {trend.map((t, i) => (
          <div
            key={`${t.y}-${t.m}`}
            className="flex h-full flex-1 flex-col items-center justify-end gap-1.5"
            title={`${t.y}년 ${t.m}월 · 수입 ${won(t.income)} · 지출 ${won(t.expense)}`}
          >
            <div className="flex h-full w-full items-end gap-[3px]">
              <div className="flex-1 rounded-[3px] bg-white/[.22]" style={{ height: `${(t.income / max) * 100}%` }} />
              <div
                className="flex-1 rounded-[3px]"
                style={{
                  height: `${(t.expense / max) * 100}%`,
                  background: i === trend.length - 1 ? "var(--color-accent)" : "rgb(242 238 232 / .6)",
                }}
              />
            </div>
            <span className="text-[10px] text-subtle">{t.m}월</span>
          </div>
        ))}
      </div>
      <div className="flex gap-3 text-[11px] text-subtle">
        <span className="flex items-center gap-1.5">
          <span className="size-2 rounded-xs bg-white/[.22]" /> 수입
        </span>
        <span className="flex items-center gap-1.5">
          <span className="size-2 rounded-xs bg-[rgb(242_238_232/.6)]" /> 지출
        </span>
      </div>
    </section>
  );
}

function MonthlyTable({
  y,
  query,
  current,
  onPick,
}: {
  y: number;
  query: ReturnType<typeof useTransactions>;
  current: number;
  onPick: (m: number) => void;
}) {
  if (query.isPending) return <LoadingState />;
  if (query.isError) return <ErrorState retry={() => query.refetch()} />;
  const rows = monthlySeries(query.data ?? [], y, 1, 12);
  const sum = totalsOf(query.data ?? []);
  return (
    <section className="card card-flat gap-2 overflow-x-auto">
      <CardHead title={`${y}년 월별 합계`} meta="월을 누르면 일별 내역" />
      <table className="w-full text-right text-[13px] tabular-nums">
        <thead className="text-xs text-subtle">
          <tr>
            <th className="py-1.5 text-left font-normal">월</th>
            <th className="font-normal">수입</th>
            <th className="font-normal">지출</th>
            <th className="font-normal">잔액</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr
              key={r.m}
              onClick={() => onPick(r.m)}
              className={`cursor-pointer border-t border-white/[.06] hover:bg-white/[.03] ${r.m === current ? "bg-white/[.05]" : ""} ${r.count ? "" : "text-subtle"}`}
            >
              <td className="py-2 text-left">
                <button type="button" onClick={() => onPick(r.m)} className="hover:underline">
                  {r.m}월
                </button>
              </td>
              <td style={{ color: r.income ? "var(--color-income)" : undefined }}>{r.income ? won(r.income) : "–"}</td>
              <td>{r.expense ? won(r.expense) : "–"}</td>
              <td>{r.count ? signedWon(r.balance) : "–"}</td>
            </tr>
          ))}
        </tbody>
        <tfoot className="font-semibold">
          <tr className="border-t border-white/[.15]">
            <td className="py-2 text-left">합계</td>
            <td style={{ color: "var(--color-income)" }}>{won(sum.income)}</td>
            <td>{won(sum.expense)}</td>
            <td>{signedWon(sum.balance)}</td>
          </tr>
        </tfoot>
      </table>
      <span className="text-[11px] text-subtle">
        {shortLabel(`${y}-01-01`)}~{shortLabel(`${y}-12-31`)} · {(query.data ?? []).length}건
      </span>
    </section>
  );
}
