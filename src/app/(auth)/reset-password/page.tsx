"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { AuthCard, Field, Notice, SubmitButton, TextLink, authErrorMessage, callbackUrl } from "../auth-ui";

/** AUTH-03: 비밀번호 재설정 메일. 링크를 누르면 /update-password 로 이동한다. */
export default function ResetPasswordPage() {
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [sent, setSent] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError("");
    const { error } = await createClient().auth.resetPasswordForEmail(email.trim(), {
      redirectTo: callbackUrl("/update-password"),
    });
    setBusy(false);
    if (error) return setError(authErrorMessage(error));
    setSent(true);
  };

  return (
    <AuthCard
      title="비밀번호 찾기"
      desc="가입한 이메일을 입력하면 비밀번호를 다시 정할 수 있는 링크를 보내 드려요."
      footer={<TextLink href="/login">로그인으로 돌아가기</TextLink>}
    >
      {sent ? (
        <Notice>
          {email} 로 재설정 메일을 보냈어요. 메일의 링크를 눌러 새 비밀번호를 정해 주세요.
        </Notice>
      ) : (
        <form onSubmit={submit} className="flex flex-col gap-3.5">
          <Field label="이메일" type="email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
          {error && <Notice tone="error">{error}</Notice>}
          <SubmitButton busy={busy}>재설정 메일 받기</SubmitButton>
        </form>
      )}
    </AuthCard>
  );
}
