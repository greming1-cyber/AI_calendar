import type { ReactNode } from "react";

export function CardHead({ title, meta, size = "md" }: { title: ReactNode; meta?: ReactNode; size?: "md" | "lg" }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <span className={size === "lg" ? "text-xl font-bold" : "text-[15px] font-semibold"}>{title}</span>
      {meta != null && <span className="text-[11px] whitespace-nowrap text-subtle">{meta}</span>}
    </div>
  );
}
