import type { ReactNode } from "react";

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
