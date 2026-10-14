"use client";

import { useCallback, useState, useSyncExternalStore, type ReactNode } from "react";
import { CardHead, Segmented, useToast } from "@/components/ui";
import { addDays, longLabel, parts, zonedParts } from "@/lib/date";
import { won } from "@/lib/format";
import { categoryColorOf, useEventCategories, useEvents, useRecurringPayments, useSaveEvent } from "@/lib/hooks/use-events";
import { useProfile, useTimezone } from "@/lib/hooks/use-profile";
import { useToday } from "@/lib/hooks/use-today";
import { useTodos } from "@/lib/hooks/use-todos";
import { OUTDOOR_CATEGORIES, PROFILE, dailyWeather } from "@/lib/mock-data";
import type { CalendarEvent, EventInput, ISODate, RecurrenceScope } from "@/lib/types";
import { CategoryPanel } from "./CategoryPanel";
import { EventModal } from "./EventModal";
import { MonthGrid } from "./MonthGrid";
import { ScopeDialog } from "./ScopeChooser";
import { TimeGrid } from "./TimeGrid";
import { eventsOn, fromMinutes, monthCells, shiftAnchor, toMinutes, viewRange, viewTitle, weekdayLabels, type CalendarViewMode } from "./grid";

const VIEWS = [
  { value: "month", label: "월" },
  { value: "week", label: "주" },
  { value: "day", label: "일" },
] as const;

const RAIN_ALERT = 60;
const VIEW_KEY = "calendar:view";
const TODOS_KEY = "calendar:show-todos";
const FIXED_KEY = "calendar:show-fixed";

// ── localStorage (실패해도 화면은 기본값으로 동작) ─────────

const readStored = (key: string) => {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
};

const writeStored = (key: string, value: string) => {
  try {
    localStorage.setItem(key, value);
  } catch {
    // 저장할 수 없으면 이번 화면에서만 기억한다.
  }
};

function useStored<T extends string>(key: string, parse: (raw: string | null) => T | null) {
  const [value, setValue] = useState<T | null>(() => parse(readStored(key)));
  const set = useCallback(
    (v: T) => {
      setValue(v);
      writeStored(key, v);
    },
    [key],
  );
  return [value, set] as const;
}

const asView = (raw: string | null) => (raw === "month" || raw === "week" || raw === "day" ? raw : null);
const asFlag = (raw: string | null) => (raw === "on" || raw === "off" ? raw : null);

/** 지금 시각(분, 사용자 타임존). 1분마다 갱신 */
const subscribeMinute = (cb: () => void) => {
  const id = setInterval(cb, 60_000);
  return () => clearInterval(id);
};
function useNowMinute(tz: string) {
  return useSyncExternalStore(subscribeMinute, () => toMinutes(zonedParts(new Date(), tz).time), () => 0);
}

/** 회차·일반 일정을 옮긴 결과를 등록 입력으로 */
const movedInput = (e: CalendarEvent, change: { date: ISODate; start: string; end: string }): EventInput => ({
  date: change.date,
  endDate: change.date,
  allDay: false,
  start: change.start,
  end: change.end,
  title: e.title,
  category: e.category,
  location: e.location,
  source: e.source,
  repeat: e.repeat,
  rrule: e.rrule,
  reminder: e.reminder,
  memo: e.memo,
});

const isOccurrence = (e: CalendarEvent) => Boolean(e.rrule && e.id.includes(":"));

type ModalState = { event: CalendarEvent | null; initial?: Partial<EventInput> };

export function CalendarView() {
  const toast = useToast();
  const todayIso = useToday();
  const tz = useTimezone();
  const profile = useProfile().data;
  const weekStart = profile?.weekStart ?? 0;
  const nowMinute = useNowMinute(tz);

  const [storedView, setView] = useStored<CalendarViewMode>(VIEW_KEY, asView);
  const view: CalendarViewMode = storedView ?? profile?.defaultView ?? "month";
  const [showTodosRaw, setShowTodos] = useStored(TODOS_KEY, asFlag);
  const [showFixedRaw, setShowFixed] = useStored(FIXED_KEY, asFlag);
  const showTodos = showTodosRaw !== "off";
  const showFixed = showFixedRaw === "on";

  const [anchor, setAnchor] = useState<ISODate>(todayIso);
  const [selected, setSelected] = useState<ISODate>(todayIso);
  const [modal, setModal] = useState<ModalState | null>(null);
  const [categoryPanel, setCategoryPanel] = useState(false);
  const [pendingMove, setPendingMove] = useState<{ e: CalendarEvent; change: { date: ISODate; start: string; end: string } } | null>(null);
  const closeModal = useCallback(() => setModal(null), []);

  const range = viewRange(view, anchor, weekStart);
  const eventsQuery = useEvents(range);
  const { data: categories = [] } = useEventCategories();
  const todosQuery = useTodos();
  const paymentsQuery = useRecurringPayments(range, showFixed);
  const saveMutation = useSaveEvent();

  const events = eventsQuery.data ?? [];
  const color = (name: string) => categoryColorOf(categories, name);
  // TODO(04): useWeather()로 바꾼다. 지금은 예시 예보다.
  const weather = dailyWeather(todayIso);

  const todosOn = (date: ISODate) => (showTodos ? (todosQuery.data ?? []).filter((t) => t.dueDate === date) : []);
  const paymentsOn = (date: ISODate) => (showFixed ? (paymentsQuery.data ?? []).filter((p) => p.date === date) : []);

  // EVT-08·09: 날짜 칸의 할일·고정지출 칩
  const markers = (date: ISODate): ReactNode[] => [
    ...todosOn(date).map((t) => (
      <span
        key={`todo-${t.id}`}
        title={`할일: ${t.title}`}
        className={`truncate rounded-[5px] border border-white/10 px-1 py-0.5 text-[10px] sm:px-1.5 sm:text-[11px] ${t.done ? "text-subtle line-through" : "text-soft"}`}
      >
        {t.done ? "✓" : "☐"} {t.title}
      </span>
    )),
    ...paymentsOn(date).map((p) => (
      <span
        key={`pay-${p.id}`}
        title={`고정지출: ${p.title} ${won(p.amount)}`}
        className="truncate rounded-[5px] border border-dashed border-white/15 px-1 py-0.5 text-[10px] text-muted sm:px-1.5 sm:text-[11px]"
      >
        ₩ {p.title}
      </span>
    )),
  ];

  const changeView = (v: CalendarViewMode) => {
    setView(v);
    setAnchor(selected);
  };

  const move = (n: number) => {
    const next = shiftAnchor(view, anchor, n);
    setAnchor(next);
    if (view !== "month") setSelected(next);
  };

  const goToday = () => {
    setAnchor(todayIso);
    setSelected(todayIso);
  };

  const select = (date: ISODate) => {
    setSelected(date);
    if (view === "month" && parts(date).m !== parts(anchor).m) setAnchor(date);
  };

  const openEvent = (e: CalendarEvent) => {
    setSelected(e.date);
    setModal({ event: e });
  };

  const create = (date: ISODate, start?: string) => {
    setSelected(date);
    setModal({ event: null, initial: start ? { date, start, end: fromMinutes(Math.min(toMinutes(start) + 60, 24 * 60 - 1)) } : { date } });
  };

  const commitMove = (e: CalendarEvent, change: { date: ISODate; start: string; end: string }, scope?: RecurrenceScope) => {
    setPendingMove(null);
    saveMutation
      .mutateAsync({ id: e.id, input: movedInput(e, change), categories, scope })
      .then(() => toast.success("일정을 옮겼어요."))
      .catch(() => toast.error("일정을 옮기지 못했어요. 다시 시도해 주세요."));
  };

  const onMove = (e: CalendarEvent, change: { date: ISODate; start: string; end: string }) => {
    if (isOccurrence(e)) setPendingMove({ e, change });
    else commitMove(e, change);
  };

  const selEvents = eventsOn(events, selected);
  const selWx = weather[selected];
  const rainAlert = selWx && selWx.rainChance >= RAIN_ALERT && selEvents.some((e) => OUTDOOR_CATEGORIES.includes(e.category));
  const { y, m } = parts(anchor);
  const days = view === "day" ? [anchor] : Array.from({ length: 7 }, (_, i) => addDays(range.from, i));

  let body: ReactNode;
  if (eventsQuery.isPending) {
    body = (
      <div role="status" aria-label="불러오는 중" className="grid flex-1 auto-rows-[88px] grid-cols-7 gap-1.5">
        {Array.from({ length: view === "month" ? 35 : 7 }, (_, i) => (
          <div key={i} className="animate-pulse rounded-xl bg-white/[.04]" />
        ))}
      </div>
    );
  } else if (eventsQuery.isError && !eventsQuery.data) {
    body = (
      <div role="alert" className="flex flex-col items-center gap-3 py-16 text-center text-[13px] text-muted">
        일정을 불러오지 못했어요.
        <button type="button" onClick={() => eventsQuery.refetch()} className="pill px-4 py-2">
          다시 시도
        </button>
      </div>
    );
  } else if (view === "month") {
    body = (
      <MonthGrid
        cells={monthCells(y, m, weekStart)}
        weekdays={weekdayLabels(weekStart)}
        events={events}
        today={todayIso}
        selected={selected}
        weather={(d) => weather[d]?.label}
        color={color}
        markers={markers}
        onSelect={select}
        onCreate={(d) => create(d)}
        onOpen={openEvent}
      />
    );
  } else {
    body = (
      <TimeGrid
        key={view}
        days={days}
        events={events}
        today={todayIso}
        selected={selected}
        nowMinute={nowMinute}
        color={color}
        extras={(d) => markers(d)}
        onSelectDate={(d) => (view === "week" ? setSelected(d) : undefined)}
        onCreate={create}
        onOpen={openEvent}
        onMove={onMove}
      />
    );
  }

  return (
    <main className="flex flex-wrap items-start gap-4 px-4 pb-7 md:px-7">
      <section className="card card-flat min-w-0 flex-[1_1_560px] gap-3.5 p-3 sm:p-5">
        <div className="flex flex-wrap items-center gap-2 sm:gap-3">
          <span className="text-xl font-bold sm:text-2xl">{viewTitle(view, anchor, weekStart)}</span>
          <div className="flex gap-1.5">
            <button type="button" aria-label="이전" onClick={() => move(-1)} className="pill size-[30px] justify-center p-0 text-[13px]">
              ‹
            </button>
            <button type="button" aria-label="다음" onClick={() => move(1)} className="pill size-[30px] justify-center p-0 text-[13px]">
              ›
            </button>
            <button type="button" onClick={goToday} className="pill px-3 py-1.5">
              오늘
            </button>
          </div>
          {eventsQuery.isFetching && !eventsQuery.isPending && <span className="text-[11px] text-subtle">새로고침 중…</span>}
          <div className="ml-auto">
            <Segmented options={VIEWS} value={view} onChange={changeView} />
          </div>
          <button type="button" onClick={() => create(selected)} className="pill pill-accent">
            + 일정
          </button>
        </div>

        {/* 보기 옵션: EVT-08 할일, EVT-09 고정지출 */}
        <div className="flex flex-wrap items-center gap-1.5 text-[11px] text-subtle">
          <span>표시</span>
          <button
            type="button"
            aria-pressed={showTodos}
            onClick={() => setShowTodos(showTodos ? "off" : "on")}
            className={`pill px-2.5 py-1 text-[11px] ${showTodos ? "border-transparent bg-white/15" : "text-subtle"}`}
          >
            {showTodos ? "✓ " : ""}마감 할일
          </button>
          <button
            type="button"
            aria-pressed={showFixed}
            onClick={() => setShowFixed(showFixed ? "off" : "on")}
            className={`pill px-2.5 py-1 text-[11px] ${showFixed ? "border-transparent bg-white/15" : "text-subtle"}`}
          >
            {showFixed ? "✓ " : ""}고정지출
          </button>
          {view === "month" && <span className="ml-auto hidden sm:inline">날짜를 더블클릭해 등록</span>}
        </div>

        {body}
        {eventsQuery.isSuccess && !events.length && (
          <span className="text-center text-[13px] text-subtle">이 기간에 일정이 없어요. + 일정으로 등록해 보세요.</span>
        )}
      </section>

      <div className="flex max-w-[420px] min-w-0 flex-[1_1_280px] flex-col gap-3">
        {/* 선택한 날짜 */}
        <section className="card card-warm gap-3 p-5">
          <div className="flex items-baseline justify-between gap-2">
            <span className="text-xl font-bold">{longLabel(selected)}</span>
            <span className="text-xs text-muted">{selWx ? `${PROFILE.regionShort} ${selWx.label}` : "예보 기간 밖"}</span>
          </div>
          {eventsQuery.isSuccess && !selEvents.length && <span className="py-3 text-[13px] text-subtle">등록된 일정이 없어요.</span>}
          {selEvents.map((e) => (
            <button key={e.id} type="button" onClick={() => openEvent(e)} className="grid grid-cols-[4px_1fr] gap-3 border-b border-line py-2.5 text-left">
              <div className="rounded-xs" style={{ background: color(e.category) }} />
              <div className="flex min-w-0 flex-col gap-[3px]">
                <span className="text-[15px] font-semibold">{e.title}</span>
                <span className="text-xs text-muted">
                  {e.allDay ? "종일" : e.end ? `${e.start}–${e.end}` : e.start}
                  {e.endDate > e.date ? ` · ~${parts(e.endDate).m}/${parts(e.endDate).d}` : ""} · {e.location || "-"}
                </span>
                <span className="text-[11px] text-subtle">
                  {e.category || "분류 없음"} · {e.source === "google" ? "Google 캘린더" : "내 캘린더"}
                  {e.rrule || e.seriesId ? " · 반복" : ""}
                </span>
              </div>
            </button>
          ))}
          {todosOn(selected).map((t) => (
            <div key={t.id} className="flex items-center gap-2 text-[13px]">
              <span className={t.done ? "text-ok" : "text-subtle"}>{t.done ? "✓" : "☐"}</span>
              <span className={t.done ? "text-subtle line-through" : ""}>{t.title}</span>
              <span className="ml-auto text-[11px] text-subtle">할일 마감</span>
            </div>
          ))}
          {paymentsOn(selected).map((p) => (
            <div key={p.id} className="flex items-center gap-2 text-[13px]">
              <span className="text-subtle">₩</span>
              {p.title}
              <span className="ml-auto font-mono text-xs">{won(p.amount)}</span>
            </div>
          ))}
          {rainAlert && (
            <div className="rounded-[10px] bg-[oklch(0.35_0.06_240/.5)] px-3 py-2.5 text-xs">
              야외 일정이 있는 날 비 예보(강수 {selWx.rainChance}%)가 있어요.
            </div>
          )}
        </section>

        {/* EVT-06: 카테고리 */}
        <section className="card card-flat gap-2.5 p-5">
          <CardHead
            title="카테고리"
            meta={
              <button type="button" onClick={() => setCategoryPanel(true)} className="text-xs text-muted underline-offset-2 hover:underline">
                관리
              </button>
            }
          />
          {categories.map((c) => (
            <div key={c.id} className="flex items-center gap-2.5 text-[13px]">
              <span className="size-2.5 rounded-[3px]" style={{ background: c.color }} />
              {c.name}
              <span className="ml-auto text-[11px] text-subtle">{events.filter((e) => e.category === c.name).length}건</span>
            </div>
          ))}
          {!categories.length && <span className="text-[13px] text-subtle">카테고리가 없어요. 관리에서 추가하세요.</span>}
          <div className="border-t border-line pt-2.5 text-[11px] text-subtle">건수는 지금 보기 기준 · G 표시는 구글 캘린더 일정</div>
        </section>
      </div>

      <EventModal
        open={modal != null}
        onClose={closeModal}
        event={modal?.event}
        initial={modal?.initial}
        dayEvents={modal ? eventsOn(events, modal.event?.date ?? modal.initial?.date ?? selected) : []}
        onPick={(e) => setModal(e ? { event: e } : { event: null, initial: { date: modal?.event?.date ?? modal?.initial?.date ?? selected } })}
      />
      <CategoryPanel open={categoryPanel} onClose={() => setCategoryPanel(false)} categories={categories} />
      {pendingMove && (
        <ScopeDialog onPick={(scope) => commitMove(pendingMove.e, pendingMove.change, scope)} onClose={() => setPendingMove(null)} />
      )}
    </main>
  );
}
