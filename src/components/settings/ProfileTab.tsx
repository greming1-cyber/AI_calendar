"use client";

// 내 정보 탭 (SET-01, AUTH-05). 00 세션 담당.
import { useQueryClient } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { CardHead, ErrorState, LoadingState, Modal, useToast } from "@/components/ui";
import { useProfile, useSeedDemo, useUpdateProfileName } from "@/lib/hooks/use-profile";
import { deleteAccount } from "@/lib/supabase/account-actions";
import { createClient } from "@/lib/supabase/client";

const DELETE_CONFIRM_TEXT = "탈퇴";

export function ProfileTab() {
  const profileQuery = useProfile();
  if (profileQuery.isPending) return <LoadingState />;
  if (profileQuery.isError || !profileQuery.data) return <ErrorState retry={() => profileQuery.refetch()} />;
  const profile = profileQuery.data;

  return (
    <>
      <NameCard key={profile.name} name={profile.name} email={profile.email} />
      <PasswordCard />
      <DemoCard />
      <DeleteCard />
    </>
  );
}

function NameCard({ name: initial, email }: { name: string; email: string }) {
  const toast = useToast();
  const update = useUpdateProfileName();
  const [name, setName] = useState(initial);
  const changed = name.trim() !== initial && name.trim().length > 0;

  const save = (e: React.FormEvent) => {
    e.preventDefault();
    if (!changed) return;
    update.mutate(name.trim(), {
      onSuccess: () => toast.success("이름을 바꿨어요."),
      onError: () => toast.error("이름을 저장하지 못했어요."),
    });
  };

  return (
    <form onSubmit={save} className="card card-warm gap-4 p-5">
      <CardHead title="기본 정보" />
      <label className="flex min-w-0 flex-col gap-1.5 text-xs text-muted">
        이름
        <input value={name} onChange={(e) => setName(e.target.value)} maxLength={40} className="field" />
      </label>
      <div className="flex flex-col gap-1.5 text-xs text-muted">
        이메일
        <span className="field text-subtle">{email}</span>
      </div>
      <button
        type="submit"
        disabled={!changed || update.isPending}
        className="pill pill-accent self-end px-5 py-2.5 text-[13px] disabled:cursor-not-allowed disabled:opacity-45"
      >
        {update.isPending ? "저장 중…" : "저장"}
      </button>
    </form>
  );
}

function PasswordCard() {
  const toast = useToast();
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    if (password.length < 8) return setError("비밀번호는 8자 이상으로 정해 주세요.");
    if (password !== confirm) return setError("두 비밀번호가 같지 않아요.");
    setBusy(true);
    setError("");
    const { error } = await createClient().auth.updateUser({ password });
    setBusy(false);
    if (error) return setError(error.code === "same_password" ? "지금 쓰는 비밀번호와 달라야 해요." : "비밀번호를 바꾸지 못했어요.");
    setPassword("");
    setConfirm("");
    toast.success("비밀번호를 바꿨어요.");
  };

  return (
    <form onSubmit={save} className="card card-flat gap-4 p-5">
      <CardHead title="비밀번호 변경" meta="구글로 가입했다면 여기서 비밀번호를 새로 정할 수 있어요" />
      <div className="grid grid-cols-[repeat(auto-fit,minmax(200px,1fr))] gap-3">
        <label className="flex min-w-0 flex-col gap-1.5 text-xs text-muted">
          새 비밀번호 (8자 이상)
          <input type="password" autoComplete="new-password" value={password} onChange={(e) => setPassword(e.target.value)} className="field" />
        </label>
        <label className="flex min-w-0 flex-col gap-1.5 text-xs text-muted">
          새 비밀번호 확인
          <input type="password" autoComplete="new-password" value={confirm} onChange={(e) => setConfirm(e.target.value)} className="field" />
        </label>
      </div>
      {error && <span role="alert" className="text-xs text-danger">{error}</span>}
      <button
        type="submit"
        disabled={busy || !password}
        className="pill self-end px-5 py-2.5 text-[13px] disabled:cursor-not-allowed disabled:opacity-45"
      >
        {busy ? "변경 중…" : "비밀번호 변경"}
      </button>
    </form>
  );
}

/** 테스트 계정용: 시안 예시 데이터를 채운다(DB 함수 seed_demo). */
function DemoCard() {
  const toast = useToast();
  const seed = useSeedDemo();
  const [ask, setAsk] = useState(false);

  const run = () =>
    seed.mutate(undefined, {
      onSuccess: () => {
        setAsk(false);
        toast.success("예시 데이터를 채웠어요.");
      },
      onError: () => toast.error("예시 데이터를 넣지 못했어요."),
    });

  return (
    <section className="card card-flat flex-row flex-wrap items-center gap-4 p-5">
      <div className="flex flex-1 flex-col gap-[3px]">
        <span className="text-sm">예시 데이터 채우기</span>
        <span className="text-xs text-subtle">시안과 같은 일정·할일·가계부 예시를 오늘 날짜 기준으로 넣어요. 테스트 계정용이에요.</span>
      </div>
      <button type="button" onClick={() => setAsk(true)} className="pill px-4 py-2">
        채우기
      </button>
      <Modal
        open={ask}
        onClose={() => setAsk(false)}
        title="예시 데이터를 채울까요?"
        width={440}
        footer={
          <>
            <button type="button" onClick={() => setAsk(false)} className="pill ml-auto px-4 py-2.5 text-[13px]">
              취소
            </button>
            <button type="button" onClick={run} disabled={seed.isPending} className="pill pill-accent px-5 py-2.5 text-[13px]">
              {seed.isPending ? "채우는 중…" : "채우기"}
            </button>
          </>
        }
      >
        <p className="m-0 text-[13px] leading-relaxed text-muted">
          지금 계정의 일정·할일·가계부 내역·고정지출·예산을 <b className="text-fg">모두 지우고</b> 예시 데이터로 바꿔요. 되돌릴 수 없어요.
        </p>
      </Modal>
    </section>
  );
}

/** AUTH-05: 확인 문구를 입력해야 탈퇴된다. */
function DeleteCard() {
  const router = useRouter();
  const qc = useQueryClient();
  const toast = useToast();
  const [open, setOpen] = useState(false);
  const [text, setText] = useState("");
  const [pending, startTransition] = useTransition();
  const ready = text.trim() === DELETE_CONFIRM_TEXT;

  const submit = () =>
    startTransition(async () => {
      const result = await deleteAccount(text);
      if (!result.ok) return toast.error(result.message);
      await createClient().auth.signOut({ scope: "local" });
      qc.clear();
      router.replace("/login");
    });

  return (
    <section className="card card-flat flex-row flex-wrap items-center gap-4 p-5">
      <div className="flex flex-1 flex-col gap-[3px]">
        <span className="text-sm">회원 탈퇴</span>
        <span className="text-xs text-subtle">모든 일정·할일·가계부 데이터와 외부 연동 정보가 삭제돼요.</span>
      </div>
      <button type="button" onClick={() => setOpen(true)} className="pill pill-danger px-4 py-2">
        탈퇴하기
      </button>
      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title="정말 탈퇴할까요?"
        width={440}
        footer={
          <>
            <button type="button" onClick={() => setOpen(false)} className="pill ml-auto px-4 py-2.5 text-[13px]">
              취소
            </button>
            <button
              type="button"
              onClick={submit}
              disabled={!ready || pending}
              className="pill pill-danger px-5 py-2.5 text-[13px] disabled:cursor-not-allowed disabled:opacity-45"
            >
              {pending ? "처리 중…" : "탈퇴"}
            </button>
          </>
        }
      >
        <p className="m-0 text-[13px] leading-relaxed text-muted">
          탈퇴하면 모든 데이터가 즉시 삭제되고 되돌릴 수 없어요. 계속하려면 아래에 <b className="text-fg">{DELETE_CONFIRM_TEXT}</b>를 입력하세요.
        </p>
        <input autoFocus value={text} onChange={(e) => setText(e.target.value)} placeholder={DELETE_CONFIRM_TEXT} className="field" />
      </Modal>
    </section>
  );
}
