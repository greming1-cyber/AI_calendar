"use client";

import { useState } from "react";
import { Modal, useToast } from "@/components/ui";
import { useCategoryEventCount, useCreateCategory, useDeleteCategory, useUpdateCategory } from "@/lib/hooks/use-events";
import type { EventCategory } from "@/lib/types";

/** 카테고리 색 팔레트. 데모 카테고리(seed_demo)와 같은 명도·채도 계열 */
export const CATEGORY_PALETTE = [
  "oklch(0.72 0.17 50)",
  "oklch(0.62 0.1 240)",
  "oklch(0.65 0.12 330)",
  "oklch(0.7 0.1 150)",
  "oklch(0.75 0.14 90)",
  "oklch(0.66 0.13 20)",
  "oklch(0.68 0.11 200)",
  "oklch(0.64 0.12 290)",
];

const DEFAULT_NAME = "개인";

const errorMessage = (e: unknown) =>
  (e as { code?: string })?.code === "23505" ? "같은 이름의 카테고리가 이미 있어요." : "카테고리를 저장하지 못했어요.";

function Palette({ value, onChange, label }: { value: string; onChange: (c: string) => void; label: string }) {
  return (
    <div role="radiogroup" aria-label={label} className="flex flex-wrap gap-1.5">
      {CATEGORY_PALETTE.map((c) => (
        <button
          key={c}
          type="button"
          role="radio"
          aria-checked={value === c}
          aria-label={c}
          onClick={() => onChange(c)}
          className="size-6 rounded-full border-2"
          style={{ background: c, borderColor: value === c ? "var(--color-fg)" : "transparent" }}
        />
      ))}
    </div>
  );
}

/** EVT-06: 카테고리 추가·이름·색 수정·삭제 */
export function CategoryPanel({ open, onClose, categories }: { open: boolean; onClose: () => void; categories: EventCategory[] }) {
  const toast = useToast();
  const create = useCreateCategory();
  const [name, setName] = useState("");
  const [color, setColor] = useState(CATEGORY_PALETTE[4]);

  const add = () => {
    const n = name.trim();
    if (!n || create.isPending) return;
    create.mutate(
      { name: n, color },
      {
        onSuccess: () => {
          setName("");
          toast.success("카테고리를 추가했어요.");
        },
        onError: (e) => toast.error(errorMessage(e)),
      },
    );
  };

  return (
    <Modal open={open} onClose={onClose} title="카테고리 관리" subtitle="이름과 색은 캘린더 칩에 바로 반영돼요." width={480}>
      <div className="flex flex-col">
        {categories.map((c) => (
          <CategoryRow key={c.id} category={c} fallback={categories.find((x) => x.name === DEFAULT_NAME && x.id !== c.id) ?? null} />
        ))}
        {!categories.length && <span className="py-3 text-[13px] text-subtle">카테고리가 없어요. 아래에서 추가하세요.</span>}
      </div>

      <div className="flex flex-col gap-2.5 rounded-2xl bg-white/[.04] p-4">
        <span className="text-xs text-muted">새 카테고리</span>
        <div className="flex gap-2">
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && !e.nativeEvent.isComposing && add()}
            placeholder="이름"
            maxLength={20}
            aria-label="새 카테고리 이름"
            className="field min-w-0 flex-1"
          />
          <button type="button" onClick={add} disabled={!name.trim() || create.isPending} className="pill pill-accent px-4 disabled:opacity-45">
            추가
          </button>
        </div>
        <Palette value={color} onChange={setColor} label="새 카테고리 색" />
      </div>
    </Modal>
  );
}

function CategoryRow({ category, fallback }: { category: EventCategory; fallback: EventCategory | null }) {
  const toast = useToast();
  const update = useUpdateCategory();
  const remove = useDeleteCategory();
  const [name, setName] = useState(category.name);
  const [editingColor, setEditingColor] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const count = useCategoryEventCount(confirming ? category.id : null);

  const rename = () => {
    const n = name.trim();
    if (!n || n === category.name) return setName(category.name);
    update.mutate({ id: category.id, name: n }, { onError: (e) => (toast.error(errorMessage(e)), setName(category.name)) });
  };

  const del = (moveTo?: string) =>
    remove.mutate(
      { id: category.id, moveTo },
      {
        onSuccess: () => toast.success(moveTo ? `일정을 ${fallback?.name}(으)로 옮기고 삭제했어요.` : "카테고리를 삭제했어요."),
        onError: () => toast.error("카테고리를 삭제하지 못했어요."),
      },
    );

  return (
    <div className="flex flex-col gap-2 border-b border-line py-2.5">
      <div className="flex items-center gap-2.5">
        <button
          type="button"
          aria-label={`${category.name} 색 바꾸기`}
          aria-expanded={editingColor}
          onClick={() => setEditingColor((v) => !v)}
          className="size-5 flex-none rounded-md"
          style={{ background: category.color }}
        />
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          onBlur={rename}
          onKeyDown={(e) => e.key === "Enter" && !e.nativeEvent.isComposing && e.currentTarget.blur()}
          maxLength={20}
          aria-label="카테고리 이름"
          className="min-w-0 flex-1 rounded-lg border border-transparent bg-transparent px-2 py-1.5 text-[14px] text-fg outline-none focus:border-white/15 focus:bg-white/5"
        />
        <button type="button" onClick={() => setConfirming(true)} className="pill pill-danger px-3 py-1.5" disabled={remove.isPending}>
          삭제
        </button>
      </div>
      {editingColor && (
        <Palette
          value={category.color}
          label={`${category.name} 색`}
          onChange={(c) => {
            setEditingColor(false);
            update.mutate({ id: category.id, color: c }, { onError: () => toast.error("색을 바꾸지 못했어요.") });
          }}
        />
      )}
      {confirming && (
        <div className="flex flex-col gap-2 rounded-xl bg-white/[.04] p-3 text-[13px]">
          {count.isPending ? (
            <span className="text-subtle">사용 중인 일정을 확인하는 중…</span>
          ) : count.data ? (
            <span>
              이 카테고리를 쓰는 일정이 {count.data}건 있어요.
              {fallback ? ` ${fallback.name}(으)로 옮길까요?` : " 삭제하면 분류 없음이 돼요."}
            </span>
          ) : (
            <span>&apos;{category.name}&apos; 카테고리를 삭제할까요?</span>
          )}
          <div className="flex flex-wrap gap-2">
            {!!count.data && fallback && (
              <button type="button" onClick={() => del(fallback.id)} className="pill pill-accent px-3 py-1.5">
                {fallback.name}(으)로 옮기고 삭제
              </button>
            )}
            <button type="button" onClick={() => del()} disabled={count.isPending} className="pill pill-danger px-3 py-1.5">
              {count.data ? "분류 없이 삭제" : "삭제"}
            </button>
            <button type="button" onClick={() => setConfirming(false)} className="pill ml-auto border-transparent px-3 py-1.5 text-muted">
              취소
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
