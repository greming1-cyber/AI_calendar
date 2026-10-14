"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { AuthCard, Divider, Field, GoogleButton, Notice, SubmitButton, TextLink, authErrorMessage, safeNext } from "../auth-ui";

const CALLBACK_ERRORS: Record<string, string> = {
  callback: "로그인 링크가 만료됐거나 이미 사용됐어요. 다시 시도해 주세요.",
};

export function LoginForm() {
  const router = useRouter();
  const params = useSearchParams();
  const next = safeNext(params.get("next"));
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(() => CALLBACK_ERRORS[params.get("error") ?? ""] ?? "");

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError("");
    const { error } = await createClient().auth.signInWithPassword({ email: email.trim(), password });
    setBusy(false);
    if (error) return setError(authErrorMessage(error));
    router.replace(next);
    router.refresh();
  };

  return (
    <AuthCard
      title="로그인"
      footer={
        <>
          <TextLink href="/signup">회원가입</TextLink>
          <TextLink href="/reset-password">비밀번호 찾기</TextLink>
        </>
      }
    >
      {params.get("reset") === "done" && <Notice>비밀번호를 바꿨어요. 새 비밀번호로 로그인해 주세요.</Notice>}
      <form onSubmit={submit} className="flex flex-col gap-3.5">
        <Field label="이메일" type="email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
        <Field
          label="비밀번호"
          type="password"
          autoComplete="current-password"
          required
          value={password}
          onChange={(e) => setPassword(e.target.value)}
        />
        {error && <Notice tone="error">{error}</Notice>}
        <SubmitButton busy={busy}>로그인</SubmitButton>
      </form>
      <Divider />
      <GoogleButton next={next} />
    </AuthCard>
  );
}
