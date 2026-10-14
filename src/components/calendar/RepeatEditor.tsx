"use client";

import { parts } from "@/lib/date";
import { WEEKDAY_CODES, buildRRule, describeRRule, parseRRule, untilValue, type ByDay, type Freq, type Weekday } from "@/lib/rrule";
import type { ISODate } from "@/lib/types";
import { weekdayLabels } from "./grid";

/** 등록 모달의 반복 설정 상태(EVT-04). RRULE과 오간다 */
export interface RepeatState {
  freq: Freq | "NONE";
  interval: number;
  byDay: Weekday[];
  /** 매월: 날짜 기준(14일) / 요일 기준(둘째 수요일) */
  monthMode: "date" | "weekday";
  end: "never" | "until" | "count";
  until: ISODate;
  count: number;
  /** 화면에서 만들 수 없는 규칙(구글에서 온 BYSETPOS 등)은 원문을 그대로 둔다 */
  raw: string | null;
}

const FREQ_OPTIONS: { value: RepeatState["freq"]; label: string; unit: string }[] = [
  { value: "NONE", label: "안 함", unit: "" },
  { value: "DAILY", label: "매일", unit: "일" },
  { value: "WEEKLY", label: "매주", unit: "주" },
  { value: "MONTHLY", label: "매월", unit: "개월" },
  { value: "YEARLY", label: "매년", unit: "년" },
];

const ORD_LABEL: Record<number, string> = { 1: "첫째", 2: "둘째", 3: "셋째", 4: "넷째", [-1]: "마지막" };

/** 그 날짜가 그 달의 몇째 요일인지. 마지막 주면 -1 */
const weekdayOrdinal = (date: ISODate) => {
  const { y, m, d, dow } = parts(date);
  const last = new Date(Date.UTC(y, m, 0)).getUTCDate();
  return { ord: d + 7 > last ? -1 : Math.ceil(d / 7), day: WEEKDAY_CODES[dow] };
};

export const emptyRepeat = (date: ISODate): RepeatState => ({
  freq: "NONE",
  interval: 1,
  byDay: [WEEKDAY_CODES[parts(date).dow]],
  monthMode: "date",
  end: "never",
  until: date,
  count: 10,
  raw: null,
});

export function repeatFromRRule(rrule: string | null, date: ISODate): RepeatState {
  const base = emptyRepeat(date);
  if (!rrule) return base;
  try {
    const r = parseRRule(rrule);
    const simple =
      !r.byMonth.length &&
      !r.byMonthDay.length &&
      (r.freq === "WEEKLY" ? r.byDay.every((b) => b.ord === undefined) : r.freq === "MONTHLY" ? r.byDay.length <= 1 : !r.byDay.length);
    if (!simple) return { ...base, freq: r.freq, raw: rrule };
    const until = r.until ? `${r.until.slice(0, 4)}-${r.until.slice(4, 6)}-${r.until.slice(6, 8)}` : date;
    return {
      ...base,
      freq: r.freq,
      interval: r.interval,
      byDay: r.freq === "WEEKLY" && r.byDay.length ? r.byDay.map((b) => b.day) : base.byDay,
      monthMode: r.freq === "MONTHLY" && r.byDay.length ? "weekday" : "date",
      end: r.count !== undefined ? "count" : r.until ? "until" : "never",
      until,
      count: r.count ?? base.count,
    };
  } catch {
    return { ...base, freq: "DAILY", raw: rrule };
  }
}

export function repeatToRRule(s: RepeatState, date: ISODate, opts: { allDay: boolean; tz: string }): string | null {
  if (s.freq === "NONE") return null;
  if (s.raw) return s.raw;
  let byDay: ByDay[] = [];
  if (s.freq === "WEEKLY") byDay = s.byDay.map((day) => ({ day }));
  if (s.freq === "MONTHLY" && s.monthMode === "weekday") byDay = [weekdayOrdinal(date)];
  return buildRRule({
    freq: s.freq,
    interval: Math.max(1, s.interval),
    byDay,
    count: s.end === "count" ? Math.max(1, s.count) : undefined,
    until: s.end === "until" ? untilValue(s.until < date ? date : s.until, opts) : undefined,
  });
}

export function RepeatEditor({
  value,
  onChange,
  date,
  weekStart,
  allDay,
  tz,
}: {
  value: RepeatState;
  onChange: (v: RepeatState) => void;
  date: ISODate;
  weekStart: 0 | 1;
  allDay: boolean;
  tz: string;
}) {
  const set = (patch: Partial<RepeatState>) => onChange({ ...value, ...patch, raw: null });
  const freq = FREQ_OPTIONS.find((f) => f.value === value.freq)!;
  const rrule = repeatToRRule(value, date, { allDay, tz });
  const ordinal = weekdayOrdinal(date);
  const dayOrder = weekdayLabels(weekStart).map((label, i) => ({ label, code: WEEKDAY_CODES[(i + weekStart) % 7] }));

  return (
    <div className="flex min-w-0 flex-col gap-2.5 text-xs text-muted">
      <label className="flex min-w-0 flex-col gap-1.5">
        반복
        <select
          value={value.freq}
          onChange={(e) => onChange({ ...value, freq: e.target.value as RepeatState["freq"], raw: null })}
          className="field"
        >
          {FREQ_OPTIONS.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
      </label>

      {value.freq !== "NONE" && value.raw && (
        <div className="flex flex-wrap items-center gap-2 rounded-xl bg-white/5 px-3 py-2.5 text-[13px] text-fg">
          {safeDescribe(value.raw, date)}
          <button type="button" onClick={() => set({})} className="pill ml-auto px-3 py-1.5">
            다시 설정
          </button>
        </div>
      )}

      {value.freq !== "NONE" && !value.raw && (
        <div className="flex flex-col gap-2.5 rounded-xl bg-white/[.04] p-3">
          <div className="flex flex-wrap items-center gap-2 text-[13px] text-fg">
            <input
              type="number"
              min={1}
              max={99}
              aria-label="반복 간격"
              value={value.interval}
              onChange={(e) => set({ interval: Math.max(1, Number(e.target.value) || 1) })}
              className="field w-[72px] px-3 py-2"
            />
            {freq.unit}마다
          </div>

          {value.freq === "WEEKLY" && (
            <div className="flex flex-wrap gap-1" role="group" aria-label="반복 요일">
              {dayOrder.map(({ label, code }) => {
                const on = value.byDay.includes(code);
                return (
                  <button
                    key={code}
                    type="button"
                    aria-pressed={on}
                    onClick={() => {
                      const next = on ? value.byDay.filter((d) => d !== code) : [...value.byDay, code];
                      set({ byDay: next.length ? next : value.byDay });
                    }}
                    className={`pill size-8 justify-center p-0 text-[13px] ${on ? "border-transparent bg-fg font-bold text-ink" : ""}`}
                  >
                    {label}
                  </button>
                );
              })}
            </div>
          )}

          {value.freq === "MONTHLY" && (
            <div className="seg self-start">
              <button type="button" aria-pressed={value.monthMode === "date"} onClick={() => set({ monthMode: "date" })} className="seg-item">
                {parts(date).d}일
              </button>
              <button
                type="button"
                aria-pressed={value.monthMode === "weekday"}
                onClick={() => set({ monthMode: "weekday" })}
                className="seg-item"
              >
                {ORD_LABEL[ordinal.ord]} {weekdayLabels(0)[parts(date).dow]}요일
              </button>
            </div>
          )}

          <div className="flex flex-wrap items-center gap-2">
            <span className="text-[13px] text-fg">종료</span>
            <div className="seg">
              {(
                [
                  ["never", "없음"],
                  ["until", "날짜"],
                  ["count", "횟수"],
                ] as const
              ).map(([v, label]) => (
                <button key={v} type="button" aria-pressed={value.end === v} onClick={() => set({ end: v })} className="seg-item px-3">
                  {label}
                </button>
              ))}
            </div>
            {value.end === "until" && (
              <input
                type="date"
                aria-label="반복 종료 날짜"
                min={date}
                value={value.until}
                onChange={(e) => set({ until: e.target.value || date })}
                className="field w-[160px] px-3 py-2"
              />
            )}
            {value.end === "count" && (
              <span className="flex items-center gap-1.5 text-[13px] text-fg">
                <input
                  type="number"
                  min={1}
                  max={999}
                  aria-label="반복 횟수"
                  value={value.count}
                  onChange={(e) => set({ count: Math.max(1, Number(e.target.value) || 1) })}
                  className="field w-[80px] px-3 py-2"
                />
                회
              </span>
            )}
          </div>
          {rrule && <span className="text-[12px] text-subtle">{safeDescribe(rrule, date)}</span>}
        </div>
      )}
    </div>
  );
}

const safeDescribe = (rrule: string, date: ISODate) => {
  try {
    return describeRRule(rrule, date);
  } catch {
    return "사용자 지정 반복";
  }
};
