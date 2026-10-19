import { NextResponse, type NextRequest } from "next/server";
import { OAUTH_STATE_COOKIE, authorizeUrl } from "@/lib/google/server";
import { createClient } from "@/lib/supabase/server";

/** GCAL-01: 구글 연결 시작. CSRF 방지용 state를 쿠키에 두고 구글 동의 화면으로 보낸다 */
export async function GET(request: NextRequest) {
  const { origin } = request.nextUrl;
  const supabase = await createClient();
  const { data } = await supabase.auth.getUser();
  if (!data.user) return NextResponse.redirect(new URL("/login?next=/settings?tab=google", origin));

  let url: string;
  try {
    const state = crypto.randomUUID();
    url = authorizeUrl(origin, state);
    const res = NextResponse.redirect(url);
    res.cookies.set(OAUTH_STATE_COOKIE, state, {
      httpOnly: true,
      sameSite: "lax",
      secure: origin.startsWith("https://"),
      path: "/api/google",
      maxAge: 600,
    });
    return res;
  } catch {
    return NextResponse.redirect(new URL("/settings?tab=google&google=config", origin));
  }
}
