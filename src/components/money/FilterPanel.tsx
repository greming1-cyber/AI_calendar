"use client";

import { useState } from "react";
import { Segmented } from "@/components/ui";
import { shortLabel } from "@/lib/date";
import type { DateRange, PaymentMethod, TxCategory, TxFilter, TxType } from "@/lib/types";
import { Chip, Field } from "./fields";

/** 화면의 필터 상태. period가 null이면 보고 있는 달 */
export interface MoneyFilter extends TxFilter {
  period: DateRange | null;
}

export const EMPTY_FILTER: MoneyFilter = { period: null, type: null, categoryIds: [], paymentMethodIds: [], keyword: "" };

export const isFiltered = (f: MoneyFilter) =>
  Boolean(f.period || f.type || f.categoryIds?.length || f.paymentMethodIds?.length || f.keyword?.trim());

/** 적용 중인 필터를 알약으로. onRemove로 하나씩 뺀다. */
export function ActiveFilterPills({
  filter,
  categories,
  methods,
  onChange,
}: {
  filter: MoneyFilter;
  categories: TxCategory[];
  methods: PaymentMethod[];
  onChange: (f: MoneyFilter) => void;
}) {
  const pills: { key: string; label: string; remove: () => void }[] = [];
  if (filter.period)
    pills.push({
      key: "period",
      label: `${shortLabel(filter.period.from)}~${shortLabel(filter.period.to)}`,
      remove: () => onChange({ ...filter, period: null }),
    });
  if (filter.type)
    pills.push({ key: "type", label: filter.type === "income" ? "수입" : "지출", remove: () => onChange({ ...filter, type: null }) });
  for (const id of filter.categoryIds ?? [])
    pills.push({
      key: `c${id}`,
      label: categories.find((c) => c.id === id)?.name ?? "분류",
      remove: () => onChange({ ...filter, categoryIds: filter.categoryIds?.filter((x) => x !== id) }),
    });
  for (const id of filter.paymentMethodIds ?? [])
    pills.push({
      key: `m${id}`,
      label: methods.find((m) => m.id === id)?.name ?? "결제수단",
      remove: () => onChange({ ...filter, paymentMethodIds: filter.paymentMethodIds?.filter((x) => x !== id) }),
    });
  if (filter.keyword?.trim())
    pills.push({ key: "kw", label: `“${filter.keyword.trim()}”`, remove: () => onChange({ ...filter, keyword: "" }) });
  if (!pills.length) return null;
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      {pills.map((p) => (
        <button key={p.key} type="button" onClick={p.remove} aria-label={`${p.label} 필터 빼기`} className="pill gap-1.5 bg-fg px-3 py-1 text-xs text-ink">
          {p.label} <span aria-hidden>✕</span>
        </button>
      ))}
      <button type="button" onClick={() => onChange(EMPTY_FILTER)} className="px-1 text-xs text-subtle hover:text-fg">
        모두 지우기
      </button>
    </div>
  );
}

/** TX-03: 기간·구분·분류(복수)·결제수단(복수)·키워드. 적용을 눌러야 바뀐다. */
export function FilterPanel({
  value,
  monthRange,
  categories,
  methods,
  onApply,
  onClose,
}: {
  value: MoneyFilter;
  monthRange: DateRange;
  categories: TxCategory[];
  methods: PaymentMethod[];
  onApply: (f: MoneyFilter) => void;
  onClose: () => void;
}) {
  const [f, setF] = useState<MoneyFilter>(value);
  const toggle = (list: string[] = [], id: string) => (list.includes(id) ? list.filter((x) => x !== id) : [...list, id]);
  const period = f.period ?? monthRange;
  const setPeriod = (k: "from" | "to", v: string) => {
    if (!v) return;
    const next = { ...period, [k]: v };
    if (next.from > next.to) next[k === "from" ? "to" : "from"] = v;
    setF({ ...f, period: next.from === monthRange.from && next.to === monthRange.to ? null : next });
  };
  const visibleCategories = categories.filter((c) => !f.type || c.type === f.type);

  return (
    <section className="card card-flat gap-3.5" aria-label="내역 필터">
      <div className="grid grid-cols-[repeat(auto-fit,minmax(220px,1fr))] gap-3">
        <Field label={f.period ? "기간" : "기간 · 보고 있는 달"}>
          <div className="flex items-center gap-2">
            <input type="date" aria-label="시작일" value={period.from} onChange={(e) => setPeriod("from", e.target.value)} className="field" />
            <span className="text-subtle">~</span>
            <input type="date" aria-label="종료일" value={period.to} onChange={(e) => setPeriod("to", e.target.value)} className="field" />
          </div>
        </Field>
        <Field label="키워드">
          <input
            value={f.keyword ?? ""}
            onChange={(e) => setF({ ...f, keyword: e.target.value })}
            onKeyDown={(e) => e.key === "Enter" && !e.nativeEvent.isComposing && onApply(f)}
            placeholder="메모에서 찾기"
            className="field"
          />
        </Field>
      </div>
      <Field label="구분">
        <Segmented
          options={[
            { value: "", label: "전체" },
            { value: "expense", label: "지출" },
            { value: "income", label: "수입" },
          ]}
          value={f.type ?? ""}
          onChange={(v) => {
            const type = (v || null) as TxType | null;
            // 다른 구분의 분류는 빼 둔다.
            setF({ ...f, type, categoryIds: f.categoryIds?.filter((id) => !type || categories.find((c) => c.id === id)?.type === type) });
          }}
        />
      </Field>
      <Field label="분류">
        <div className="flex flex-wrap gap-1.5">
          {visibleCategories.map((c) => (
            <Chip key={c.id} selected={Boolean(f.categoryIds?.includes(c.id))} color={c.color} onClick={() => setF({ ...f, categoryIds: toggle(f.categoryIds, c.id) })}>
              {c.name}
              {!f.type && <span className="text-[10px] opacity-60">{c.type === "income" ? "수입" : "지출"}</span>}
            </Chip>
          ))}
        </div>
      </Field>
      <Field label="결제수단">
        <div className="flex flex-wrap gap-1.5">
          {methods.map((m) => (
            <Chip key={m.id} selected={Boolean(f.paymentMethodIds?.includes(m.id))} onClick={() => setF({ ...f, paymentMethodIds: toggle(f.paymentMethodIds, m.id) })}>
              {m.name}
            </Chip>
          ))}
        </div>
      </Field>
      <div className="flex gap-2">
        <button type="button" onClick={() => setF(EMPTY_FILTER)} className="pill px-4 py-2 text-[13px]">
          초기화
        </button>
        <button type="button" onClick={onClose} className="pill ml-auto px-4 py-2 text-[13px]">
          닫기
        </button>
        <button type="button" onClick={() => onApply(f)} className="pill pill-accent px-5 py-2 text-[13px]">
          적용
        </button>
      </div>
    </section>
  );
}
