"use client";

import { useEffect, useState } from "react";
import { longLabel, parts } from "@/lib/date";
import { EVENT_CATEGORIES } from "@/lib/mock-data";
import { useStore } from "@/lib/store";
import { REMINDER_OPTIONS, REPEAT_OPTIONS, type CalendarEvent, type EventInput, type ISODate } from "@/lib/types";

const blank = (date: ISODate): EventInput => ({
  date,
  allDay: false,
  start: "09:00",
  end: "10:00",
  title: "",
  category: "개인",
  location: "",
  source: "local",
  repeat: "안 함",
  reminder: "10분 전",
  memo: "",
});

const toInput = (e: CalendarEvent): EventInput => {
  const { id, ...rest } = e;
  void id;
  return { ...rest, start: rest.start || "09:00" };
};

interface Props {
  date: ISODate;
  editId: string | null;
  dayEvents: CalendarEvent[];
  onPick: (id: string | null) => void;
  onClose: () => void;
}

/** EVT-02/03: 일정 등록·수정. 날짜를 더블클릭하거나 일정을 눌러 연다. */
export function EventModal({ date, editId, dayEvents, onPick, onClose }: Props) {
  const { saveEvent, deleteEvent } = useStore();
  const editing = dayEvents.find((e) => e.id === editId);
  const [f, setF] = useState<EventInput>(() => (editing ? toInput(editing) : blank(date)));
  const set = <K extends keyof EventInput>(k: K, v: EventInput[K]) => setF((s) => ({ ...s, [k]: v }));
  const valid = f.title.trim().length > 0;

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const save = () => {
    if (!valid) return;
    saveEvent(editId, {
      ...f,
      title: f.title.trim(),
      location: f.location.trim(),
      start: f.allDay ? "" : f.start,
      end: f.allDay ? "" : f.end,
    });
    onClose();
  };

  const remove = () => {
    if (!editId) return;
    deleteEvent(editId);
    onClose();
  };

  const { y } = parts(date);

  return (
    <div
      onClick={onClose}
      className="fixed inset-0 z-50 flex items-center justify-center bg-[rgb(10_9_8/.6)] p-6 backdrop-blur-sm"
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="event-modal-title"
        onClick={(e) => e.stopPropagation()}
        className="flex max-h-[calc(100vh-48px)] w-[min(560px,100%)] flex-col gap-4 overflow-auto rounded-3xl border border-white/10 bg-surface p-6 shadow-[0_30px_80px_rgb(0_0_0/.5)]"
      >
        <div className="flex items-start gap-3">
          <div className="flex flex-1 flex-col gap-1">
            <span id="event-modal-title" className="text-xl font-bold">
              {editId ? "일정 수정" : "일정 등록"}
            </span>
            <span className="text-[13px] text-muted">
              {y}년 {longLabel(date)}
            </span>
          </div>
          <button type="button" onClick={onClose} aria-label="닫기" className="pill size-8 justify-center p-0 text-sm">
            ✕
          </button>
        </div>

        {dayEvents.length > 0 && (
          <div className="flex flex-wrap gap-1.5">
            {dayEvents.map((e) => (
              <button
                key={e.id}
                type="button"
                onClick={() => onPick(e.id)}
                className={`pill border-white/15 px-3 py-[7px] ${editId === e.id ? "bg-fg text-ink" : ""}`}
              >
                {e.allDay ? "종일" : e.start} {e.title}
              </button>
            ))}
            <button
              type="button"
              onClick={() => onPick(null)}
              className={`pill border-dashed border-white/30 px-3 py-[7px] ${editId == null ? "bg-fg text-ink" : ""}`}
            >
              + 새 일정
            </button>
          </div>
        )}

        <label className="flex min-w-0 flex-col gap-1.5 text-xs text-muted">
          제목
          <input
            autoFocus
            value={f.title}
            onChange={(e) => set("title", e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && save()}
            placeholder="일정 제목"
            className="field text-base"
          />
        </label>

        <div className="flex flex-wrap items-center gap-3">
          <span className="text-[13px]">종일</span>
          <button
            type="button"
            role="switch"
            aria-checked={f.allDay}
            aria-label="종일"
            onClick={() => set("allDay", !f.allDay)}
            className="switch"
          />
          {!f.allDay && (
            <div className="ml-auto flex items-center gap-2">
              <input type="time" aria-label="시작 시간" value={f.start} onChange={(e) => set("start", e.target.value)} className="field w-[130px]" />
              <span className="text-subtle">–</span>
              <input type="time" aria-label="종료 시간" value={f.end} onChange={(e) => set("end", e.target.value)} className="field w-[130px]" />
            </div>
          )}
        </div>

        <label className="flex min-w-0 flex-col gap-1.5 text-xs text-muted">
          장소
          <input value={f.location} onChange={(e) => set("location", e.target.value)} placeholder="장소 입력" className="field" />
        </label>

        <div className="flex min-w-0 flex-col gap-1.5 text-xs text-muted">
          카테고리
          <div className="flex flex-wrap gap-1.5">
            {EVENT_CATEGORIES.map((c) => (
              <button
                key={c.name}
                type="button"
                aria-pressed={f.category === c.name}
                onClick={() => set("category", c.name)}
                className="pill px-3 py-[7px] text-[13px]"
                style={{
                  background: f.category === c.name ? "rgb(255 255 255 / .12)" : "transparent",
                  borderColor: f.category === c.name ? c.color : "rgb(255 255 255 / .15)",
                }}
              >
                <span className="size-2 rounded-xs" style={{ background: c.color }} />
                {c.name}
              </button>
            ))}
          </div>
        </div>

        <div className="grid grid-cols-[repeat(auto-fit,minmax(140px,1fr))] gap-3">
          <label className="flex min-w-0 flex-col gap-1.5 text-xs text-muted">
            반복
            <select value={f.repeat} onChange={(e) => set("repeat", e.target.value as EventInput["repeat"])} className="field">
              {REPEAT_OPTIONS.map((o) => (
                <option key={o}>{o}</option>
              ))}
            </select>
          </label>
          <label className="flex min-w-0 flex-col gap-1.5 text-xs text-muted">
            알림
            <select value={f.reminder} onChange={(e) => set("reminder", e.target.value as EventInput["reminder"])} className="field">
              {REMINDER_OPTIONS.map((o) => (
                <option key={o}>{o}</option>
              ))}
            </select>
          </label>
          <label className="flex min-w-0 flex-col gap-1.5 text-xs text-muted">
            저장할 캘린더
            <select
              value={f.source}
              onChange={(e) => set("source", e.target.value as EventInput["source"])}
              className="field"
            >
              <option value="local">내 서비스</option>
              <option value="google">구글 캘린더</option>
            </select>
          </label>
        </div>

        <label className="flex min-w-0 flex-col gap-1.5 text-xs text-muted">
          메모
          <textarea value={f.memo} onChange={(e) => set("memo", e.target.value)} rows={3} placeholder="메모" className="field resize-y" />
        </label>

        <div className="flex items-center gap-2 pt-1">
          {editId && (
            <button type="button" onClick={remove} className="pill pill-danger px-4 py-2.5 text-[13px]">
              삭제
            </button>
          )}
          <button type="button" onClick={onClose} className="pill ml-auto px-4 py-2.5 text-[13px]">
            취소
          </button>
          <button
            type="button"
            onClick={save}
            disabled={!valid}
            className="pill pill-accent px-5 py-2.5 text-[13px] disabled:cursor-not-allowed disabled:opacity-45"
          >
            {editId ? "수정 저장" : "등록"}
          </button>
        </div>
      </div>
    </div>
  );
}
