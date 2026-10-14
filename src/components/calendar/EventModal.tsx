"use client";

import { useState } from "react";
import { Modal, useToast } from "@/components/ui";
import { longLabel, parts } from "@/lib/date";
import { useDeleteEvent, useSaveEvent } from "@/lib/hooks/use-events";
import {
  REMINDER_OPTIONS,
  REPEAT_OPTIONS,
  type CalendarEvent,
  type EventCategory,
  type EventInput,
  type ISODate,
} from "@/lib/types";

const blank = (date: ISODate, category: string): EventInput => ({
  date,
  allDay: false,
  start: "09:00",
  end: "10:00",
  title: "",
  category,
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
  categories: EventCategory[];
  onPick: (id: string | null) => void;
  onClose: () => void;
}

/** EVT-02/03: 일정 등록·수정. 날짜를 더블클릭하거나 일정을 눌러 연다. TODO(01): 공용 등록 모달 계약({ open, onClose, initial })으로 정리 */
export function EventModal({ date, editId, dayEvents, categories, onPick, onClose }: Props) {
  const toast = useToast();
  const saveMutation = useSaveEvent();
  const deleteMutation = useDeleteEvent();
  const editing = dayEvents.find((e) => e.id === editId);
  const defaultCategory = categories.find((c) => c.name === "개인")?.name ?? categories[0]?.name ?? "";
  const [f, setF] = useState<EventInput>(() => (editing ? toInput(editing) : blank(date, defaultCategory)));
  const set = <K extends keyof EventInput>(k: K, v: EventInput[K]) => setF((s) => ({ ...s, [k]: v }));
  const busy = saveMutation.isPending || deleteMutation.isPending;
  const valid = f.title.trim().length > 0;

  const save = () => {
    if (!valid || busy) return;
    const input = {
      ...f,
      title: f.title.trim(),
      location: f.location.trim(),
      start: f.allDay ? "" : f.start,
      end: f.allDay ? "" : f.end,
    };
    saveMutation.mutate(
      { id: editId, input, categories },
      {
        onSuccess: () => {
          toast.success(editId ? "일정을 수정했어요." : "일정을 등록했어요.");
          onClose();
        },
        onError: () => toast.error("일정을 저장하지 못했어요."),
      },
    );
  };

  const remove = () => {
    if (!editId || busy) return;
    deleteMutation.mutate(editId, {
      onSuccess: () => {
        toast.success("일정을 삭제했어요.");
        onClose();
      },
      onError: () => toast.error("일정을 삭제하지 못했어요."),
    });
  };

  const { y } = parts(date);

  return (
    <Modal
      open
      onClose={onClose}
      title={editId ? "일정 수정" : "일정 등록"}
      subtitle={`${y}년 ${longLabel(date)}`}
      footer={
        <>
          {editId && (
            <button type="button" onClick={remove} disabled={busy} className="pill pill-danger px-4 py-2.5 text-[13px]">
              삭제
            </button>
          )}
          <button type="button" onClick={onClose} className="pill ml-auto px-4 py-2.5 text-[13px]">
            취소
          </button>
          <button
            type="button"
            onClick={save}
            disabled={!valid || busy}
            className="pill pill-accent px-5 py-2.5 text-[13px] disabled:cursor-not-allowed disabled:opacity-45"
          >
            {saveMutation.isPending ? "저장 중…" : editId ? "수정 저장" : "등록"}
          </button>
        </>
      }
    >
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
          {categories.map((c) => (
            <button
              key={c.id}
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
          {/* 구글 캘린더 저장(GCAL-06)은 04 세션이 연결한다. */}
          <select value="local" disabled className="field">
            <option value="local">내 서비스</option>
          </select>
        </label>
      </div>

      <label className="flex min-w-0 flex-col gap-1.5 text-xs text-muted">
        메모
        <textarea value={f.memo} onChange={(e) => set("memo", e.target.value)} rows={3} placeholder="메모" className="field resize-y" />
      </label>
    </Modal>
  );
}
