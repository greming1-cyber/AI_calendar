"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { AuthCard, Field, Notice, SubmitButton, authErrorMessage } from "../auth-ui";

/** AUTH-03: 재설정 링크로 들어온 사용자(이미 세션 있음)가 새 비밀번호를 정한다. */
export default function UpdatePasswordPage() {
  const router = useRouter();
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (password.length < 8) return setError("비밀번호는 8자 이상으로 정해 주세요.");
    if (password !== confirm) return setError("두 비밀번호가 같지 않아요.");
    setBusy(true);
    setError("");
    const supabase = createClient();
    const { error } = await supabase.auth.updateUser({ password });
    if (error) {
      setBusy(false);
      return setError(authErrorMessage(error));
    }
    // 다른 기기의 세션까지 끊고 새 비밀번호로 다시 로그인하게 한다.
    await supabase.auth.signOut({ scope: "global" });
    router.replace("/login?reset=done");
  };

  return (
    <AuthCard title="새 비밀번호 정하기">
      <form onSubmit={submit} className="flex flex-col gap-3.5">
        <Field
          label="새 비밀번호 (8자 이상)"
          type="password"
          autoComplete="new-password"
          required
          minLength={8}
          value={password}
          onChange={(e) => setPassword(e.target.value)}
        />
        <Field
          label="새 비밀번호 확인"
          type="password"
          autoComplete="new-password"
          required
          value={confirm}
          onChange={(e) => setConfirm(e.target.value)}
        />
        {error && <Notice tone="error">{error}</Notice>}
        <SubmitButton busy={busy}>비밀번호 바꾸기</SubmitButton>
      </form>
    </AuthCard>
  );
}
