"use client";

import Link from "next/link";
import { useState } from "react";
import { CardHead, ErrorState, LoadingState, ProgressBar, useToast } from "@/components/ui";
import { addDays, isoDate, monthKey, parts, weekday } from "@/lib/date";
import { pct, timeAgo, won } from "@/lib/format";
import { useEvents } from "@/lib/hooks/use-events";
import { useGoogleStatus } from "@/lib/hooks/use-google";
import { useToday } from "@/lib/hooks/use-today";
import { useProjects, useTodos, useToggleTodo } from "@/lib/hooks/use-todos";
import { useBudgets, useTransactions } from "@/lib/hooks/use-transactions";
import { useWeather } from "@/lib/hooks/use-weather";
import { BUDGET_WARN, budgetStatus, dailyExpense, monthTotals, recentDays } from "@/lib/money";
import { dueLabel, isOverdue, projectProgress } from "@/lib/todo";
import { highLow, shortLabel, summaryOf } from "@/lib/weather";
import { HeroBackground, HeroControls } from "./HeroBackground";

const ARC = 283; // 반지름 90 반원 길이

export function HomeDashboard() {
  const today = useToday();
  const toast = useToast();
  const { y, m, d } = parts(today);
  const monthStart = isoDate(y, m, 1);
  const weekStart = addDays(today, -6);

  const eventsQuery = useEvents({ from: today, to: today });
  const todosQuery = useTodos();
  const { data: projectList } = useProjects();
  // 이번 달 + 최근 7일(지난 달에 걸칠 수 있음)
  const txQuery = useTransactions({ from: weekStart < monthStart ? weekStart : monthStart, to: today });
  const budgetsQuery = useBudgets(monthKey(y, m));
  const toggle = useToggleTodo();
  // HOME-01: 날씨는 홈 전체 로딩을 막지 않는다(실패해도 카드 안에서만 알린다).
  const weather = useWeather();
  const google = useGoogleStatus().data;
  const googleMeta = !google?.connected
    ? "Google 미연결"
    : google.reauthRequired
      ? "Google 다시 연결 필요"
      : `Google 동기화 · ${timeAgo(google.lastSyncedAt)}`;

  // 오늘 할 일 목록은 처음 읽었을 때의 미완료 항목으로 고정해, 체크해도 목록에서 사라지지 않게 한다.
  const [homeTodoIds, setHomeTodoIds] = useState<string[] | null>(null);
  if (homeTodoIds === null && todosQuery.data) {
    setHomeTodoIds(todosQuery.data.filter((t) => !t.done && t.dueDate != null && t.dueDate <= today).slice(0, 6).map((t) => t.id));
  }

  const queries = [eventsQuery, todosQuery, txQuery, budgetsQuery];
  if (queries.some((q) => q.isPending)) return <LoadingState />;
  if (queries.some((q) => q.isError)) return <ErrorState retry={() => queries.forEach((q) => q.refetch())} />;
  const todos = todosQuery.data ?? [];
  const transactions = txQuery.data ?? [];

  const homeTodos = (homeTodoIds ?? []).flatMap((id) => todos.find((t) => t.id === id) ?? []);
  const todayLeft = todos.filter((t) => !t.done && t.dueDate != null && t.dueDate <= today).length;
  const projects = projectProgress(todos, projectList?.map((p) => p.name) ?? []);

  const todayEvents = eventsQuery.data ?? [];
  const allDay = todayEvents.filter((e) => e.allDay);
  const timed = todayEvents.filter((e) => !e.allDay);

  const month = monthTotals(transactions, y, m);
  const budget = budgetStatus(month.list.filter((t) => t.type === "expense"), budgetsQuery.data ?? []);
  const week = recentDays(transactions, today);
  const weekMax = Math.max(...week.map((w) => w.amount), 1);
  const usedPct = pct(budget.spent, budget.total);

  const toggleTodo = (id: string, done: boolean) =>
    toggle.mutate({ id, done }, { onError: () => toast.error("완료 상태를 바꾸지 못했어요.") });
  return (
    <>
      <HeroBackground />
      <main className="relative flex flex-col gap-4 px-4 pb-7 md:px-7">
        <div className="flex flex-col items-center gap-2.5 pt-5 pb-[150px] text-center">
          <span className="text-xl font-bold">좋은 아침이에요, 무엇을 도와드릴까요?</span>
          <span className="border-l-2 border-fg pl-1.5 text-[22px] font-light text-soft md:text-[30px]">
            “점심 김밥 4,500원 카드로 기록해줘”
          </span>
        </div>

        <div className="flex flex-wrap justify-end gap-2 text-xs">
          <HeroControls />
          <span className="pill pill-glass px-3.5 py-[9px]">
            {m}월 {d}일 ({weekday(today)}) ▾
          </span>
          <Link href="/calendar" className="pill pill-glass px-3.5 py-[9px]">
            + 일정
          </Link>
          <Link href="/todos" className="pill pill-glass px-3.5 py-[9px]">
            + 할일
          </Link>
          <Link href="/money" className="pill pill-accent px-4 py-[9px]">
            + 지출
          </Link>
        </div>

        <div className="grid auto-rows-[minmax(200px,auto)] grid-cols-[repeat(auto-fill,minmax(240px,1fr))] gap-3">
          {/* 오늘의 날씨 (HOME-01) */}
          <section className="card card-glass gap-2.5">
            <CardHead title="오늘의 날씨" meta={weatherMeta(weather)} />
            <WeatherBody weather={weather} />
          </section>

          {/* 할일 진행 */}
          <section className="card card-glass gap-2.5">
            <CardHead title="할일 진행" meta="프로젝트별" />
            <div className="flex items-baseline gap-1.5">
              <span className="text-[34px] leading-none font-semibold">{todayLeft}</span>
              <span className="text-xs text-muted">개 남음 · 오늘</span>
            </div>
            <div className="mt-auto flex flex-col gap-2">
              {projects.map((p) => (
                <div key={p.name} className="grid grid-cols-[40px_1fr_32px] items-center gap-2 text-[11px] text-muted">
                  <span>{p.name}</span>
                  <ProgressBar percent={p.percent} />
                  <span className="text-right">
                    {p.done}/{p.total}
                  </span>
                </div>
              ))}
            </div>
          </section>

          {/* 최근 7일 지출 */}
          <section className="card card-glass gap-2.5">
            <CardHead title="최근 7일 지출" meta="일별" />
            <div className="flex items-baseline gap-1.5">
              <span className="text-[34px] leading-none font-semibold">
                {dailyExpense(transactions, today).toLocaleString("ko-KR")}
              </span>
              <span className="text-xs text-muted">원 · 오늘</span>
            </div>
            <div className="flex min-h-16 flex-1 items-end gap-1.5">
              {week.map((w, i) => (
                <div key={w.date} className="flex h-full flex-1 flex-col items-center justify-end gap-1" title={won(w.amount)}>
                  <div
                    className="w-full rounded"
                    style={{
                      height: `${Math.max(4, (w.amount / weekMax) * 100)}%`,
                      background: i === week.length - 1 ? "var(--color-accent)" : "rgb(255 255 255 / .18)",
                    }}
                  />
                  <span className="text-[10px] text-subtle">{w.label}</span>
                </div>
              ))}
            </div>
          </section>

          {/* 이번 달 예산 (HOME-04) */}
          <section className="card card-warm row-span-2 items-center justify-between">
            <div className="self-stretch">
              <CardHead title="이번 달 예산" meta={`${m}월`} />
            </div>
            <div className="relative mt-5 h-[120px] w-[220px]">
              <svg width="220" height="120" viewBox="0 0 220 120" aria-hidden>
                <path d="M20 110 A90 90 0 0 1 200 110" fill="none" stroke="rgb(255 255 255 / .14)" strokeWidth="14" strokeLinecap="round" />
                <path
                  d="M20 110 A90 90 0 0 1 200 110"
                  fill="none"
                  stroke="var(--color-accent)"
                  strokeWidth="14"
                  strokeLinecap="round"
                  strokeDasharray={ARC}
                  strokeDashoffset={ARC * (1 - Math.min(budget.ratio, 1))}
                />
              </svg>
              <div className="absolute inset-x-0 bottom-0 flex flex-col items-center">
                <span className="text-[11px] text-muted">사용률</span>
                <span className="text-4xl leading-tight font-semibold">{usedPct}%</span>
              </div>
            </div>
            <div className="flex flex-col items-center gap-1 text-center">
              <span className="text-[22px] font-semibold">{won(budget.spent)}</span>
              <span className="text-xs text-muted">
                예산 {won(budget.total)} · {won(budget.left)} 남음
              </span>
            </div>
            <div className="flex flex-col gap-1.5 self-stretch text-xs">
              {budget.categories.slice(0, 3).map((c) => (
                <div key={c.category} className="flex justify-between">
                  <span className="text-muted">{c.category}</span>
                  <span>
                    {Math.round(c.ratio * 100)}%{c.ratio >= BUDGET_WARN ? " · 주의" : ""}
                  </span>
                </div>
              ))}
            </div>
          </section>

          {/* 오늘의 일정 (HOME-02) */}
          <section className="card card-glass gap-2.5">
            <CardHead title="오늘의 일정" meta={googleMeta} />
            {allDay.map((e) => (
              <div key={e.id} className="rounded-[10px] bg-white/[.08] px-3 py-[7px] text-xs">
                종일 · {e.title} · {e.category}
              </div>
            ))}
            {timed.map((e) => (
              <div key={e.id} className="grid grid-cols-[52px_1fr_auto] items-center gap-3 border-b border-line py-1.5">
                <span className="text-sm font-semibold text-accent">{e.start}</span>
                <span className="min-w-0 text-sm">{e.title}</span>
                <span className="text-[11px] whitespace-nowrap text-subtle">
                  {e.category} · {e.location || "-"}
                </span>
              </div>
            ))}
            {!todayEvents.length && <span className="text-[13px] text-subtle">오늘 일정이 없어요.</span>}
          </section>

          {/* 오늘 할 일 (HOME-03) */}
          <section className="card card-glass gap-[9px]">
            <CardHead title="오늘 할 일" meta="체크해서 완료" />
            {homeTodos.map((t) => {
              const over = isOverdue(t, today);
              return (
                <button
                  key={t.id}
                  type="button"
                  onClick={() => toggleTodo(t.id, !t.done)}
                  className="flex items-center gap-2.5 text-left text-[13px]"
                  style={{ color: t.done ? "var(--color-subtle)" : over ? "var(--color-danger)" : "var(--color-fg)" }}
                >
                  <span className="flex size-3.5 flex-none items-center justify-center rounded border-[1.5px] border-current text-[10px]">
                    {t.done ? "✓" : ""}
                  </span>
                  <span className={t.done ? "line-through" : ""}>{t.title}</span>
                  <span className="ml-auto text-[11px] whitespace-nowrap text-subtle">{dueLabel(t, today)}</span>
                </button>
              );
            })}
          </section>
        </div>
      </main>
    </>
  );
}

type WeatherState = ReturnType<typeof useWeather>;

const weatherMeta = ({ label, day, report }: WeatherState) =>
  [label ? shortLabel(label) : "", day ? `강수 ${day.rainChance}%` : "", report?.stale ? "최근 자료" : ""].filter(Boolean).join(" · ") || "날씨";

/** HOME-01: 현재 기온·하늘·최고/최저와 3시간 간격 기온 막대 6개 */
function WeatherBody({ weather }: { weather: WeatherState }) {
  const { current, day, report, query } = weather;
  if (!current) {
    return (
      <span className="flex flex-1 items-center text-[13px] text-subtle">
        {query.isPending ? "날씨 불러오는 중…" : "날씨를 불러오지 못했어요."}
      </span>
    );
  }
  const bars = (report?.hourly ?? []).filter((_, i) => i % 3 === 0).slice(0, 6);
  const temps = bars.map((h) => h.temp);
  const min = Math.min(...temps);
  const span = Math.max(...temps) - min || 1;
  return (
    <div className="flex flex-1 items-end gap-3">
      <div className="flex flex-col gap-0.5">
        <span className="text-[34px] leading-none font-semibold">{Math.round(current.temp)}°</span>
        <span className="text-[11px] whitespace-nowrap text-muted">
          {summaryOf(current.sky, current.precipType)} · {highLow(day)}
        </span>
      </div>
      <div className="flex flex-1 items-end gap-0.5">
        {bars.map((h, i) => (
          <div key={h.time} className="flex flex-1 flex-col items-center gap-1.5" title={`${h.hour}시 ${summaryOf(h.sky, h.precipType)} · 강수 ${h.rainChance}%`}>
            <span className="text-[11px]">{h.temp}°</span>
            <div
              className="w-2 rounded"
              style={{ height: 8 + ((h.temp - min) / span) * 32, background: i === 0 ? "var(--color-accent)" : "rgb(255 255 255 / .22)" }}
            />
            <span className="text-[10px] text-subtle">{h.hour}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
