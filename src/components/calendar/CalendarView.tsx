"use client";

import { useCallback, useState } from "react";
import { CardHead, ErrorState, LoadingState, Segmented } from "@/components/ui";
import { WEEKDAYS, longLabel, monthGrid, parts, shiftMonth } from "@/lib/date";
import { categoryColorOf, useEventCategories, useEvents } from "@/lib/hooks/use-events";
import { useToday } from "@/lib/hooks/use-today";
import { OUTDOOR_CATEGORIES, PROFILE, dailyWeather } from "@/lib/mock-data";
import type { CalendarEvent, ISODate } from "@/lib/types";
import { EventModal } from "./EventModal";

const VIEWS = [
  { value: "month", label: "월" },
  { value: "week", label: "주" },
  { value: "day", label: "일" },
] as const;

const RAIN_ALERT = 60;

const eventsOn = (events: CalendarEvent[], date: ISODate) => events.filter((e) => e.date === date);

export function CalendarView() {
  const todayIso = useToday();
  const today = parts(todayIso);
  const [cursor, setCursor] = useState({ y: today.y, m: today.m });
  const [selected, setSelected] = useState<ISODate>(todayIso);
  const [modal, setModal] = useState<{ date: ISODate; editId: string | null } | null>(null);
  const closeModal = useCallback(() => setModal(null), []);

  const cells = monthGrid(cursor.y, cursor.m);
  const eventsQuery = useEvents({ from: cells[0].date, to: cells[cells.length - 1].date });
  const { data: categories } = useEventCategories();
  const color = (name: string) => categoryColorOf(categories, name);

  if (eventsQuery.isPending) return <LoadingState />;
  if (eventsQuery.isError) return <ErrorState retry={() => eventsQuery.refetch()} />;
  const events = eventsQuery.data;

  const weather = dailyWeather(todayIso);
  const selEvents = eventsOn(events, selected);
  const selWx = weather[selected];
  const rainAlert = selWx && selWx.rainChance >= RAIN_ALERT && selEvents.some((e) => OUTDOOR_CATEGORIES.includes(e.category));

  const open = (date: ISODate, editId: string | null = null) => {
    setSelected(date);
    setModal({ date, editId });
  };

  const move = (n: number) => setCursor((c) => shiftMonth(c.y, c.m, n));

  return (
    <main className="flex flex-wrap items-start gap-4 px-4 pb-7 md:px-7">
      <section className="card card-flat min-w-0 flex-[1_1_560px] gap-3.5 p-5">
        <div className="flex flex-wrap items-center gap-3">
          <span className="text-2xl font-bold">
            {cursor.y}년 {cursor.m}월
          </span>
          <button type="button" aria-label="이전 달" onClick={() => move(-1)} className="pill size-[30px] justify-center p-0 text-[13px]">
            ‹
          </button>
          <button type="button" aria-label="다음 달" onClick={() => move(1)} className="pill size-[30px] justify-center p-0 text-[13px]">
            ›
          </button>
          <button
            type="button"
            onClick={() => {
              setCursor({ y: today.y, m: today.m });
              setSelected(todayIso);
            }}
            className="pill px-3 py-1.5"
          >
            오늘
          </button>
          <div className="ml-auto">
            {/* 주·일 보기(EVT-01)는 다음 단계에서 구현 */}
            <Segmented options={VIEWS} value="month" disabled={["week", "day"]} />
          </div>
          <span className="hidden text-[11px] text-subtle sm:inline">날짜를 더블클릭해 등록·수정</span>
          <button type="button" onClick={() => open(selected)} className="pill pill-accent">
            + 일정
          </button>
        </div>

        <div className="grid grid-cols-7 text-xs text-subtle">
          {WEEKDAYS.map((d) => (
            <span key={d} className="px-2">
              {d}
            </span>
          ))}
        </div>

        <div className="grid flex-1 auto-rows-[minmax(104px,1fr)] grid-cols-7 gap-1.5">
          {cells.map(({ date, inMonth }) => {
            const list = inMonth ? eventsOn(events, date) : [];
            const isSel = inMonth && date === selected;
            const isToday = date === todayIso;
            const wx = inMonth ? weather[date]?.label : undefined;
            return (
              <div
                key={date}
                role="button"
                tabIndex={inMonth ? 0 : -1}
                aria-label={longLabel(date)}
                aria-pressed={isSel}
                title="더블클릭해 일정 등록·수정"
                onClick={() => inMonth && setSelected(date)}
                onDoubleClick={() => inMonth && open(date)}
                onKeyDown={(e) => inMonth && e.key === "Enter" && open(date)}
                className="flex min-w-0 cursor-pointer flex-col gap-1 rounded-xl border p-1 select-none sm:p-2"
                style={{
                  background: isSel ? "rgb(255 255 255 / .08)" : "rgb(255 255 255 / .02)",
                  borderColor: isSel ? "var(--color-accent)" : "rgb(255 255 255 / .05)",
                  opacity: inMonth ? 1 : 0.35,
                }}
              >
                <div className="flex items-center justify-between gap-1">
                  {isToday && inMonth ? (
                    <span className="flex size-[22px] items-center justify-center rounded-full bg-accent text-xs font-bold text-ink">
                      {parts(date).d}
                    </span>
                  ) : (
                    <span className="pl-1 text-[13px] font-semibold">{parts(date).d}</span>
                  )}
                  {wx && <span className="hidden truncate text-[10px] text-subtle sm:inline">{wx}</span>}
                </div>
                {list.slice(0, 2).map((e) => (
                  <div
                    key={e.id}
                    className="truncate rounded-[5px] px-1.5 py-0.5 text-[11px] text-fg"
                    style={{ background: `color-mix(in oklch, ${color(e.category)} 45%, #1c1a18)` }}
                  >
                    {e.source === "google" ? "G · " : ""}
                    {e.title}
                  </div>
                ))}
                {list.length > 2 && <span className="pl-1 text-[10px] text-subtle">+{list.length - 2}</span>}
              </div>
            );
          })}
        </div>
      </section>

      <div className="flex max-w-[420px] min-w-0 flex-[1_1_280px] flex-col gap-3">
        {/* EVT-07: 선택한 날짜 상세 */}
        <section className="card card-warm gap-3 p-5">
          <div className="flex items-baseline justify-between">
            <span className="text-xl font-bold">{longLabel(selected)}</span>
            <span className="text-xs text-muted">{selWx ? `${PROFILE.regionShort} ${selWx.label}` : "예보 기간 밖"}</span>
          </div>
          {!selEvents.length && <span className="py-3 text-[13px] text-subtle">등록된 일정이 없어요.</span>}
          {selEvents.map((e) => (
            <button
              key={e.id}
              type="button"
              onClick={() => open(selected, e.id)}
              className="grid grid-cols-[4px_1fr] gap-3 border-b border-line py-2.5 text-left"
            >
              <div className="rounded-xs" style={{ background: color(e.category) }} />
              <div className="flex flex-col gap-[3px]">
                <span className="text-[15px] font-semibold">{e.title}</span>
                <span className="text-xs text-muted">
                  {e.allDay ? "종일" : e.end ? `${e.start}–${e.end}` : e.start} · {e.location || "-"}
                </span>
                <span className="text-[11px] text-subtle">
                  {e.category || "분류 없음"} · {e.source === "google" ? "Google 캘린더" : "내 캘린더"}
                </span>
              </div>
            </button>
          ))}
          {rainAlert && (
            <div className="rounded-[10px] bg-[oklch(0.35_0.06_240/.5)] px-3 py-2.5 text-xs">
              야외 일정이 있는 날 비 예보(강수 {selWx.rainChance}%)가 있어요.
            </div>
          )}
        </section>

        {/* EVT-06: 카테고리 */}
        <section className="card card-flat gap-2.5 p-5">
          <CardHead title="카테고리" meta={<span className="text-xs">관리</span>} />
          {categories?.map((c) => (
            <div key={c.id} className="flex items-center gap-2.5 text-[13px]">
              <span className="size-2.5 rounded-[3px]" style={{ background: c.color }} />
              {c.name}
              <span className="ml-auto text-[11px] text-subtle">{events.filter((e) => e.category === c.name).length}건</span>
            </div>
          ))}
          <div className="border-t border-line pt-2.5 text-[11px] text-subtle">G 표시는 구글 캘린더 일정 · 양방향 동기화</div>
        </section>
      </div>

      {modal && (
        <EventModal
          key={`${modal.date}-${modal.editId ?? "new"}`}
          date={modal.date}
          editId={modal.editId}
          dayEvents={eventsOn(events, modal.date)}
          categories={categories ?? []}
          onPick={(editId) => setModal({ date: modal.date, editId })}
          onClose={closeModal}
        />
      )}
    </main>
  );
}
