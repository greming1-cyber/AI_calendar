"use client";

import { useState } from "react";
import { CATEGORY_PALETTE } from "@/components/calendar/CategoryPanel";
import { Modal, Segmented, useToast } from "@/components/ui";
import { isDuplicateName, isValidAmount } from "@/lib/data/transactions";
import { won } from "@/lib/format";
import { useToday } from "@/lib/hooks/use-today";
import {
  useAllRecurringTransactions,
  useDeletePaymentMethod,
  useDeleteRecurring,
  useDeleteTxCategory,
  usePaymentMethods,
  useReorder,
  useSavePaymentMethod,
  useSaveRecurring,
  useSaveTxCategory,
  useTxCategories,
} from "@/lib/hooks/use-transactions";
import { nextOccurrence } from "@/lib/money";
import type { PaymentMethod, RecurringInput, RecurringTransaction, TxCategory, TxType } from "@/lib/types";
import { AmountInput, Chip, Field } from "./fields";

export type ManageTab = "expense" | "income" | "methods" | "recurring";

const TABS: { value: ManageTab; label: string }[] = [
  { value: "expense", label: "지출 분류" },
  { value: "income", label: "수입 분류" },
  { value: "methods", label: "결제수단" },
  { value: "recurring", label: "고정지출" },
];

/** Sitemap 4.5 분류·결제수단 관리(TX-04, TX-05)와 고정지출(TX-07) */
export function ManageModal({ open, onClose, tab: initialTab = "expense" }: { open: boolean; onClose: () => void; tab?: ManageTab }) {
  const [tab, setTab] = useState<ManageTab>(initialTab);
  if (!open) return null;
  return (
    <Modal open onClose={onClose} title="가계부 관리" width={600}>
      <div className="overflow-x-auto">
        <Segmented options={TABS} value={tab} onChange={setTab} />
      </div>
      {tab === "expense" && <CategoryList key="expense" type="expense" />}
      {tab === "income" && <CategoryList key="income" type="income" />}
      {tab === "methods" && <MethodList />}
      {tab === "recurring" && <RecurringList />}
    </Modal>
  );
}

// ── 공통 ─────────────────────────────────────────────────

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
        maxLength={30}
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

function Palette({ value, onChange }: { value: string | null; onChange: (c: string) => void }) {
  return (
    <div className="flex flex-wrap gap-1.5" role="radiogroup" aria-label="색">
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

/** 위·아래 이동 버튼 */
function MoveButtons({ index, length, onMove, name }: { index: number; length: number; onMove: (to: number) => void; name: string }) {
  return (
    <span className="flex flex-none">
      <button type="button" aria-label={`${name} 위로`} disabled={index === 0} onClick={() => onMove(index - 1)} className="px-1.5 text-subtle hover:text-fg disabled:opacity-30">
        ↑
      </button>
      <button type="button" aria-label={`${name} 아래로`} disabled={index === length - 1} onClick={() => onMove(index + 1)} className="px-1.5 text-subtle hover:text-fg disabled:opacity-30">
        ↓
      </button>
    </span>
  );
}

const moved = (ids: string[], from: number, to: number) => {
  const next = [...ids];
  const [x] = next.splice(from, 1);
  next.splice(to, 0, x);
  return next;
};

/** 지울 때 내역을 옮길 곳 고르기 */
function DeleteChooser({
  options,
  emptyLabel,
  onCancel,
  onConfirm,
  note,
}: {
  options: { id: string; name: string }[];
  emptyLabel: string;
  onCancel: () => void;
  onConfirm: (moveTo: string | null) => void;
  note: string;
}) {
  const [moveTo, setMoveTo] = useState("");
  return (
    <div className="flex flex-col gap-2 text-xs text-muted">
      <label className="flex flex-col gap-1.5">
        {note}
        <select value={moveTo} onChange={(e) => setMoveTo(e.target.value)} className="field py-2">
          <option value="">{emptyLabel}</option>
          {options.map((o) => (
            <option key={o.id} value={o.id}>
              {o.name}(으)로 옮기기
            </option>
          ))}
        </select>
      </label>
      <div className="flex gap-2">
        <button type="button" onClick={onCancel} className="pill ml-auto px-3.5">
          취소
        </button>
        <button type="button" onClick={() => onConfirm(moveTo || null)} className="pill pill-danger px-3.5">
          삭제
        </button>
      </div>
    </div>
  );
}

// ── 분류 (TX-04) ─────────────────────────────────────────

function CategoryList({ type }: { type: TxType }) {
  const toast = useToast();
  const { data: all = [] } = useTxCategories();
  const list = all.filter((c) => c.type === type);
  const save = useSaveTxCategory();
  const reorder = useReorder("tx_categories");
  const [adding, setAdding] = useState(false);
  const [color, setColor] = useState<string>(CATEGORY_PALETTE[4]);
  const [editing, setEditing] = useState<string | null>(null);

  const create = (name: string) =>
    save.mutate(
      { id: null, type, name, color },
      {
        onSuccess: () => {
          toast.success("분류를 만들었어요.");
          setAdding(false);
        },
        onError: (e) => toast.error(isDuplicateName(e) ? "같은 이름의 분류가 있어요." : "분류를 만들지 못했어요."),
      },
    );

  return (
    <div className="flex flex-col gap-1">
      {list.map((c, i) =>
        editing === c.id ? (
          <CategoryEditor key={c.id} category={c} others={list.filter((o) => o.id !== c.id)} onDone={() => setEditing(null)} />
        ) : (
          <div key={c.id} className="flex items-center gap-2.5 border-b border-line py-2 text-[13px]">
            <span className="size-2.5 flex-none rounded-full" style={{ background: c.color ?? "rgb(255 255 255 / .25)" }} />
            <span className="min-w-0 flex-1 truncate">{c.name}</span>
            <MoveButtons
              name={c.name}
              index={i}
              length={list.length}
              onMove={(to) => reorder.mutate(moved(list.map((x) => x.id), i, to), { onError: () => toast.error("순서를 바꾸지 못했어요.") })}
            />
            <button type="button" aria-label={`${c.name} 수정`} onClick={() => setEditing(c.id)} className="px-1.5 text-xs text-subtle hover:text-fg">
              ✎
            </button>
          </div>
        ),
      )}
      {!list.length && <span className="py-3 text-[13px] text-subtle">분류가 없어요.</span>}
      {adding ? (
        <div className="mt-2 flex flex-col gap-2 rounded-xl bg-white/[.04] p-2.5">
          <NameInput placeholder={type === "expense" ? "새 지출 분류" : "새 수입 분류"} busy={save.isPending} onSubmit={create} onCancel={() => setAdding(false)} />
          <Palette value={color} onChange={setColor} />
        </div>
      ) : (
        <button type="button" onClick={() => setAdding(true)} className="pill mt-2 self-start px-3.5 py-2 text-[13px]">
          + 분류 추가
        </button>
      )}
    </div>
  );
}

function CategoryEditor({ category, others, onDone }: { category: TxCategory; others: TxCategory[]; onDone: () => void }) {
  const toast = useToast();
  const save = useSaveTxCategory();
  const del = useDeleteTxCategory();
  const [color, setColor] = useState(category.color);
  const [deleting, setDeleting] = useState(false);

  const submit = (name: string) =>
    save.mutate(
      { id: category.id, type: category.type, name, color },
      {
        onSuccess: onDone,
        onError: (e) => toast.error(isDuplicateName(e) ? "같은 이름의 분류가 있어요." : "분류를 저장하지 못했어요."),
      },
    );

  return (
    <div className="my-1 flex flex-col gap-2 rounded-xl bg-white/[.04] p-2.5">
      <NameInput initial={category.name} placeholder="분류 이름" busy={save.isPending} onSubmit={submit} onCancel={onDone} />
      <Palette value={color} onChange={setColor} />
      {deleting ? (
        <DeleteChooser
          note="이 분류의 내역·고정지출을 어떻게 할까요? 이 분류의 예산은 함께 지워져요."
          emptyLabel="분류 없음으로 두기"
          options={others}
          onCancel={() => setDeleting(false)}
          onConfirm={(moveTo) =>
            del.mutate(
              { id: category.id, moveTo },
              {
                onSuccess: () => {
                  toast.success("분류를 삭제했어요.");
                  onDone();
                },
                onError: () => toast.error("분류를 삭제하지 못했어요."),
              },
            )
          }
        />
      ) : (
        <div className="flex gap-2">
          <button type="button" onClick={() => setDeleting(true)} className="pill pill-danger px-3.5">
            삭제
          </button>
          <button type="button" onClick={onDone} className="pill ml-auto px-3.5">
            닫기
          </button>
        </div>
      )}
    </div>
  );
}

// ── 결제수단 (TX-05) ─────────────────────────────────────

const METHOD_TYPES: { value: PaymentMethod["type"]; label: string }[] = [
  { value: "cash", label: "현금" },
  { value: "card", label: "카드" },
  { value: "account", label: "계좌" },
];
const methodTypeLabel = (t: PaymentMethod["type"]) => METHOD_TYPES.find((x) => x.value === t)?.label ?? "";

function MethodList() {
  const toast = useToast();
  const { data: list = [] } = usePaymentMethods();
  const save = useSavePaymentMethod();
  const reorder = useReorder("payment_methods");
  const [adding, setAdding] = useState(false);
  const [type, setType] = useState<PaymentMethod["type"]>("card");
  const [editing, setEditing] = useState<string | null>(null);

  const create = (name: string) =>
    save.mutate(
      { id: null, type, name },
      {
        onSuccess: () => {
          toast.success("결제수단을 만들었어요.");
          setAdding(false);
        },
        onError: (e) => toast.error(isDuplicateName(e) ? "같은 이름의 결제수단이 있어요." : "결제수단을 만들지 못했어요."),
      },
    );

  return (
    <div className="flex flex-col gap-1">
      {list.map((m, i) =>
        editing === m.id ? (
          <MethodEditor key={m.id} method={m} others={list.filter((o) => o.id !== m.id)} onDone={() => setEditing(null)} />
        ) : (
          <div key={m.id} className="flex items-center gap-2.5 border-b border-line py-2 text-[13px]">
            <span className="w-9 flex-none text-[11px] text-subtle">{methodTypeLabel(m.type)}</span>
            <span className="min-w-0 flex-1 truncate">{m.name}</span>
            <MoveButtons
              name={m.name}
              index={i}
              length={list.length}
              onMove={(to) => reorder.mutate(moved(list.map((x) => x.id), i, to), { onError: () => toast.error("순서를 바꾸지 못했어요.") })}
            />
            <button type="button" aria-label={`${m.name} 수정`} onClick={() => setEditing(m.id)} className="px-1.5 text-xs text-subtle hover:text-fg">
              ✎
            </button>
          </div>
        ),
      )}
      {!list.length && <span className="py-3 text-[13px] text-subtle">결제수단이 없어요.</span>}
      {adding ? (
        <div className="mt-2 flex flex-col gap-2 rounded-xl bg-white/[.04] p-2.5">
          <Segmented options={METHOD_TYPES} value={type} onChange={setType} />
          <NameInput placeholder="예: 신한카드, 국민 계좌" busy={save.isPending} onSubmit={create} onCancel={() => setAdding(false)} />
        </div>
      ) : (
        <button type="button" onClick={() => setAdding(true)} className="pill mt-2 self-start px-3.5 py-2 text-[13px]">
          + 결제수단 추가
        </button>
      )}
    </div>
  );
}

function MethodEditor({ method, others, onDone }: { method: PaymentMethod; others: PaymentMethod[]; onDone: () => void }) {
  const toast = useToast();
  const save = useSavePaymentMethod();
  const del = useDeletePaymentMethod();
  const [type, setType] = useState(method.type);
  const [deleting, setDeleting] = useState(false);

  const submit = (name: string) =>
    save.mutate(
      { id: method.id, type, name },
      {
        onSuccess: onDone,
        onError: (e) => toast.error(isDuplicateName(e) ? "같은 이름의 결제수단이 있어요." : "결제수단을 저장하지 못했어요."),
      },
    );

  return (
    <div className="my-1 flex flex-col gap-2 rounded-xl bg-white/[.04] p-2.5">
      <Segmented options={METHOD_TYPES} value={type} onChange={setType} />
      <NameInput initial={method.name} placeholder="결제수단 이름" busy={save.isPending} onSubmit={submit} onCancel={onDone} />
      {deleting ? (
        <DeleteChooser
          note="이 결제수단의 내역·고정지출을 어떻게 할까요?"
          emptyLabel="결제수단 없음으로 두기"
          options={others}
          onCancel={() => setDeleting(false)}
          onConfirm={(moveTo) =>
            del.mutate(
              { id: method.id, moveTo },
              {
                onSuccess: () => {
                  toast.success("결제수단을 삭제했어요.");
                  onDone();
                },
                onError: () => toast.error("결제수단을 삭제하지 못했어요."),
              },
            )
          }
        />
      ) : (
        <div className="flex gap-2">
          <button type="button" onClick={() => setDeleting(true)} className="pill pill-danger px-3.5">
            삭제
          </button>
          <button type="button" onClick={onDone} className="pill ml-auto px-3.5">
            닫기
          </button>
        </div>
      )}
    </div>
  );
}

// ── 고정지출 (TX-07) ─────────────────────────────────────

function RecurringList() {
  const today = useToday();
  const { data: list = [], isPending } = useAllRecurringTransactions();
  const [editing, setEditing] = useState<string | "new" | null>(null);

  return (
    <div className="flex flex-col gap-1">
      <span className="text-xs text-subtle">매월 결제일(말일이 더 짧은 달은 말일)에 내역이 한 번 자동으로 등록돼요.</span>
      {isPending && <span className="py-3 text-[13px] text-subtle">불러오는 중…</span>}
      {list.map((r) =>
        editing === r.id ? (
          <RecurringEditor key={r.id} recurring={r} onDone={() => setEditing(null)} />
        ) : (
          <button
            key={r.id}
            type="button"
            onClick={() => setEditing(r.id)}
            className={`flex items-center gap-3 border-b border-line py-2.5 text-left text-[13px] hover:bg-white/[.03] ${r.active ? "" : "opacity-50"}`}
          >
            <span className="w-14 flex-none text-xs text-muted">매월 {r.dayOfMonth}일</span>
            <span className="flex min-w-0 flex-1 flex-col">
              <span className="truncate">{r.title || r.category || "(메모 없음)"}</span>
              <span className="text-[11px] text-subtle">
                {[r.type === "income" ? "수입" : "지출", r.category, r.method].filter(Boolean).join(" · ")}
                {r.active ? ` · 다음 ${nextOccurrence(r, today).slice(5).replace("-", "/")}` : " · 꺼짐"}
              </span>
            </span>
            <span className="font-semibold whitespace-nowrap" style={{ color: r.type === "income" ? "var(--color-income)" : undefined }}>
              {won(r.amount)}
            </span>
          </button>
        ),
      )}
      {!isPending && !list.length && editing !== "new" && <span className="py-3 text-[13px] text-subtle">등록한 고정지출이 없어요.</span>}
      {editing === "new" ? (
        <RecurringEditor onDone={() => setEditing(null)} />
      ) : (
        <button type="button" onClick={() => setEditing("new")} className="pill mt-2 self-start px-3.5 py-2 text-[13px]">
          + 고정지출 추가
        </button>
      )}
    </div>
  );
}

function RecurringEditor({ recurring, onDone }: { recurring?: RecurringTransaction; onDone: () => void }) {
  const toast = useToast();
  const today = useToday();
  const { data: categories = [] } = useTxCategories();
  const { data: methods = [] } = usePaymentMethods();
  const save = useSaveRecurring();
  const del = useDeleteRecurring();
  const [f, setF] = useState<RecurringInput>(() =>
    recurring
      ? {
          type: recurring.type,
          title: recurring.title,
          amount: recurring.amount,
          dayOfMonth: recurring.dayOfMonth,
          categoryId: recurring.categoryId ?? null,
          paymentMethodId: recurring.paymentMethodId ?? null,
          active: recurring.active,
        }
      : { type: "expense", title: "", amount: 0, dayOfMonth: Number(today.slice(8, 10)), categoryId: null, paymentMethodId: null, active: true },
  );
  const set = <K extends keyof RecurringInput>(k: K, v: RecurringInput[K]) => setF((s) => ({ ...s, [k]: v }));
  const [confirmDelete, setConfirmDelete] = useState(false);
  const valid = isValidAmount(f.amount) && f.dayOfMonth >= 1 && f.dayOfMonth <= 31;
  const busy = save.isPending || del.isPending;

  const submit = () => {
    if (!valid || busy) return;
    // 꺼 둔 것을 다시 켜면 오늘부터 다시 센다(꺼 둔 동안의 회차는 만들지 않는다).
    const resumeFrom = recurring && !recurring.active && f.active ? today : undefined;
    save.mutate(
      { id: recurring?.id ?? null, input: f, resumeFrom },
      {
        onSuccess: () => {
          toast.success(recurring ? "고정지출을 수정했어요." : "고정지출을 등록했어요.");
          onDone();
        },
        onError: () => toast.error("고정지출을 저장하지 못했어요."),
      },
    );
  };

  const remove = () => {
    if (!recurring || busy) return;
    if (!confirmDelete) return setConfirmDelete(true);
    del.mutate(recurring.id, {
      onSuccess: () => {
        toast.success("고정지출을 삭제했어요. 이미 등록된 내역은 남아 있어요.");
        onDone();
      },
      onError: () => toast.error("고정지출을 삭제하지 못했어요."),
    });
  };

  return (
    <div className="my-1 flex flex-col gap-3 rounded-xl bg-white/[.04] p-3">
      <div className="flex flex-wrap items-center gap-3">
        <Segmented
          options={[
            { value: "expense", label: "지출" },
            { value: "income", label: "수입" },
          ]}
          value={f.type}
          onChange={(type) => setF((s) => ({ ...s, type, categoryId: categories.find((c) => c.id === s.categoryId)?.type === type ? s.categoryId : null }))}
        />
        <AmountInput autoFocus={!recurring} value={f.amount} onChange={(n) => set("amount", n)} onEnter={submit} className="min-w-[160px] flex-1" />
      </div>
      <div className="grid grid-cols-[120px_minmax(0,1fr)] gap-3">
        <Field label="매월">
          <select value={f.dayOfMonth} onChange={(e) => set("dayOfMonth", Number(e.target.value))} className="field" aria-label="결제일">
            {Array.from({ length: 31 }, (_, i) => i + 1).map((d) => (
              <option key={d} value={d}>
                {d}일
              </option>
            ))}
          </select>
        </Field>
        <Field label="메모">
          <input value={f.title} onChange={(e) => set("title", e.target.value)} placeholder="예: 통신비" className="field" />
        </Field>
      </div>
      <Field label="분류">
        <div className="flex flex-wrap gap-1.5">
          <Chip selected={!f.categoryId} onClick={() => set("categoryId", null)}>
            분류 없음
          </Chip>
          {categories
            .filter((c) => c.type === f.type)
            .map((c) => (
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
      <div className="flex items-center gap-2.5 text-[13px]">
        <button type="button" role="switch" aria-checked={f.active} aria-label="사용" onClick={() => set("active", !f.active)} className="switch" />
        {f.active ? "사용 중" : "꺼짐 · 자동 등록 안 함"}
      </div>
      <div className="flex gap-2">
        {recurring && (
          <button type="button" onClick={remove} disabled={busy} className="pill pill-danger px-3.5 py-2">
            {confirmDelete ? "정말 삭제" : "삭제"}
          </button>
        )}
        <button type="button" onClick={onDone} className="pill ml-auto px-3.5 py-2">
          취소
        </button>
        <button type="button" onClick={submit} disabled={!valid || busy} className="pill pill-accent px-4 py-2 disabled:opacity-45">
          {save.isPending ? "저장 중…" : "저장"}
        </button>
      </div>
    </div>
  );
}
