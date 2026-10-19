import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";
import { SUPABASE_ANON_KEY, SUPABASE_URL } from "@/lib/supabase/env";

// 구글 캘린더 연결(GCAL-01). 로그인(Supabase Auth)과 별개의 OAuth 흐름이고, refresh token은 Vault에 둔다.

export const GOOGLE_SCOPES = [
  "openid",
  "email",
  "https://www.googleapis.com/auth/calendar.events",
  "https://www.googleapis.com/auth/calendar.readonly",
];

export const OAUTH_STATE_COOKIE = "g_oauth_state";

export function googleClient() {
  const id = process.env.GOOGLE_CLIENT_ID;
  const secret = process.env.GOOGLE_CLIENT_SECRET;
  if (!id || !secret) throw new Error(".env.local 에 GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET 를 넣어 주세요.");
  return { id, secret };
}

export const redirectUri = (origin: string) => `${origin}/api/google/callback`;

export function authorizeUrl(origin: string, state: string) {
  const url = new URL("https://accounts.google.com/o/oauth2/v2/auth");
  url.search = new URLSearchParams({
    client_id: googleClient().id,
    redirect_uri: redirectUri(origin),
    response_type: "code",
    scope: GOOGLE_SCOPES.join(" "),
    access_type: "offline",
    prompt: "consent", // 다시 연결해도 refresh token을 받는다
    include_granted_scopes: "true",
    state,
  }).toString();
  return url.toString();
}

export async function exchangeCode(origin: string, code: string) {
  const { id, secret } = googleClient();
  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ code, client_id: id, client_secret: secret, redirect_uri: redirectUri(origin), grant_type: "authorization_code" }),
  });
  const body = await res.json();
  if (!res.ok) throw new Error(`구글 토큰 교환 실패: ${body.error ?? res.status}`);
  return body as { access_token: string; refresh_token?: string; scope: string; expires_in: number };
}

export async function googleEmail(accessToken: string): Promise<string> {
  const res = await fetch("https://openidconnect.googleapis.com/v1/userinfo", { headers: { Authorization: `Bearer ${accessToken}` } });
  if (!res.ok) throw new Error("구글 계정 정보를 읽지 못했습니다.");
  const body = await res.json();
  return body.email as string;
}

/** 토큰을 구글에서 폐기한다. 이미 만료·철회된 토큰이면 조용히 넘어간다 */
export async function revokeToken(token: string) {
  await fetch("https://oauth2.googleapis.com/revoke", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ token }),
  }).catch(() => undefined);
}

/** 사용자의 모든 구글 계정 토큰을 폐기한다(탈퇴 전, AUTH-05) */
export async function revokeAllGoogleTokens(userId: string) {
  const admin = createAdminClient();
  const { data } = await admin.from("google_accounts").select("id").eq("user_id", userId);
  for (const a of data ?? []) {
    const { data: token } = await admin.rpc("get_google_refresh_token", { p_account_id: a.id });
    if (token) await revokeToken(token);
  }
}

/** Edge Function gcal-sync를 사용자 JWT로 부른다 */
export async function invokeGcalSync(accessToken: string, action: "sync" | "calendars") {
  const res = await fetch(`${SUPABASE_URL}/functions/v1/gcal-sync`, {
    method: "POST",
    headers: { Authorization: `Bearer ${accessToken}`, apikey: SUPABASE_ANON_KEY, "Content-Type": "application/json" },
    body: JSON.stringify({ action }),
  });
  return res.json().catch(() => ({ ok: false }));
}
