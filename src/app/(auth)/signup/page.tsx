"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { AuthCard, Divider, Field, GoogleButton, Notice, SubmitButton, TextLink, authErrorMessage, callbackUrl } from "../auth-ui";

/** AUTH-01: 이메일·비밀번호 가입. 메일의 인증 링크를 눌러야 계정이 활성화된다. */
export default function SignupPage() {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [sentTo, setSentTo] = useState("");

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (password.length < 8) return setError("비밀번호는 8자 이상으로 정해 주세요.");
    setBusy(true);
    setError("");
    const { data, error } = await createClient().auth.signUp({
      email: email.trim(),
      password,
      options: { data: { name: name.trim() }, emailRedirectTo: callbackUrl("/") },
    });
    setBusy(false);
    if (error) return setError(authErrorMessage(error));
    // 이미 가입된 이메일이면 Supabase는 오류 대신 identities가 빈 사용자를 돌려준다.
    if (data.user && data.user.identities?.length === 0) return setError(authErrorMessage({ code: "user_already_exists" }));
    setSentTo(email.trim());
  };

  if (sentTo) {
    return (
      <AuthCard
        title="메일을 확인해 주세요"
        desc={
          <>
            <b className="text-fg">{sentTo}</b> 로 인증 메일을 보냈어요. 메일의 링크를 누르면 가입이 끝나고 바로 로그인돼요.
          </>
        }
        footer={<TextLink href="/login">로그인으로 돌아가기</TextLink>}
      >
        <Notice>메일이 오지 않으면 스팸함을 확인하거나 잠시 뒤 다시 가입해 주세요.</Notice>
      </AuthCard>
    );
  }

  return (
    <AuthCard
      title="회원가입"
      footer={
        <>
          이미 계정이 있나요? <TextLink href="/login">로그인</TextLink>
        </>
      }
    >
      <form onSubmit={submit} className="flex flex-col gap-3.5">
        <Field label="이름" autoComplete="name" required value={name} onChange={(e) => setName(e.target.value)} />
        <Field label="이메일" type="email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
        <Field
          label="비밀번호 (8자 이상)"
          type="password"
          autoComplete="new-password"
          required
          minLength={8}
          value={password}
          onChange={(e) => setPassword(e.target.value)}
        />
        {error && <Notice tone="error">{error}</Notice>}
        <SubmitButton busy={busy}>가입하기</SubmitButton>
      </form>
      <Divider />
      <GoogleButton />
    </AuthCard>
  );
}
