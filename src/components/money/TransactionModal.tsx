"use client";

import { useState } from "react";
import { Modal, Segmented, useToast } from "@/components/ui";
import { parseEventId } from "@/lib/data/events";
import { isValidAmount } from "@/lib/data/transactions";
import { longLabel, parts } from "@/lib/date";
import { useEvents } from "@/lib/hooks/use-events";
import { useToday } from "@/lib/hooks/use-today";
import {
  useDeleteTransaction,
  usePaymentMethods,
  useSaveTransaction,
  useTxCategories,
} from "@/lib/hooks/use-transactions";
import type { CalendarEvent, ISODate, Transaction, TransactionInput, TxType } from "@/lib/types";
import { AmountInput, Chip, Field } from "./fields";

interface Props {
  open: boolean;
  onClose: () => void;
  /** 등록 기본값(06 빠른 등록·홈 "+ 지출", 01 일정 상세 "지출 추가"는 { date, eventId, memo }) */
  initial?: Partial<TransactionInput>;
  /** 수정할 내역. 없으면 등록 */
  transaction?: Transaction;
}

/** TX-01/09: 내역 등록·수정. 공유 계약 { open, onClose, initial? } */
export function TransactionModal({ open, onClose, initial, transaction }: Props) {
  if (!open) return null;
  return <TransactionForm key={transaction?.id ?? "new"} onClose={onClose} initial={initial} transaction={transaction} />;
}

const TYPES: { value: TxType; label: string }[] = [
  { value: "expense", label: "지출" },
  { value: "income", label: "수입" },
];

function TransactionForm({ onClose, initial, transaction }: Omit<Props, "open">) {
  const today = useToday();
  const toast = useToast();
  const { data: categories = [] } = useTxCategories();
  const { data: methods = [] } = usePaymentMethods();
  const save = useSaveTransaction();
  const remove = useDeleteTransaction();

  const [f, setF] = useState<TransactionInput>(() =>
    transaction
      ? {
          type: transaction.type,
          amount: transaction.amount,
          date: transaction.date,
          categoryId: transaction.categoryId,
          paymentMethodId: transaction.paymentMethodId,
          memo: transaction.memo,
          eventId: transaction.eventId ?? null,
        }
      : { type: "expense", amount: 0, date: today, categoryId: null, paymentMethodId: null, memo: "", eventId: null, ...initial },
  );
  const set = <K extends keyof TransactionInput>(k: K, v: TransactionInput[K]) => setF((s) => ({ ...s, [k]: v }));
  const [repeat, setRepeat] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);

  const busy = save.isPending || remove.isPending;
  const valid = isValidAmount(f.amount) && Boolean(f.date);
  const typeCategories = categories.filter((c) => c.type === f.type);

  const changeType = (type: TxType) =>
    // 다른 구분의 분류는 고를 수 없으므로 비운다.
    setF((s) => ({ ...s, type, categoryId: categories.find((c) => c.id === s.categoryId)?.type === type ? s.categoryId : null }));

  const submit = () => {
    if (!valid || busy) return;
    save.mutate(
      { id: transaction?.id ?? null, input: f, repeat: !transaction && repeat },
      {
        onSuccess: () => {
          toast.success(transaction ? "내역을 수정했어요." : repeat ? "내역과 고정지출을 등록했어요." : "내역을 등록했어요.");
          onClose();
        },
        onError: () => toast.error("내역을 저장하지 못했어요."),
      },
    );
  };

  const del = () => {
    if (!transaction || busy) return;
    if (!confirmDelete) return setConfirmDelete(true);
    remove.mutate(transaction.id, {
      onSuccess: () => toast.success("내역을 삭제했어요."),
      onError: () => toast.error("내역을 삭제하지 못했어요."),
    });
    onClose();
  };

  return (
    <Modal
      open
      onClose={onClose}
      title={transaction ? "내역 수정" : "내역 등록"}
      subtitle={
        transaction?.viaClaude ? "Claude로 등록한 내역" : transaction?.recurringId ? "고정지출로 자동 등록된 내역" : undefined
      }
      width={520}
      footer={
        <>
          {transaction && (
            <button type="button" onClick={del} disabled={busy} className="pill pill-danger px-4 py-2.5 text-[13px]">
              {confirmDelete ? "정말 삭제" : "삭제"}
            </button>
          )}
          <button type="button" onClick={onClose} className="pill ml-auto px-4 py-2.5 text-[13px]">
            취소
          </button>
          <button
            type="button"
            onClick={submit}
            disabled={!valid || busy}
            className="pill pill-accent px-5 py-2.5 text-[13px] disabled:cursor-not-allowed disabled:opacity-45"
          >
            {save.isPending ? "저장 중…" : transaction ? "수정 저장" : "등록"}
          </button>
        </>
      }
    >
      <div className="flex flex-wrap items-center gap-3">
        <Segmented options={TYPES} value={f.type} onChange={changeType} />
        <AmountInput autoFocus value={f.amount} onChange={(n) => set("amount", n)} onEnter={submit} className="min-w-[180px] flex-1" />
      </div>

      <div className="grid grid-cols-[repeat(auto-fit,minmax(200px,1fr))] gap-3">
        <Field label="날짜">
          <input type="date" aria-label="날짜" value={f.date} onChange={(e) => e.target.value && set("date", e.target.value)} className="field" />
        </Field>
        <Field label="메모">
          <input
            value={f.memo}
            onChange={(e) => set("memo", e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && !e.nativeEvent.isComposing && submit()}
            placeholder={f.type === "expense" ? "예: 점심 김밥" : "예: 10월 급여"}
            className="field"
          />
        </Field>
      </div>

      <Field label="분류">
        <div className="flex flex-wrap gap-1.5">
          <Chip selected={!f.categoryId} onClick={() => set("categoryId", null)}>
            분류 없음
          </Chip>
          {typeCategories.map((c) => (
            <Chip key={c.id} selected={f.categoryId === c.id} color={c.color} onClick={() => set("categoryId", c.id)}>
              {c.name}
            </Chip>
          ))}
        </div>
      </Field>

      <Field label="결제수단">
        <div className="flex flex-wrap gap-1.5">
          <Chip selected={!f.paymentMethodId} onClick={() => set("paymentMethodId", null)}>
            선택 안 함
          </Chip>
          {methods.map((m) => (
            <Chip key={m.id} selected={f.paymentMethodId === m.id} onClick={() => set("paymentMethodId", m.id)}>
              {m.name}
            </Chip>
          ))}
        </div>
      </Field>

      <EventPicker date={f.date} value={f.eventId} onChange={(v) => set("eventId", v)} />

      {!transaction && (
        <div className="flex items-center gap-2.5 text-[13px]">
          <button
            type="button"
            role="switch"
            aria-checked={repeat}
            aria-label="매월 반복"
            onClick={() => setRepeat((v) => !v)}
            className="switch"
          />
          매월 {parts(f.date).d}일 반복({f.type === "expense" ? "고정지출" : "고정수입"})
          {repeat && <span className="ml-auto text-xs text-subtle">다음 달부터 그날 자동 등록</span>}
        </div>
      )}
    </Modal>
  );
}

// ── 연결 일정 (TX-09) ────────────────────────────────────

/** transactions.event_id에는 일정 행 id(parseEventId(id).rowId)를 저장한다. 그날의 일정에서 고른다. */
function EventPicker({ date, value, onChange }: { date: ISODate; value: string | null; onChange: (v: string | null) => void }) {
  const { data: events = [], isPending } = useEvents({ from: date, to: date });
  const byRow = new Map<string, CalendarEvent>();
  for (const e of events) if (e.date === date) byRow.set(parseEventId(e.id).rowId, e);
  const options = [...byRow].sort(([, a], [, b]) => Number(b.allDay) - Number(a.allDay) || a.start.localeCompare(b.start));
  const known = !value || byRow.has(value);
  return (
    <Field label={`연결 일정 · ${longLabel(date)}`}>
      <select value={value ?? ""} onChange={(e) => onChange(e.target.value || null)} className="field">
        <option value="">{isPending ? "일정 불러오는 중…" : options.length ? "연결 안 함" : "그날 일정 없음"}</option>
        {!known && <option value={value!}>연결된 일정(다른 날짜)</option>}
        {options.map(([rowId, e]) => (
          <option key={rowId} value={rowId}>
            {e.allDay ? "종일" : e.start} · {e.title}
          </option>
        ))}
      </select>
    </Field>
  );
}
