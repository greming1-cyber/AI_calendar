"use client";

import { useState } from "react";
import { Switch } from "@/components/ui";

export type ToggleRow = { key: string; label: string; desc: string; initial: boolean };

/** 설정 탭 공용: 켜기/끄기 목록. 저장 연결은 각 탭 담당 세션이 onChange로 붙인다. */
export function ToggleList({ rows, onChange }: { rows: ToggleRow[]; onChange?: (key: string, value: boolean) => void }) {
  const [values, setValues] = useState(() => Object.fromEntries(rows.map((r) => [r.key, r.initial])));

  return (
    <section className="card card-flat py-1.5">
      {rows.map((r) => (
        <div key={r.key} className="flex items-center gap-4 border-b border-line py-3.5 last:border-b-0">
          <div className="flex flex-1 flex-col gap-[3px]">
            <span className="text-sm">{r.label}</span>
            <span className="text-xs text-subtle">{r.desc}</span>
          </div>
          <Switch
            label={r.label}
            checked={values[r.key]}
            onChange={() => {
              const next = !values[r.key];
              setValues((v) => ({ ...v, [r.key]: next }));
              onChange?.(r.key, next);
            }}
          />
        </div>
      ))}
    </section>
  );
}
