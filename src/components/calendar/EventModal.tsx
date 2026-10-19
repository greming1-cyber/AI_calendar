"use client";

import { useState } from "react";
import { Modal, useToast } from "@/components/ui";
import { addDays, diffDays, longLabel, parts } from "@/lib/date";
import { won } from "@/lib/format";
import { useDeleteEvent, useEventCategories, useLinkedItems, useSaveEvent } from "@/lib/hooks/use-events";
import { useGoogleCalendars, useGoogleStatus } from "@/lib/hooks/use-google";
import { useProfile, useTimezone } from "@/lib/hooks/use-profile";
import { useToday } from "@/lib/hooks/use-today";
import { dailyWeather } from "@/lib/mock-data";
import { REMINDER_OPTIONS, type CalendarEvent, type EventInput, type ISODate, type RecurrenceScope } from "@/lib/types";
import { RepeatEditor, emptyRepeat, repeatFromRRule, repeatToRRule, type RepeatState } from "./RepeatEditor";
import { ScopeChooser } from "./ScopeChooser";

type Form = Omit<EventInput, "endDate" | "rrule"> & { endDate: ISODate };

const blank = (date: ISODate, initial?: Partial<EventInput>): Form => ({
  date,
  allDay: false,
  start: "09:00",
  end: "10:00",
  title: "",
  category: "",
  location: "",
  source: "local",
  repeat: "안 함",
  reminder: "10분 전",
  memo: "",
  ...initial,
  endDate: initial?.endDate ?? initial?.date ?? date,
});

const fromEvent = (e: CalendarEvent): Form => ({
  date: e.date,
  endDate: e.endDate,
  allDay: e.allDay,
  start: e.start || "09:00",
  end: e.end || (e.start ? "" : "10:00"),
  title: e.title,
  category: e.category,
  location: e.location,
  source: e.source,
  repeat: e.repeat,
  reminder: e.reminder,
  memo: e.memo,
  googleCalendarId: e.googleCalendarId ?? null,
});

/** 반복 회차(원본에서 펼친 것)인지. 예외 일정은 seriesId가 있어도 회차가 아니다 */
const isOccurrence = (e: CalendarEvent | null | undefined) => Boolean(e && e.rrule && e.id.includes(":"));
const isException = (e: CalendarEvent | null | undefined) => Boolean(e && e.seriesId && !e.id.includes(":"));

export interface EventModalProps {
  open: boolean;
  onClose: () => void;
  /** 새 일정 기본값. date가 없으면 오늘 */
  initial?: Partial<EventInput>;
  /** 수정할 일정. 없으면 등록 */
  event?: CalendarEvent | null;
  /** 같은 날 일정 칩(눌러서 수정 대상을 바꾼다) */
  dayEvents?: CalendarEvent[];
  onPick?: (event: CalendarEvent | null) => void;
}

/**
 * EVT-02/03/04/07: 일정 등록·수정 모달. 06이 빠른 등록에서 `{ open, onClose, initial }`로 재사용한다.
 * 반복 회차를 저장·삭제하면 범위(이 일정만/이후 모두/전체)를 묻는다.
 */
export function EventModal(props: EventModalProps) {
  if (!props.open) return null;
  // 대상이 바뀌면 폼을 새로 만든다.
  return <EventForm key={props.event?.id ?? `new-${props.initial?.date ?? ""}`} {...props} />;
}

function EventForm({ onClose, initial, event, dayEvents = [], onPick }: EventModalProps) {
  const toast = useToast();
  const tz = useTimezone();
  const today = useToday();
  const weekStart = useProfile().data?.weekStart ?? 0;
  const { data: categories = [] } = useEventCategories();
  const saveMutation = useSaveEvent();
  const deleteMutation = useDeleteEvent();
  const googleStatus = useGoogleStatus().data;
  const googleConnected = Boolean(googleStatus?.connected && !googleStatus.reauthRequired);
  const googleCalendars = useGoogleCalendars();

  const [f, setF] = useState<Form>(() => (event ? fromEvent(event) : blank(initial?.date ?? today, initial)));
  const [repeat, setRepeat] = useState<RepeatState>(() =>
    event ? repeatFromRRule(isException(event) ? null : event.rrule, event.date) : repeatFromRRule(initial?.rrule ?? null, f.date),
  );
  const [pending, setPending] = useState<"save" | "delete" | null>(null);
  const set = <K extends keyof Form>(k: K, v: Form[K]) => setF((s) => ({ ...s, [k]: v }));

  const category = f.category || categories.find((c) => c.name === "개인")?.name || categories[0]?.name || "";
  const busy = saveMutation.isPending || deleteMutation.isPending;
  const editing = Boolean(event);
  // GCAL-06: 내보낼 수 있는(켜져 있고 가져오기 전용이 아닌 쓰기 가능) 캘린더만 고른다. 기본값은 기본 캘린더.
  const exportable = (googleCalendars.data ?? []).filter((c) => c.writable && c.enabled && c.direction !== "import");
  const googleCalendarId = editing
    ? (f.googleCalendarId ?? null)
    : (exportable.find((c) => c.id === f.googleCalendarId) ?? exportable.find((c) => c.isPrimary) ?? exportable[0])?.id ?? null;
  const noExportable = !editing && f.source === "google" && googleCalendars.isSuccess && !exportable.length;
  const timeInvalid = !f.allDay && f.endDate === f.date && Boolean(f.end) && f.end <= f.start;
  const valid = f.title.trim().length > 0 && !timeInvalid && !noExportable;
  const exception = isException(event);
  const rrule = exception ? null : repeatToRRule(repeat, f.date, { allDay: f.allDay, tz });
  const ruleChanged = Boolean(event) && rrule !== (event?.rrule ?? null);

  const setDate = (date: ISODate) => {
    if (!date) return;
    // 시작일을 옮기면 기간을 유지한 채 종료일도 옮긴다.
    setF((s) => ({ ...s, date, endDate: addDays(date, Math.max(0, diffDays(s.date, s.endDate))) }));
    if (!repeat.raw) setRepeat((r) => ({ ...r, byDay: r.freq === "WEEKLY" && r.byDay.length === 1 ? emptyRepeat(date).byDay : r.byDay }));
  };

  const input = (): EventInput => ({
    ...f,
    title: f.title.trim(),
    location: f.location.trim(),
    category,
    start: f.allDay ? "" : f.start,
    end: f.allDay ? "" : f.end,
    rrule,
    googleCalendarId: f.source === "google" ? googleCalendarId : null,
  });

  const doSave = (scope?: RecurrenceScope) => {
    setPending(null);
    // 화면에는 바로 반영하고 창을 닫는다. 창이 닫혀도 결과 토스트가 뜨도록 mutateAsync를 쓴다.
    saveMutation
      .mutateAsync({ id: event?.id ?? null, input: input(), categories, scope })
      .then(() => toast.success(editing ? "일정을 수정했어요." : "일정을 등록했어요."))
      .catch(() => toast.error("일정을 저장하지 못했어요. 다시 시도해 주세요."));
    onClose();
  };

  const doDelete = (scope?: RecurrenceScope) => {
    if (!event) return;
    setPending(null);
    deleteMutation
      .mutateAsync({ id: event.id, scope })
      .then(() => toast.success("일정을 삭제했어요."))
      .catch(() => toast.error("일정을 삭제하지 못했어요. 다시 시도해 주세요."));
    onClose();
  };

  const save = () => {
    if (!valid || busy) return;
    if (isOccurrence(event)) setPending("save");
    else doSave();
  };

  const remove = () => {
    if (!event || busy) return;
    if (isOccurrence(event) || exception) setPending("delete");
    else doDelete();
  };

  const { y } = parts(f.date);

  return (
    <Modal
      open
      onClose={onClose}
      title={editing ? "일정 수정" : "일정 등록"}
      subtitle={`${y}년 ${longLabel(f.date)}${f.endDate > f.date ? ` – ${longLabel(f.endDate)}` : ""}`}
      footer={
        pending ? null : (
          <>
            {editing && (
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
              {editing ? "수정 저장" : "등록"}
            </button>
          </>
        )
      }
    >
      {dayEvents.length > 0 && onPick && (
        <div className="flex flex-wrap gap-1.5">
          {dayEvents.map((e) => (
            <button
              key={e.id}
              type="button"
              onClick={() => onPick(e)}
              className={`pill border-white/15 px-3 py-[7px] ${event?.id === e.id ? "bg-fg text-ink" : ""}`}
            >
              {e.allDay ? "종일" : e.start} {e.title}
            </button>
          ))}
          <button
            type="button"
            onClick={() => onPick(null)}
            className={`pill border-dashed border-white/30 px-3 py-[7px] ${!event ? "bg-fg text-ink" : ""}`}
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
          onKeyDown={(e) => e.key === "Enter" && !e.nativeEvent.isComposing && save()}
          placeholder="일정 제목"
          className="field text-base"
        />
      </label>

      <div className="flex flex-col gap-2.5">
        <div className="flex items-center gap-3">
          <span className="text-[13px]">종일</span>
          <button
            type="button"
            role="switch"
            aria-checked={f.allDay}
            aria-label="종일"
            onClick={() => set("allDay", !f.allDay)}
            className="switch"
          />
        </div>
        <div className="grid grid-cols-[40px_1fr] items-center gap-x-2 gap-y-2 text-xs text-muted">
          <span>시작</span>
          <div className="flex min-w-0 gap-2">
            <input type="date" aria-label="시작 날짜" value={f.date} onChange={(e) => setDate(e.target.value)} className="field min-w-0 flex-1 px-3" />
            {!f.allDay && (
              <input type="time" aria-label="시작 시간" value={f.start} onChange={(e) => set("start", e.target.value)} className="field w-[118px] px-3" />
            )}
          </div>
          <span>종료</span>
          <div className="flex min-w-0 gap-2">
            <input
              type="date"
              aria-label="종료 날짜"
              min={f.date}
              value={f.endDate}
              onChange={(e) => set("endDate", e.target.value && e.target.value >= f.date ? e.target.value : f.date)}
              className="field min-w-0 flex-1 px-3"
            />
            {!f.allDay && (
              <input type="time" aria-label="종료 시간" value={f.end} onChange={(e) => set("end", e.target.value)} className="field w-[118px] px-3" />
            )}
          </div>
        </div>
        {timeInvalid && <span className="text-xs text-danger">종료 시간이 시작 시간보다 빨라요.</span>}
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
              aria-pressed={category === c.name}
              onClick={() => set("category", c.name)}
              className="pill px-3 py-[7px] text-[13px]"
              style={{
                background: category === c.name ? "rgb(255 255 255 / .12)" : "transparent",
                borderColor: category === c.name ? c.color : "rgb(255 255 255 / .15)",
              }}
            >
              <span className="size-2 rounded-xs" style={{ background: c.color }} />
              {c.name}
            </button>
          ))}
        </div>
      </div>

      {exception ? (
        <span className="text-xs text-subtle">반복 일정 중 따로 바꾼 회차예요. 이 일정만 수정돼요.</span>
      ) : (
        <RepeatEditor value={repeat} onChange={setRepeat} date={f.date} weekStart={weekStart} allDay={f.allDay} tz={tz} />
      )}

      <div className="grid grid-cols-[repeat(auto-fit,minmax(140px,1fr))] gap-3">
        <label className="flex min-w-0 flex-col gap-1.5 text-xs text-muted">
          알림
          <select value={f.reminder} onChange={(e) => set("reminder", e.target.value as Form["reminder"])} className="field">
            {REMINDER_OPTIONS.map((o) => (
              <option key={o}>{o}</option>
            ))}
          </select>
        </label>
        <label className="flex min-w-0 flex-col gap-1.5 text-xs text-muted">
          저장할 캘린더
          {/* 구글 캘린더 반영(GCAL-05·06)은 04 세션이 source='google' 일정을 내보낸다. 수정할 때는 출처를 바꾸지 않는다. */}
          <select
            value={f.source}
            disabled={editing}
            onChange={(e) => set("source", e.target.value as Form["source"])}
            className="field disabled:opacity-60"
          >
            <option value="local">내 서비스</option>
            {/* 구글이 연결돼 있을 때만 고를 수 있다. 새 구글 일정은 기본 캘린더로 보낸다. */}
            {(googleConnected || f.source === "google") && <option value="google">구글 캘린더</option>}
          </select>
        </label>
        {f.source === "google" && (
          <label className="flex min-w-0 flex-col gap-1.5 text-xs text-muted">
            구글 캘린더
            {/* 수정할 때는 저장된 캘린더를 보여 주기만 한다(캘린더 이동은 지원하지 않음). */}
            {editing ? (
              <select value={googleCalendarId ?? ""} disabled className="field disabled:opacity-60">
                <option value={googleCalendarId ?? ""}>
                  {(googleCalendars.data ?? []).find((c) => c.id === googleCalendarId)?.name ?? (googleCalendarId ? "구글 캘린더" : "기본 캘린더")}
                </option>
              </select>
            ) : (
              <select
                value={googleCalendarId ?? ""}
                disabled={!exportable.length}
                onChange={(e) => set("googleCalendarId", e.target.value)}
                className="field disabled:opacity-60"
              >
                {googleCalendars.isPending && <option value="">불러오는 중…</option>}
                {noExportable && <option value="">내보낼 캘린더 없음</option>}
                {exportable.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                    {c.isPrimary ? " (기본)" : ""}
                  </option>
                ))}
              </select>
            )}
          </label>
        )}
      </div>
      {noExportable && (
        <span className="text-xs text-danger">내보낼 수 있는 구글 캘린더가 없어요. 설정 → 구글 캘린더에서 캘린더를 켜 주세요.</span>
      )}

      <label className="flex min-w-0 flex-col gap-1.5 text-xs text-muted">
        메모
        <textarea value={f.memo} onChange={(e) => set("memo", e.target.value)} rows={3} placeholder="메모" className="field resize-y" />
      </label>

      {event && <EventLinks event={event} today={today} />}

      {pending && (
        <ScopeChooser
          action={pending}
          disabled={pending === "save" && ruleChanged ? ["this"] : []}
          onPick={(scope) => (pending === "save" ? doSave(scope) : doDelete(scope))}
          onCancel={() => setPending(null)}
        />
      )}
    </Modal>
  );
}

/** EVT-07: 일정에 연결된 할일·지출과 그날 날씨 */
function EventLinks({ event, today }: { event: CalendarEvent; today: ISODate }) {
  const linked = useLinkedItems(event.id);
  // TODO(04): useWeather(date)로 바꾼다. 지금은 예시 예보다.
  const weather = dailyWeather(today)[event.date];
  const todos = linked.data?.todos ?? [];
  const txs = linked.data?.transactions ?? [];

  return (
    <section aria-label="연결된 항목" className="flex flex-col gap-2 border-t border-line pt-3 text-[13px]">
      <div className="flex items-center justify-between text-xs text-muted">
        <span>연결된 항목</span>
        <span>{weather ? `날씨 ${weather.label} · 강수 ${weather.rainChance}%` : "날씨: 예보 기간 밖"}</span>
      </div>
      {linked.isPending && <span className="text-xs text-subtle">불러오는 중…</span>}
      {linked.isError && <span className="text-xs text-danger">연결된 항목을 불러오지 못했어요.</span>}
      {linked.isSuccess && !todos.length && !txs.length && <span className="text-xs text-subtle">연결된 할일·지출이 없어요.</span>}
      {todos.map((t) => (
        <div key={t.id} className="flex items-center gap-2">
          <span className={t.done ? "text-ok" : "text-subtle"}>{t.done ? "✓" : "○"}</span>
          <span className={t.done ? "text-subtle line-through" : ""}>{t.title}</span>
          {t.dueDate && <span className="ml-auto text-[11px] text-subtle">{t.dueDate.slice(5).replace("-", "/")}</span>}
        </div>
      ))}
      {txs.map((t) => (
        <div key={t.id} className="flex items-center gap-2">
          <span className="text-subtle">₩</span>
          <span className="truncate">{t.memo || (t.type === "income" ? "수입" : "지출")}</span>
          <span className={`ml-auto font-mono text-xs ${t.type === "income" ? "text-income" : ""}`}>
            {t.type === "income" ? "+" : "-"}
            {won(t.amount)}
          </span>
        </div>
      ))}
    </section>
  );
}
