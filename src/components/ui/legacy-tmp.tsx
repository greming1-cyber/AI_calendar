import type { ReactNode } from "react";

export function CardHead({ title, meta, size = "md" }: { title: ReactNode; meta?: ReactNode; size?: "md" | "lg" }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <span className={size === "lg" ? "text-xl font-bold" : "text-[15px] font-semibold"}>{title}</span>
      {meta != null && <span className="text-[11px] whitespace-nowrap text-subtle">{meta}</span>}
    </div>
  );
}

export function ProgressBar({ percent, color }: { percent: number; color?: string }) {
  return (
    <div className="bar-track">
      <div className="bar-fill" style={{ width: `${Math.min(percent, 100)}%`, background: color }} />
    </div>
  );
}

export function Switch({ checked, onChange, label }: { checked: boolean; onChange: () => void; label: string }) {
  return <button type="button" role="switch" aria-checked={checked} aria-label={label} onClick={onChange} className="switch" />;
}

export function Segmented<T extends string>({
  options,
  value,
  onChange,
  disabled = [],
}: {
  options: readonly { value: T; label: ReactNode }[];
  value: T;
  onChange?: (v: T) => void;
  disabled?: readonly T[];
}) {
  return (
    <div className="seg">
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          aria-pressed={o.value === value}
          disabled={disabled.includes(o.value)}
          title={disabled.includes(o.value) ? "준비 중" : undefined}
          onClick={() => onChange?.(o.value)}
          className="seg-item"
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}
