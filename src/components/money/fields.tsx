"use client";

import type { ReactNode } from "react";

/** 숫자만 남긴 금액(원). 비어 있으면 0 */
export const parseAmount = (s: string) => Number(s.replace(/[^\d]/g, "").slice(0, 15)) || 0;

const groupDigits = (n: number) => (n ? n.toLocaleString("ko-KR") : "");

/** 금액 입력: 숫자 키패드, 입력하는 동안 쉼표 자동 포맷 */
export function AmountInput({
  value,
  onChange,
  label = "금액",
  autoFocus,
  onEnter,
  className = "",
}: {
  value: number;
  onChange: (n: number) => void;
  label?: string;
  autoFocus?: boolean;
  onEnter?: () => void;
  className?: string;
}) {
  return (
    <div className={`relative ${className}`}>
      <input
        autoFocus={autoFocus}
        inputMode="numeric"
        aria-label={label}
        value={groupDigits(value)}
        onChange={(e) => onChange(parseAmount(e.target.value))}
        onKeyDown={(e) => e.key === "Enter" && !e.nativeEvent.isComposing && onEnter?.()}
        placeholder="0"
        className="field pr-9 text-right tabular-nums"
      />
      <span className="pointer-events-none absolute top-1/2 right-3.5 -translate-y-1/2 text-[13px] text-subtle">원</span>
    </div>
  );
}

/** 라벨이 위에 붙은 입력 묶음 */
export function Field({ label, children, className = "" }: { label: ReactNode; children: ReactNode; className?: string }) {
  return <div className={`flex min-w-0 flex-col gap-1.5 text-xs text-muted ${className}`}>{label}{children}</div>;
}

/** 고를 수 있는 알약 칩(분류·결제수단) */
export function Chip({
  selected,
  onClick,
  color,
  children,
}: {
  selected: boolean;
  onClick: () => void;
  color?: string | null;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      aria-pressed={selected}
      onClick={onClick}
      className={`pill gap-1.5 px-3 py-1.5 text-[13px] ${selected ? "bg-fg text-ink" : ""}`}
    >
      {color && <span className="size-2 flex-none rounded-full" style={{ background: color }} />}
      {children}
    </button>
  );
}
