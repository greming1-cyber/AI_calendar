import { NextResponse, type NextRequest } from "next/server";
import { GOOGLE_SCOPES, OAUTH_STATE_COOKIE, exchangeCode, googleEmail, invokeGcalSync } from "@/lib/google/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

/**
 * GCAL-01: 구글 동의 후 돌아오는 곳.
 * code → 토큰 교환 → 계정 저장(refresh token은 Vault) → 캘린더 목록 갱신 → 설정 탭으로 돌아간다.
 * 첫 동기화는 설정 탭이 시작한다(오래 걸릴 수 있어 여기서 기다리지 않는다).
 */
export async function GET(request: NextRequest) {
  const { origin, searchParams } = request.nextUrl;
  const back = (result: string) => {
    const res = NextResponse.redirect(new URL(`/settings?tab=google&google=${result}`, origin));
    res.cookies.delete({ name: OAUTH_STATE_COOKIE, path: "/api/google" });
    return res;
  };

  const state = searchParams.get("state");
  if (!state || state !== request.cookies.get(OAUTH_STATE_COOKIE)?.value) return back("state");
  if (searchParams.get("error")) return back("denied");
  const code = searchParams.get("code");
  if (!code) return back("denied");

  const supabase = await createClient();
  const [{ data: userData }, { data: sessionData }] = await Promise.all([supabase.auth.getUser(), supabase.auth.getSession()]);
  const user = userData.user;
  if (!user) return NextResponse.redirect(new URL("/login", origin));

  try {
    const tokens = await exchangeCode(origin, code);
    const granted = tokens.scope.split(" ");
    if (!GOOGLE_SCOPES.filter((s) => s.includes("calendar")).every((s) => granted.includes(s))) {
      return back("scope"); // 동의 화면에서 캘린더 권한 체크를 해제했다
    }
    if (!tokens.refresh_token) return back("refresh");
    const email = await googleEmail(tokens.access_token);

    const admin = createAdminClient();
    const { data: account, error } = await admin
      .from("google_accounts")
      .upsert(
        {
          user_id: user.id,
          google_email: email,
          status: "active",
          access_token_expires_at: new Date(Date.now() + tokens.expires_in * 1000).toISOString(),
        },
        { onConflict: "user_id,google_email" },
      )
      .select("id")
      .single();
    if (error) throw error;
    const { error: tokenError } = await admin.rpc("set_google_refresh_token", { p_account_id: account.id, p_token: tokens.refresh_token });
    if (tokenError) throw tokenError;

    if (sessionData.session) await invokeGcalSync(sessionData.session.access_token, "calendars");
    return back("connected");
  } catch (e) {
    console.error("구글 연결 실패", e);
    return back("failed");
  }
}
