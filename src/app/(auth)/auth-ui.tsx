"use client";

import Link from "next/link";
import type { ReactNode } from "react";
import { createClient } from "@/lib/supabase/client";
import { hasSupabaseEnv } from "@/lib/supabase/env";

/** 로그인·가입·재설정 화면 공통 카드 */
export function AuthCard({ title, desc, children, footer }: { title: string; desc?: ReactNode; children: ReactNode; footer?: ReactNode }) {
  return (
    <main className="flex min-h-screen items-center justify-center px-4 py-10">
      <section className="card card-warm w-[min(420px,100%)] gap-5 p-7">
        <div className="flex items-center gap-3">
          <div className="flex size-10 items-center justify-center rounded-full bg-accent font-extrabold text-ink">L</div>
          <div className="flex flex-col gap-0.5">
            <span className="text-xs text-muted">라이프 매니저</span>
            <span className="text-xl font-bold">{title}</span>
          </div>
        </div>
        {desc && <p className="m-0 text-[13px] leading-relaxed text-muted">{desc}</p>}
        {!hasSupabaseEnv() && <Notice tone="error">Supabase 환경변수가 없어 로그인할 수 없어요. .env.local 을 확인해 주세요.</Notice>}
        {children}
        {footer && <div className="flex flex-wrap justify-center gap-x-4 gap-y-2 border-t border-line pt-4 text-xs text-muted">{footer}</div>}
      </section>
    </main>
  );
}

export function Field({
  label,
  ...props
}: { label: string } & React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <label className="flex min-w-0 flex-col gap-1.5 text-xs text-muted">
      {label}
      <input {...props} className="field" />
    </label>
  );
}

export function SubmitButton({ busy, children }: { busy: boolean; children: ReactNode }) {
  return (
    <button
      type="submit"
      disabled={busy}
      className="pill pill-accent justify-center px-5 py-3 text-[13px] disabled:cursor-not-allowed disabled:opacity-45"
    >
      {busy ? "처리 중…" : children}
    </button>
  );
}

export function Notice({ tone = "info", children }: { tone?: "info" | "error"; children: ReactNode }) {
  return (
    <div
      role={tone === "error" ? "alert" : "status"}
      className={`rounded-[10px] px-3 py-2.5 text-xs leading-relaxed ${tone === "error" ? "border border-danger-line text-danger" : "bg-white/[.06] text-soft"}`}
    >
      {children}
    </div>
  );
}

export function TextLink({ href, children }: { href: string; children: ReactNode }) {
  return (
    <Link href={href} className="text-fg underline-offset-4 hover:underline">
      {children}
    </Link>
  );
}

/** 로그인 뒤 돌아갈 경로. 외부 주소로 튀지 않게 같은 사이트의 절대 경로만 허용한다. */
export const safeNext = (next: string | null | undefined) =>
  next && next.startsWith("/") && !next.startsWith("//") ? next : "/";

export const callbackUrl = (next = "/") =>
  `${window.location.origin}/auth/callback?next=${encodeURIComponent(safeNext(next))}`;

/** Supabase Auth 오류 메시지를 화면 문구로 바꾼다. */
export function authErrorMessage(error: { message?: string; code?: string } | null | undefined) {
  if (!error) return "";
  const code = error.code ?? "";
  const msg = error.message ?? "";
  if (code === "invalid_credentials" || /Invalid login credentials/i.test(msg)) return "이메일 또는 비밀번호가 맞지 않아요.";
  if (code === "email_not_confirmed" || /Email not confirmed/i.test(msg)) return "메일 인증을 아직 마치지 않았어요. 받은 편지함을 확인해 주세요.";
  if (code === "user_already_exists" || /already registered/i.test(msg)) return "이미 가입된 이메일이에요. 로그인해 주세요.";
  if (code === "weak_password" || /Password should be/i.test(msg)) return "비밀번호가 너무 짧거나 쉬워요. 8자 이상으로 정해 주세요.";
  if (code === "same_password") return "지금 쓰는 비밀번호와 달라야 해요.";
  if (code === "over_email_send_rate_limit" || /rate limit/i.test(msg)) return "요청이 너무 많아요. 잠시 뒤 다시 시도해 주세요.";
  return msg || "문제가 생겼어요. 잠시 뒤 다시 시도해 주세요.";
}

/** AUTH-02: 구글 로그인. 캘린더 권한은 요청하지 않는다(04 세션이 별도 OAuth로 연결). */
export function GoogleButton({ next }: { next?: string }) {
  const signIn = async () => {
    await createClient().auth.signInWithOAuth({
      provider: "google",
      options: { redirectTo: callbackUrl(next) },
    });
  };
  return (
    <button type="button" onClick={signIn} disabled={!hasSupabaseEnv()} className="pill justify-center gap-2 px-5 py-3 text-[13px] disabled:opacity-45">
      <span className="flex size-5 items-center justify-center rounded-full bg-fg text-[11px] font-extrabold text-ink">G</span>
      구글 계정으로 계속하기
    </button>
  );
}

export function Divider() {
  return (
    <div className="flex items-center gap-3 text-[11px] text-subtle">
      <span className="h-px flex-1 bg-line" />
      또는
      <span className="h-px flex-1 bg-line" />
    </div>
  );
}
