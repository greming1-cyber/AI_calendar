"use client";

import { Modal } from "@/components/ui";
import type { RecurrenceScope } from "@/lib/types";

const SCOPES: { value: RecurrenceScope; label: string }[] = [
  { value: "this", label: "이 일정만" },
  { value: "following", label: "이후 모두" },
  { value: "all", label: "전체" },
];

/** 반복 일정 수정·삭제 범위 선택(EVT-03). 모달 안에 끼워 넣는 형태 */
export function ScopeChooser({
  action,
  onPick,
  onCancel,
  disabled = [],
}: {
  action: "save" | "delete";
  onPick: (scope: RecurrenceScope) => void;
  onCancel: () => void;
  disabled?: RecurrenceScope[];
}) {
  return (
    <div role="group" aria-label="반복 일정 범위" className="flex flex-col gap-2.5 rounded-2xl border border-white/10 bg-white/[.04] p-4">
      <span className="text-[13px] font-semibold">반복 일정이에요. 어디까지 {action === "save" ? "바꿀까요" : "삭제할까요"}?</span>
      <div className="flex flex-wrap gap-2">
        {SCOPES.map((s) => (
          <button
            key={s.value}
            type="button"
            disabled={disabled.includes(s.value)}
            onClick={() => onPick(s.value)}
            className={`pill px-4 py-2 text-[13px] disabled:cursor-not-allowed disabled:opacity-40 ${action === "delete" ? "pill-danger" : ""}`}
          >
            {s.label}
          </button>
        ))}
        <button type="button" onClick={onCancel} className="pill ml-auto border-transparent px-3 py-2 text-[13px] text-muted">
          취소
        </button>
      </div>
      {disabled.includes("this") && <span className="text-[11px] text-subtle">반복 규칙을 바꾸면 &quot;이 일정만&quot;은 고를 수 없어요.</span>}
    </div>
  );
}

/** 드래그로 반복 회차를 옮길 때 띄우는 범위 선택 창 */
export function ScopeDialog({ onPick, onClose }: { onPick: (scope: RecurrenceScope) => void; onClose: () => void }) {
  return (
    <Modal open onClose={onClose} title="반복 일정 이동" width={440}>
      <ScopeChooser action="save" onPick={onPick} onCancel={onClose} />
    </Modal>
  );
}
