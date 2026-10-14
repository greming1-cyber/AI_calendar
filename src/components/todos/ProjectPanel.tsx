"use client";

import { useState } from "react";
import { CardHead, ProgressBar, useToast } from "@/components/ui";
import { isDuplicateName } from "@/lib/data/todos";
import { useDeleteProject, useSaveProject } from "@/lib/hooks/use-todos";
import { projectProgress } from "@/lib/todo";
import type { Project, Todo } from "@/lib/types";

interface Props {
  todos: Todo[];
  projects: Project[];
  selected: string | null;
  onSelect: (id: string | null) => void;
}

/** TODO-05: 프로젝트 생성·수정·삭제와 진행률. 항목을 누르면 목록이 그 프로젝트로 필터된다. */
export function ProjectPanel({ todos, projects, selected, onSelect }: Props) {
  const toast = useToast();
  const save = useSaveProject();
  const del = useDeleteProject();
  const [adding, setAdding] = useState(false);
  const [editing, setEditing] = useState<string | null>(null);
  const progress = projectProgress(todos, projects.map((p) => p.name));

  const create = (name: string) =>
    save.mutate(
      { id: null, name },
      {
        onSuccess: () => {
          toast.success("프로젝트를 만들었어요.");
          setAdding(false);
        },
        onError: (e) => toast.error(isDuplicateName(e) ? "같은 이름의 프로젝트가 있어요." : "프로젝트를 만들지 못했어요."),
      },
    );

  return (
    <section className="card card-warm gap-3.5 p-5">
      <CardHead
        title="프로젝트"
        meta={
          <button type="button" onClick={() => setAdding((v) => !v)} className="text-xs hover:text-fg">
            {adding ? "닫기" : "+ 추가"}
          </button>
        }
      />
      {adding && <NameInput placeholder="새 프로젝트 이름" busy={save.isPending} onSubmit={create} onCancel={() => setAdding(false)} />}
      {!projects.length && !adding && <span className="text-[13px] text-subtle">프로젝트가 없어요.</span>}
      {projects.map((p, i) =>
        editing === p.id ? (
          <ProjectEditor
            key={p.id}
            project={p}
            total={progress[i].total}
            others={projects.filter((o) => o.id !== p.id)}
            onDelete={(moveTo) =>
              // 목록에서 바로 빠지고(낙관적), 실패하면 다시 나타난다.
              del.mutate(
                { id: p.id, moveTo },
                {
                  onSuccess: () => toast.success("프로젝트를 삭제했어요."),
                  onError: () => toast.error("프로젝트를 삭제하지 못했어요."),
                },
              )
            }
            onDone={(deleted) => {
              setEditing(null);
              if (deleted && selected === p.id) onSelect(null);
            }}
          />
        ) : (
          <div key={p.id} className="group flex items-start gap-2">
            <button
              type="button"
              aria-pressed={selected === p.id}
              onClick={() => onSelect(selected === p.id ? null : p.id)}
              className={`-mx-2 flex min-w-0 flex-1 flex-col gap-1.5 rounded-xl px-2 py-1.5 text-left hover:bg-white/[.04] ${
                selected === p.id ? "bg-white/[.08]" : ""
              }`}
            >
              <span className="flex justify-between gap-2 text-[13px]">
                <span className="truncate">{p.name}</span>
                <span className="text-muted">
                  {progress[i].done}/{progress[i].total}
                </span>
              </span>
              <ProgressBar percent={progress[i].percent} />
            </button>
            <button
              type="button"
              aria-label={`${p.name} 수정`}
              onClick={() => setEditing(p.id)}
              className="mt-1 px-1 text-xs text-subtle hover:text-fg"
            >
              ✎
            </button>
          </div>
        ),
      )}
    </section>
  );
}

function NameInput({
  initial = "",
  placeholder,
  busy,
  onSubmit,
  onCancel,
}: {
  initial?: string;
  placeholder: string;
  busy: boolean;
  onSubmit: (name: string) => void;
  onCancel: () => void;
}) {
  const [name, setName] = useState(initial);
  const submit = () => name.trim() && !busy && onSubmit(name.trim());
  return (
    <div className="flex gap-2">
      <input
        autoFocus
        value={name}
        onChange={(e) => setName(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter" && !e.nativeEvent.isComposing) submit();
          if (e.key === "Escape") {
            e.stopPropagation();
            onCancel();
          }
        }}
        placeholder={placeholder}
        className="field py-2"
      />
      <button type="button" onClick={submit} disabled={!name.trim() || busy} className="pill pill-accent px-3.5 disabled:opacity-45">
        저장
      </button>
    </div>
  );
}

function ProjectEditor({
  project,
  total,
  others,
  onDelete,
  onDone,
}: {
  project: Project;
  total: number;
  others: Project[];
  onDelete: (moveTo: string | null) => void;
  onDone: (deleted: boolean) => void;
}) {
  const toast = useToast();
  const save = useSaveProject();
  const [deleting, setDeleting] = useState(false);
  const [moveTo, setMoveTo] = useState("");

  const rename = (name: string) =>
    name === project.name
      ? onDone(false)
      : save.mutate(
          { id: project.id, name },
          {
            onSuccess: () => onDone(false),
            onError: (e) => toast.error(isDuplicateName(e) ? "같은 이름의 프로젝트가 있어요." : "이름을 바꾸지 못했어요."),
          },
        );

  const remove = () => {
    onDelete(moveTo || null);
    onDone(true);
  };

  return (
    <div className="flex flex-col gap-2 rounded-xl bg-white/[.04] p-2.5">
      <NameInput initial={project.name} placeholder="프로젝트 이름" busy={save.isPending} onSubmit={rename} onCancel={() => onDone(false)} />
      {deleting ? (
        <div className="flex flex-col gap-2 text-xs text-muted">
          {total > 0 && (
            <label className="flex flex-col gap-1.5">
              할일 {total}개를 옮길 곳
              <select value={moveTo} onChange={(e) => setMoveTo(e.target.value)} className="field py-2">
                <option value="">프로젝트 없음</option>
                {others.map((o) => (
                  <option key={o.id} value={o.id}>
                    {o.name}
                  </option>
                ))}
              </select>
            </label>
          )}
          <div className="flex gap-2">
            <button type="button" onClick={() => setDeleting(false)} className="pill ml-auto px-3.5">
              취소
            </button>
            <button type="button" onClick={remove} className="pill pill-danger px-3.5">
              삭제
            </button>
          </div>
        </div>
      ) : (
        <div className="flex gap-2">
          <button type="button" onClick={() => setDeleting(true)} className="pill pill-danger px-3.5">
            삭제
          </button>
          <button type="button" onClick={() => onDone(false)} className="pill ml-auto px-3.5">
            닫기
          </button>
        </div>
      )}
    </div>
  );
}
