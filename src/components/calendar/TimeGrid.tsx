"use client";

import { useEffect, useRef, useState, type CSSProperties, type PointerEvent as ReactPointerEvent, type ReactNode } from "react";
import { WEEKDAYS, parts } from "@/lib/date";
import type { CalendarEvent, ISODate } from "@/lib/types";
import { eventsOn, fromMinutes, layoutDay } from "./grid";

const HOUR = 44; // 1시간 높이(px)
const SNAP = 15; // 드래그 단위(분)
const DAY = 24 * 60;

interface Drag {
  e: CalendarEvent;
  mode: "move" | "resize";
  x: number;
  y: number;
  dayIndex: number;
  range: [number, number];
  dMin: number;
  dDay: number;
  moved: boolean;
}

/**
 * 주·일 보기(EVT-01): 0~24시 시간 축 위에 일정 블록, 위쪽 띠에 종일·여러 날 일정.
 * 블록을 끌면 시간 이동(주 보기는 다른 요일로도), 아래쪽 끝을 끌면 길이 조정(EVT-05). 단위는 15분.
 */
export function TimeGrid({
  days,
  events,
  today,
  selected,
  nowMinute,
  color,
  extras,
  onSelectDate,
  onCreate,
  onOpen,
  onMove,
}: {
  days: ISODate[];
  events: CalendarEvent[];
  today: ISODate;
  selected: ISODate;
  /** 지금 시각(분). 오늘 칸에 선을 긋는다 */
  nowMinute: number;
  color: (category: string) => string;
  /** 종일 띠에 덧붙일 칩(할일·고정지출) */
  extras?: (date: ISODate) => ReactNode;
  onSelectDate: (date: ISODate) => void;
  onCreate: (date: ISODate, start?: string) => void;
  onOpen: (e: CalendarEvent) => void;
  onMove: (e: CalendarEvent, change: { date: ISODate; start: string; end: string }) => void;
}) {
  const scroller = useRef<HTMLDivElement>(null);
  const columns = useRef<HTMLDivElement>(null);
  const [drag, setDrag] = useState<Drag | null>(null);

  // 처음 열면 오전 8시 근처로 스크롤한다.
  useEffect(() => {
    if (scroller.current) scroller.current.scrollTop = 8 * HOUR - 8;
  }, []);

  const banded = (e: CalendarEvent) => e.allDay || e.endDate > e.date;
  const draggable = (e: CalendarEvent) => !e.allDay && e.endDate === e.date && !e.id.startsWith("temp-");

  const begin = (ev: ReactPointerEvent<HTMLElement>, e: CalendarEvent, mode: Drag["mode"], dayIndex: number, range: [number, number]) => {
    if (ev.button !== 0) return;
    ev.stopPropagation();
    ev.currentTarget.setPointerCapture(ev.pointerId);
    setDrag({ e, mode, x: ev.clientX, y: ev.clientY, dayIndex, range, dMin: 0, dDay: 0, moved: false });
  };

  const track = (ev: ReactPointerEvent<HTMLElement>) => {
    if (!drag) return;
    const dy = ev.clientY - drag.y;
    const dx = ev.clientX - drag.x;
    const colWidth = (columns.current?.getBoundingClientRect().width ?? 1) / days.length;
    const dMin = Math.round(((dy / HOUR) * 60) / SNAP) * SNAP;
    const dDay =
      drag.mode === "move" ? Math.max(-drag.dayIndex, Math.min(days.length - 1 - drag.dayIndex, Math.round(dx / colWidth))) : 0;
    setDrag({ ...drag, dMin, dDay, moved: drag.moved || Math.abs(dy) > 4 || Math.abs(dx) > 4 });
  };

  /** 드래그 결과 [시작, 끝] 분 */
  const result = (d: Drag): [number, number] => {
    const [s, e] = d.range;
    if (d.mode === "resize") return [s, Math.min(DAY, Math.max(s + SNAP, e + d.dMin))];
    const len = e - s;
    const start = Math.max(0, Math.min(DAY - len, s + d.dMin));
    return [start, start + len];
  };

  const finish = () => {
    if (!drag) return;
    const d = drag;
    setDrag(null);
    if (!d.moved) return onOpen(d.e);
    const [s, e] = result(d);
    const date = days[d.dayIndex + d.dDay];
    if (date === d.e.date && s === d.range[0] && e === d.range[1]) return;
    // 끝이 없던 일정은 이동할 때 끝을 만들지 않는다.
    const end = d.mode === "move" && !d.e.end ? "" : fromMinutes(e === DAY ? DAY - 1 : e);
    onMove(d.e, { date, start: fromMinutes(s), end });
  };

  const block = (e: CalendarEvent, range: [number, number], style: CSSProperties, dayIndex: number, ghost = false) => {
    const [s, en] = range;
    const short = en - s < 45;
    const canDrag = draggable(e) && !ghost;
    const dragging = drag?.e.id === e.id && drag.moved && !ghost;
    return (
      <div
        key={ghost ? `ghost-${e.id}` : e.id}
        role={ghost ? undefined : "button"}
        tabIndex={ghost ? -1 : 0}
        aria-label={ghost ? undefined : `${e.title} ${e.start}${e.end ? `–${e.end}` : ""}`}
        onPointerDown={canDrag ? (ev) => begin(ev, e, "move", dayIndex, range) : undefined}
        onPointerMove={canDrag ? track : undefined}
        onPointerUp={canDrag ? finish : undefined}
        onPointerCancel={() => setDrag(null)}
        onClick={canDrag || ghost ? undefined : () => onOpen(e)}
        onKeyDown={(ev) => ev.key === "Enter" && onOpen(e)}
        className={`absolute overflow-hidden rounded-md border-l-2 px-1 text-[11px] leading-tight text-fg select-none ${
          canDrag ? "cursor-grab touch-none active:cursor-grabbing" : "cursor-pointer"
        } ${ghost ? "pointer-events-none z-20 shadow-[0_8px_24px_rgb(0_0_0/.45)] ring-1 ring-accent" : "z-10"}`}
        style={{
          ...style,
          top: (s / 60) * HOUR,
          height: Math.max(((en - s) / 60) * HOUR - 2, 14),
          background: `color-mix(in oklch, ${color(e.category)} 42%, #1c1a18)`,
          borderColor: color(e.category),
          opacity: dragging ? 0.35 : 1,
        }}
      >
        <div className={short ? "truncate" : "line-clamp-2"}>
          {e.source === "google" ? "G · " : ""}
          {e.title}
        </div>
        {!short && (
          <div className="truncate text-[10px] text-muted">
            {fromMinutes(s)}
            {e.end || ghost ? `–${fromMinutes(Math.min(en, DAY - 1))}` : ""}
          </div>
        )}
        {canDrag && (
          <div
            aria-hidden
            onPointerDown={(ev) => begin(ev, e, "resize", dayIndex, range)}
            onPointerMove={track}
            onPointerUp={finish}
            className="absolute inset-x-0 bottom-0 h-2 cursor-ns-resize"
          />
        )}
      </div>
    );
  };

  const cols = `36px repeat(${days.length}, minmax(0, 1fr))`;

  return (
    <div className="flex min-w-0 flex-col">
      {/* 요일 머리 */}
      <div className="grid border-b border-line pb-2" style={{ gridTemplateColumns: cols }}>
        <span />
        {days.map((d) => {
          const p = parts(d);
          const isToday = d === today;
          return (
            <button
              key={d}
              type="button"
              onClick={() => onSelectDate(d)}
              aria-pressed={d === selected}
              className="flex min-w-0 flex-col items-center gap-0.5 rounded-lg py-1 text-xs text-subtle aria-pressed:bg-white/[.06]"
            >
              {WEEKDAYS[p.dow]}
              <span
                className={`flex size-7 items-center justify-center rounded-full text-[15px] font-semibold ${
                  isToday ? "bg-accent text-ink" : "text-fg"
                }`}
              >
                {p.d}
              </span>
            </button>
          );
        })}
      </div>

      {/* 종일·여러 날 일정 띠 */}
      <div className="grid border-b border-line py-1.5" style={{ gridTemplateColumns: cols }}>
        <span className="self-center text-[10px] text-subtle">종일</span>
        {days.map((d) => (
          <div key={d} className="flex min-w-0 flex-col gap-0.5 px-0.5" onDoubleClick={() => onCreate(d)}>
            {eventsOn(events, d)
              .filter(banded)
              .map((e) => (
                <button
                  key={e.id}
                  type="button"
                  onClick={() => onOpen(e)}
                  className="truncate rounded-[5px] px-1.5 py-0.5 text-left text-[11px] text-fg"
                  style={{ background: `color-mix(in oklch, ${color(e.category)} 45%, #1c1a18)` }}
                >
                  {e.source === "google" ? "G · " : ""}
                  {e.title}
                </button>
              ))}
            {extras?.(d)}
          </div>
        ))}
      </div>

      {/* 시간 축 */}
      <div ref={scroller} className="max-h-[min(640px,65vh)] overflow-y-auto overscroll-contain">
        <div className="relative grid" style={{ gridTemplateColumns: cols, height: 24 * HOUR }}>
          <div className="relative">
            {Array.from({ length: 24 }, (_, h) => (
              <span key={h} className="absolute right-1.5 -translate-y-1/2 text-[10px] text-subtle" style={{ top: h * HOUR }}>
                {h === 0 ? "" : `${h}시`}
              </span>
            ))}
          </div>
          <div ref={columns} className="relative grid" style={{ gridColumn: "2 / -1", gridTemplateColumns: `repeat(${days.length}, minmax(0, 1fr))` }}>
            {Array.from({ length: 24 }, (_, h) => (
              <div key={h} className="pointer-events-none absolute inset-x-0 border-t border-line" style={{ top: h * HOUR }} />
            ))}
            {days.map((d, i) => {
              const timed = eventsOn(events, d).filter((e) => !banded(e));
              return (
                <div
                  key={d}
                  className="relative border-l border-line"
                  onDoubleClick={(ev) => {
                    const top = ev.currentTarget.getBoundingClientRect().top;
                    const min = Math.floor(((ev.clientY - top) / HOUR) * 2) * 30;
                    onCreate(d, fromMinutes(min));
                  }}
                >
                  {layoutDay(timed, d).map(({ e, range, col, cols: n }) =>
                    block(e, range, { left: `calc(${(col / n) * 100}% + 1px)`, width: `calc(${100 / n}% - 2px)` }, i),
                  )}
                  {d === today && (
                    <div className="pointer-events-none absolute inset-x-0 z-30 h-px bg-danger" style={{ top: (nowMinute / 60) * HOUR }}>
                      <span className="absolute -top-1 -left-1 size-2 rounded-full bg-danger" />
                    </div>
                  )}
                </div>
              );
            })}
            {drag?.moved &&
              (() => {
                const target = drag.dayIndex + drag.dDay;
                const width = 100 / days.length;
                return block(drag.e, result(drag), { left: `calc(${target * width}% + 2px)`, width: `calc(${width}% - 4px)` }, target, true);
              })()}
          </div>
        </div>
      </div>
      <span className="pt-2 text-[11px] text-subtle">빈 시간을 더블클릭해 등록 · 일정을 끌어 시간 이동 · 아래 끝을 끌어 길이 조정</span>
    </div>
  );
}


