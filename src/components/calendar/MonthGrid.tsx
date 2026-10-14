"use client";

import type { ReactNode } from "react";
import { longLabel, parts } from "@/lib/date";
import type { CalendarEvent, ISODate } from "@/lib/types";
import { eventsOn } from "./grid";

const VISIBLE = 3; // 칸에 보여 줄 항목 수(일정 + 할일·고정지출 칩)

/** 월 보기(EVT-01). 날짜를 누르면 선택, 더블클릭하면 등록, 일정 칩을 누르면 수정 */
export function MonthGrid({
  cells,
  weekdays,
  events,
  today,
  selected,
  weather,
  color,
  markers,
  onSelect,
  onCreate,
  onOpen,
}: {
  cells: { date: ISODate; inMonth: boolean }[];
  weekdays: readonly string[];
  events: CalendarEvent[];
  today: ISODate;
  selected: ISODate;
  weather: (date: ISODate) => string | undefined;
  color: (category: string) => string;
  /** 일정 뒤에 붙일 칩(할일·고정지출) */
  markers: (date: ISODate) => ReactNode[];
  onSelect: (date: ISODate) => void;
  onCreate: (date: ISODate) => void;
  onOpen: (e: CalendarEvent) => void;
}) {
  return (
    <>
      <div className="grid grid-cols-7 text-xs text-subtle">
        {weekdays.map((d) => (
          <span key={d} className="px-1 sm:px-2">
            {d}
          </span>
        ))}
      </div>

      <div className="grid flex-1 auto-rows-[minmax(88px,1fr)] grid-cols-7 gap-1 sm:auto-rows-[minmax(104px,1fr)] sm:gap-1.5">
        {cells.map(({ date, inMonth }) => {
          const list = eventsOn(events, date);
          const extra = markers(date);
          const items = [
            ...list.map((e) => (
              <button
                key={e.id}
                type="button"
                onClick={(ev) => {
                  ev.stopPropagation();
                  onOpen(e);
                }}
                onDoubleClick={(ev) => ev.stopPropagation()}
                className="truncate rounded-[5px] px-1 py-0.5 text-left text-[10px] text-fg sm:px-1.5 sm:text-[11px]"
                style={{ background: `color-mix(in oklch, ${color(e.category)} 45%, #1c1a18)` }}
                title={`${e.allDay ? "종일" : e.start} ${e.title}`}
              >
                {e.source === "google" ? "G · " : ""}
                {e.title}
              </button>
            )),
            ...extra,
          ];
          const isSel = date === selected;
          const wx = inMonth ? weather(date) : undefined;
          return (
            <div
              key={date}
              role="button"
              tabIndex={0}
              aria-label={`${longLabel(date)}, 일정 ${list.length}건`}
              aria-pressed={isSel}
              title="더블클릭해 일정 등록"
              onClick={() => onSelect(date)}
              onDoubleClick={() => onCreate(date)}
              onKeyDown={(e) => e.key === "Enter" && onCreate(date)}
              className="flex min-w-0 cursor-pointer flex-col gap-0.5 rounded-lg border p-1 select-none sm:gap-1 sm:rounded-xl sm:p-2"
              style={{
                background: isSel ? "rgb(255 255 255 / .08)" : "rgb(255 255 255 / .02)",
                borderColor: isSel ? "var(--color-accent)" : "rgb(255 255 255 / .05)",
                opacity: inMonth ? 1 : 0.4,
              }}
            >
              <div className="flex items-center justify-between gap-1">
                {date === today ? (
                  <span className="flex size-[22px] items-center justify-center rounded-full bg-accent text-xs font-bold text-ink">
                    {parts(date).d}
                  </span>
                ) : (
                  <span className="pl-0.5 text-[13px] font-semibold sm:pl-1">{parts(date).d}</span>
                )}
                {wx && <span className="hidden truncate text-[10px] text-subtle sm:inline">{wx}</span>}
              </div>
              {items.slice(0, items.length > VISIBLE ? VISIBLE - 1 : VISIBLE)}
              {items.length > VISIBLE && <span className="pl-1 text-[10px] text-subtle">+{items.length - VISIBLE + 1}</span>}
            </div>
          );
        })}
      </div>
    </>
  );
}
