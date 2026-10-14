import type { EmailOtpType } from "@supabase/supabase-js";
import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";

const safeNext = (next: string | null) => (next && next.startsWith("/") && !next.startsWith("//") ? next : "/");

/**
 * 이메일 인증(AUTH-01)·구글 로그인(AUTH-02)·비밀번호 재설정(AUTH-03) 링크가 돌아오는 곳.
 * PKCE 코드(?code=) 또는 메일 템플릿의 토큰(?token_hash=&type=)을 세션으로 바꾼 뒤 next 로 보낸다.
 */
export async function GET(request: NextRequest) {
  const { searchParams, origin } = request.nextUrl;
  const next = safeNext(searchParams.get("next"));
  const code = searchParams.get("code");
  const tokenHash = searchParams.get("token_hash");
  const type = searchParams.get("type") as EmailOtpType | null;

  const supabase = await createClient();
  let ok = false;
  if (code) {
    ok = !(await supabase.auth.exchangeCodeForSession(code)).error;
  } else if (tokenHash && type) {
    ok = !(await supabase.auth.verifyOtp({ token_hash: tokenHash, type })).error;
  }

  if (!ok) return NextResponse.redirect(new URL("/login?error=callback", origin));
  return NextResponse.redirect(new URL(type === "recovery" ? "/update-password" : next, origin));
}
