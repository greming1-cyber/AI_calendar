"use client";

import { useState } from "react";
import { Modal, Segmented, useToast } from "@/components/ui";
import { addDays, parts, shortLabel } from "@/lib/date";
import { useEvents } from "@/lib/hooks/use-events";
import { useToday } from "@/lib/hooks/use-today";
import {
  useAddSubtask,
  useDeleteTodo,
  useProjects,
  useRenameTodo,
  useSaveTodo,
  useTodos,
  useToggleTodo,
} from "@/lib/hooks/use-todos";
import {
  PRIORITIES,
  PRIORITY,
  RULE_DAYS,
  RULE_FREQS,
  buildRule,
  dayLabel,
  nextDue,
  parseRule,
  ruleDayOf,
  type RuleDay,
  type RuleFreq,
} from "@/lib/todo";
import type { ISODate, Todo, TodoInput } from "@/lib/types";

interface Props {
  open: boolean;
  onClose: () => void;
  /** 등록 기본값(06 빠른 등록, 01 일정 상세의 "할일 추가") */
  initial?: Partial<TodoInput>;
  /** 수정할 할일. 없으면 등록 */
  todo?: Todo;
}

/** TODO-01/06/07/08: 할일 등록·수정. 공유 계약 { open, onClose, initial? } */
export function TodoModal({ open, onClose, initial, todo }: Props) {
  if (!open) return null;
  return <TodoForm key={todo?.id ?? "new"} onClose={onClose} initial={initial} todo={todo} />;
}

const toInput = (t: Todo): TodoInput => ({
  title: t.title,
  dueDate: t.dueDate,
  dueTime: t.dueTime ?? "",
  priority: t.priority,
  projectId: t.projectId,
  note: t.note,
  rrule: t.rrule,
  eventId: t.eventId ?? null,
  parentId: t.parentId,
});

interface RuleState {
  freq: RuleFreq | "";
  interval: number;
  byDay: RuleDay[];
  monthLast: boolean;
  until: ISODate | "";
}

function TodoForm({ onClose, initial, todo }: Omit<Props, "open">) {
  const today = useToday();
  const toast = useToast();
  const { data: projects = [] } = useProjects();
  const saveMutation = useSaveTodo();
  const deleteMutation = useDeleteTodo();

  const [f, setF] = useState<TodoInput>(() =>
    todo
      ? toInput(todo)
      : {
          title: "",
          dueDate: today,
          dueTime: "",
          priority: "normal",
          projectId: null,
          note: "",
          rrule: null,
          eventId: null,
          parentId: null,
          ...initial,
        },
  );
  const set = <K extends keyof TodoInput>(k: K, v: TodoInput[K]) => setF((s) => ({ ...s, [k]: v }));

  const [rule, setRule] = useState<RuleState>(() => {
    const r = parseRule(f.rrule);
    return {
      freq: r?.freq ?? "",
      interval: r?.interval ?? 1,
      byDay: r?.byDay.length ? r.byDay : [ruleDayOf(f.dueDate ?? today)],
      monthLast: (r?.monthDay ?? 0) < 0,
      until: r?.until ?? "",
    };
  });
  const setR = <K extends keyof RuleState>(k: K, v: RuleState[K]) => setRule((s) => ({ ...s, [k]: v }));

  const [drafts, setDrafts] = useState<string[]>([]); // 등록 모드의 서브태스크
  const [confirmDelete, setConfirmDelete] = useState(false);

  const busy = saveMutation.isPending || deleteMutation.isPending;
  const valid = f.title.trim().length > 0;
  const base = f.dueDate ?? today;

  // 반복 규칙: DB todo_next_due가 지원하는 형태만 만든다.
  const rrule = rule.freq
    ? buildRule({
        freq: rule.freq,
        interval: rule.interval,
        byDay: rule.freq === "WEEKLY" ? rule.byDay : [],
        monthDay: rule.freq === "MONTHLY" ? (rule.monthLast ? -1 : parts(base).d) : null,
        until: rule.until || null,
      })
    : null;
  const preview = rrule ? nextDue(rrule, base) : null;

  const save = () => {
    if (!valid || busy) return;
    // 반복 할일은 기준 날짜가 필요하다. 마감이 없으면 오늘로 둔다.
    const input: TodoInput = { ...f, rrule, dueDate: rrule ? base : f.dueDate, dueTime: f.dueDate ? f.dueTime : "" };
    saveMutation.mutate(
      { id: todo?.id ?? null, input, subtasks: drafts },
      {
        onSuccess: () => {
          toast.success(todo ? "할일을 수정했어요." : "할일을 등록했어요.");
          onClose();
        },
        onError: () => toast.error("할일을 저장하지 못했어요."),
      },
    );
  };

  const remove = () => {
    if (!todo || busy) return;
    if (!confirmDelete) return setConfirmDelete(true);
    deleteMutation.mutate(todo.id, {
      onSuccess: () => {
        toast.success("할일을 삭제했어요.");
        onClose();
      },
      onError: () => toast.error("할일을 삭제하지 못했어요."),
    });
  };

  return (
    <Modal
      open
      onClose={onClose}
      title={todo ? "할일 수정" : "할일 등록"}
      subtitle={todo?.done ? "완료한 할일" : undefined}
      footer={
        <>
          {todo && (
            <button type="button" onClick={remove} disabled={busy} className="pill pill-danger px-4 py-2.5 text-[13px]">
              {confirmDelete ? (todo.rrule ? "반복까지 삭제" : "정말 삭제") : "삭제"}
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
            {saveMutation.isPending ? "저장 중…" : todo ? "수정 저장" : "등록"}
          </button>
        </>
      }
    >
      <label className="flex min-w-0 flex-col gap-1.5 text-xs text-muted">
        제목
        <input
          autoFocus
          value={f.title}
          onChange={(e) => set("title", e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && !e.nativeEvent.isComposing && save()}
          placeholder="할일 제목"
          className="field text-base"
        />
      </label>

      <div className="flex min-w-0 flex-col gap-1.5 text-xs text-muted">
        마감
        <div className="flex flex-wrap items-center gap-2">
          <input
            type="date"
            aria-label="마감일"
            value={f.dueDate ?? ""}
            onChange={(e) => set("dueDate", e.target.value || null)}
            className="field w-[170px]"
          />
          {f.dueDate && (
            <>
              <span className="ml-1 text-[13px] text-fg">시간</span>
              <button
                type="button"
                role="switch"
                aria-checked={Boolean(f.dueTime)}
                aria-label="마감 시간 지정"
                onClick={() => set("dueTime", f.dueTime ? "" : "18:00")}
                className="switch"
              />
              {f.dueTime && (
                <input
                  type="time"
                  aria-label="마감 시간"
                  value={f.dueTime}
                  onChange={(e) => set("dueTime", e.target.value)}
                  className="field w-[130px]"
                />
              )}
            </>
          )}
          {f.dueDate && !rule.freq && (
            <button type="button" onClick={() => set("dueDate", null)} className="ml-auto text-xs text-subtle hover:text-fg">
              마감 없음
            </button>
          )}
        </div>
      </div>

      <div className="grid grid-cols-[repeat(auto-fit,minmax(200px,1fr))] gap-3">
        <div className="flex min-w-0 flex-col gap-1.5 text-xs text-muted">
          우선순위
          <Segmented
            options={PRIORITIES.map((p) => ({ value: p, label: PRIORITY[p].label }))}
            value={f.priority}
            onChange={(v) => set("priority", v)}
          />
        </div>
        <label className="flex min-w-0 flex-col gap-1.5 text-xs text-muted">
          프로젝트
          <select value={f.projectId ?? ""} onChange={(e) => set("projectId", e.target.value || null)} className="field">
            <option value="">프로젝트 없음</option>
            {projects.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
        </label>
      </div>

      {!f.parentId && (
        <RuleFields rule={rule} setR={setR} base={base} preview={preview} />
      )}

      {!f.parentId &&
        (todo ? (
          <SubtaskList parent={todo} />
        ) : (
          <DraftSubtasks drafts={drafts} setDrafts={setDrafts} />
        ))}

      <EventPicker base={base} value={f.eventId} onChange={(v) => set("eventId", v)} />

      <label className="flex min-w-0 flex-col gap-1.5 text-xs text-muted">
        메모
        <textarea value={f.note} onChange={(e) => set("note", e.target.value)} rows={3} placeholder="메모" className="field resize-y" />
      </label>
    </Modal>
  );
}

// ── 반복 (TODO-07) ───────────────────────────────────────

function RuleFields({
  rule,
  setR,
  base,
  preview,
}: {
  rule: RuleState;
  setR: <K extends keyof RuleState>(k: K, v: RuleState[K]) => void;
  base: ISODate;
  preview: ISODate | null;
}) {
  const unit = rule.freq ? { DAILY: "일", WEEKLY: "주", MONTHLY: "개월", YEARLY: "년" }[rule.freq] : "";
  return (
    <div className="flex min-w-0 flex-col gap-2 text-xs text-muted">
      <div className="flex items-center gap-2">
        반복
        {preview && <span className="ml-auto text-subtle">완료하면 다음 회차 {shortLabel(preview)}</span>}
      </div>
      <Segmented
        options={[{ value: "", label: "안 함" }, ...Object.entries(RULE_FREQS).map(([value, label]) => ({ value, label }))]}
        value={rule.freq}
        onChange={(v) => setR("freq", v as RuleFreq | "")}
      />
      {rule.freq === "WEEKLY" && (
        <div className="flex flex-wrap gap-1.5" role="group" aria-label="반복 요일">
          {RULE_DAYS.map((d) => {
            const on = rule.byDay.includes(d);
            return (
              <button
                key={d}
                type="button"
                aria-pressed={on}
                onClick={() =>
                  setR("byDay", on ? (rule.byDay.length > 1 ? rule.byDay.filter((x) => x !== d) : rule.byDay) : [...rule.byDay, d])
                }
                className={`pill size-9 justify-center p-0 text-[13px] ${on ? "bg-fg text-ink" : ""}`}
              >
                {dayLabel(d)}
              </button>
            );
          })}
        </div>
      )}
      {rule.freq === "MONTHLY" && (
        <Segmented
          options={[
            { value: "date", label: `매월 ${parts(base).d}일` },
            { value: "last", label: "말일" },
          ]}
          value={rule.monthLast ? "last" : "date"}
          onChange={(v) => setR("monthLast", v === "last")}
        />
      )}
      {rule.freq && (
        <div className="flex flex-wrap items-center gap-2">
          <input
            type="number"
            min={1}
            max={99}
            aria-label="반복 간격"
            value={rule.interval}
            onChange={(e) => setR("interval", Math.min(Math.max(Number(e.target.value) || 1, 1), 99))}
            className="field w-[72px]"
          />
          <span className="text-[13px] text-fg">{unit}마다</span>
          <span className="ml-auto">종료일</span>
          <input
            type="date"
            aria-label="반복 종료일"
            value={rule.until}
            min={base}
            onChange={(e) => setR("until", e.target.value)}
            className="field w-[170px]"
          />
        </div>
      )}
    </div>
  );
}

// ── 서브태스크 (TODO-06) ─────────────────────────────────

function SubtaskInput({ onAdd }: { onAdd: (title: string) => void }) {
  const [text, setText] = useState("");
  const add = () => {
    if (!text.trim()) return;
    onAdd(text.trim());
    setText("");
  };
  return (
    <div className="flex gap-2">
      <input
        value={text}
        onChange={(e) => setText(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter" && !e.nativeEvent.isComposing) {
            e.preventDefault();
            add();
          }
        }}
        placeholder="체크리스트 항목 추가"
        className="field py-2"
      />
      <button type="button" onClick={add} className="pill px-3.5">
        추가
      </button>
    </div>
  );
}

function DraftSubtasks({ drafts, setDrafts }: { drafts: string[]; setDrafts: (d: string[]) => void }) {
  return (
    <div className="flex min-w-0 flex-col gap-1.5 text-xs text-muted">
      체크리스트
      {drafts.map((d, i) => (
        <div key={i} className="flex items-center gap-2.5 border-b border-line py-1.5 text-[13px] text-fg">
          <span className="size-4 flex-none rounded border-[1.5px] border-white/35" />
          <span className="min-w-0 flex-1 truncate">{d}</span>
          <button type="button" aria-label={`${d} 빼기`} onClick={() => setDrafts(drafts.filter((_, j) => j !== i))} className="text-subtle hover:text-fg">
            ✕
          </button>
        </div>
      ))}
      <SubtaskInput onAdd={(t) => setDrafts([...drafts, t])} />
    </div>
  );
}

function SubtaskList({ parent }: { parent: Todo }) {
  const toast = useToast();
  const { data: subs = [], isPending } = useTodos({ parentId: parent.id });
  const toggle = useToggleTodo();
  const remove = useDeleteTodo();
  const rename = useRenameTodo();
  const add = useAddSubtask();
  const done = subs.filter((s) => s.done).length;
  const ordered = [...subs].sort((a, b) => (a.createdAt ?? "").localeCompare(b.createdAt ?? ""));

  return (
    <div className="flex min-w-0 flex-col gap-1.5 text-xs text-muted">
      <div className="flex">
        체크리스트
        {subs.length > 0 && (
          <span className="ml-auto">
            {done}/{subs.length}
          </span>
        )}
      </div>
      {isPending && <span className="py-1.5 text-subtle">불러오는 중…</span>}
      {ordered.map((s) => (
        <div key={s.id} className="flex items-center gap-2.5 border-b border-line py-1 text-[13px]">
          <button
            type="button"
            role="checkbox"
            aria-checked={s.done}
            aria-label={`${s.title} 완료`}
            onClick={() =>
              toggle.mutateAsync({ id: s.id, done: !s.done }).catch(() => toast.error("완료 상태를 바꾸지 못했어요."))
            }
            className="flex size-4 flex-none items-center justify-center rounded border-[1.5px] text-[10px] text-ink"
            style={{
              borderColor: s.done ? "var(--color-accent)" : "rgb(255 255 255 / .35)",
              background: s.done ? "var(--color-accent)" : "transparent",
            }}
          >
            {s.done ? "✓" : ""}
          </button>
          <input
            defaultValue={s.title}
            aria-label="체크리스트 항목"
            onBlur={(e) => {
              const title = e.target.value.trim();
              if (title && title !== s.title) rename.mutateAsync({ id: s.id, title }).catch(() => toast.error("이름을 바꾸지 못했어요."));
              else e.target.value = s.title;
            }}
            onKeyDown={(e) => e.key === "Enter" && e.currentTarget.blur()}
            className={`min-w-0 flex-1 bg-transparent py-1 outline-none ${s.done ? "text-subtle line-through" : "text-fg"}`}
          />
          <button
            type="button"
            aria-label={`${s.title} 삭제`}
            onClick={() => remove.mutateAsync(s.id).catch(() => toast.error("항목을 삭제하지 못했어요."))}
            className="text-subtle hover:text-fg"
          >
            ✕
          </button>
        </div>
      ))}
      <SubtaskInput
        onAdd={(title) => add.mutateAsync({ parent, title }).catch(() => toast.error("항목을 추가하지 못했어요."))}
      />
    </div>
  );
}

// ── 연결 일정 (TODO-08) ──────────────────────────────────

function EventPicker({ base, value, onChange }: { base: ISODate; value: string | null; onChange: (v: string | null) => void }) {
  const { data: events = [], isPending } = useEvents({ from: addDays(base, -7), to: addDays(base, 7) });
  const known = !value || events.some((e) => e.id === value);
  return (
    <label className="flex min-w-0 flex-col gap-1.5 text-xs text-muted">
      연결 일정
      <select value={value ?? ""} onChange={(e) => onChange(e.target.value || null)} className="field">
        <option value="">{isPending ? "일정 불러오는 중…" : "연결 안 함"}</option>
        {!known && <option value={value!}>연결된 일정(마감일 ±7일 밖)</option>}
        {events.map((e) => (
          <option key={e.id} value={e.id}>
            {shortLabel(e.date)} {e.allDay ? "종일" : e.start} · {e.title}
          </option>
        ))}
      </select>
    </label>
  );
}
