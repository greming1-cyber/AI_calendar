"use client";

// 원격 MCP 연결 동의: 앱 정보·리다이렉트 호스트를 보여 주고, 권한(서비스 × 읽기/쓰기)을 골라 승인·거부한다.
// 고른 권한은 승인 직전에 mcp_oauth_grants에 저장하고, mcp-remote가 액세스 토큰의 client_id로 찾아 쓴다.
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";
import { AuthCard, Notice } from "@/app/(auth)/auth-ui";
import { ScopePicker, useScopePicker } from "@/components/settings/McpTab";
import { saveMcpGrant } from "@/lib/data/mcp-tokens";
import { createClient } from "@/lib/supabase/client";

interface Details {
  authorizationId: string;
  clientId: string;
  clientName: string;
  redirectHost: string;
  loopback: boolean;
  userId: string;
  email: string;
}

type State = { kind: "loading" } | { kind: "error"; message: string } | { kind: "redirecting"; message: string } | { kind: "ready"; details: Details };

const hostOf = (uri: string) => {
  try {
    return new URL(uri).hostname;
  } catch {
    return uri;
  }
};

export function ConsentForm() {
  const params = useSearchParams();
  const router = useRouter();
  const authorizationId = params.get("authorization_id");
  const picker = useScopePicker();
  const [state, setState] = useState<State>({ kind: "loading" });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!authorizationId) return;
    let cancelled = false;
    createClient()
      .auth.oauth.getAuthorizationDetails(authorizationId)
      .then(({ data, error: e }) => {
        if (cancelled) return;
        if (e || !data) {
          setState({ kind: "error", message: "연결 요청이 만료됐거나 잘못됐어요. 앱에서 연결을 다시 시작해 주세요." });
          return;
        }
        // 이미 동의한 앱이면 Supabase가 바로 돌아갈 주소를 준다.
        if (!("authorization_id" in data)) {
          setState({ kind: "redirecting", message: "이미 연결을 허용한 앱이에요. 앱으로 돌아가는 중…" });
          window.location.href = data.redirect_url;
          return;
        }
        const host = hostOf(data.redirect_uri);
        setState({
          kind: "ready",
          details: {
            authorizationId: data.authorization_id,
            clientId: data.client.id,
            clientName: data.client.name,
            redirectHost: host,
            loopback: host === "localhost" || host === "127.0.0.1" || host === "[::1]",
            userId: data.user.id,
            email: data.user.email,
          },
        });
      });
    return () => {
      cancelled = true;
    };
  }, [authorizationId]);

  if (!authorizationId) {
    return (
      <AuthCard title="앱 연결">
        <Notice tone="error">연결 요청 정보가 없어요. Claude나 ChatGPT에서 연결을 다시 시작해 주세요.</Notice>
      </AuthCard>
    );
  }
  if (state.kind === "loading") return <AuthCard title="앱 연결">{<Notice>연결 요청을 확인하는 중…</Notice>}</AuthCard>;
  if (state.kind === "redirecting") return <AuthCard title="앱 연결">{<Notice>{state.message}</Notice>}</AuthCard>;
  if (state.kind === "error") return <AuthCard title="앱 연결">{<Notice tone="error">{state.message}</Notice>}</AuthCard>;

  const d = state.details;
  const approve = async () => {
    setBusy(true);
    setError("");
    try {
      await saveMcpGrant({ userId: d.userId, clientId: d.clientId, clientName: d.clientName, redirectHost: d.redirectHost, scopes: picker.scopes });
      const { error: e } = await createClient().auth.oauth.approveAuthorization(d.authorizationId);
      if (e) throw e;
      setState({ kind: "redirecting", message: "연결을 허용했어요. 앱으로 돌아가는 중…" });
    } catch {
      setError("연결을 허용하지 못했어요. 앱에서 연결을 다시 시작해 주세요.");
      setBusy(false);
    }
  };
  const deny = async () => {
    setBusy(true);
    const { error: e } = await createClient().auth.oauth.denyAuthorization(d.authorizationId);
    if (e) {
      setError("요청을 거부하지 못했어요. 이 창을 닫아도 연결되지 않아요.");
      setBusy(false);
      return;
    }
    setState({ kind: "redirecting", message: "연결을 거부했어요. 앱으로 돌아가는 중…" });
  };
  const switchAccount = async () => {
    await createClient().auth.signOut();
    router.replace(`/login?next=${encodeURIComponent(`/oauth/consent?authorization_id=${d.authorizationId}`)}`);
  };

  return (
    <AuthCard
      title="앱 연결"
      desc={
        <>
          <b className="text-fg">{d.clientName || "이름 없는 앱"}</b>이(가) 라이프 매니저의 일정·할일·가계부에 접근하려고 해요. 허용하면 대화에서 조회하고, 쓰기 권한을 주면 등록·수정·삭제도 할 수 있어요.
        </>
      }
      footer={
        <span>
          {d.email} 계정으로 연결해요 ·{" "}
          <button type="button" onClick={switchAccount} className="text-fg underline-offset-4 hover:underline">
            다른 계정으로
          </button>
        </span>
      }
    >
      <Notice>
        연결 후 돌아갈 곳: <b className="text-fg">{d.redirectHost}</b>
        {d.loopback && " — 이 컴퓨터에서 실행 중인 프로그램(예: Claude Code)이에요. 직접 시작한 연결이 아니면 거부하세요."}
      </Notice>
      <ScopePicker picker={picker} />
      {error && <Notice tone="error">{error}</Notice>}
      <div className="flex gap-2">
        <button type="button" onClick={deny} disabled={busy} className="pill flex-1 justify-center px-5 py-3 text-[13px] disabled:opacity-45">
          거부
        </button>
        <button
          type="button"
          onClick={approve}
          disabled={busy || !picker.scopes.length}
          className="pill pill-accent flex-1 justify-center px-5 py-3 text-[13px] disabled:cursor-not-allowed disabled:opacity-45"
        >
          {busy ? "처리 중…" : "연결 허용"}
        </button>
      </div>
      <span className="text-center text-[11px] text-subtle">언제든 설정 → MCP 연결 → 연결된 앱에서 해제할 수 있어요.</span>
    </AuthCard>
  );
}
