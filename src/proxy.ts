import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import type { Database } from "@/lib/supabase/database.types";
import { SESSION_MAX_AGE, SUPABASE_ANON_KEY, SUPABASE_URL, hasSupabaseEnv } from "@/lib/supabase/env";

/** 로그인 없이 열 수 있는 경로 */
const PUBLIC_PATHS = ["/login", "/signup", "/reset-password", "/auth/callback"];
/** 로그인한 사용자가 열면 홈으로 보내는 경로 */
const GUEST_ONLY = ["/login", "/signup", "/reset-password"];

const matches = (pathname: string, list: string[]) => list.some((p) => pathname === p || pathname.startsWith(`${p}/`));

// 요청마다 Supabase 세션 쿠키를 갱신하고, 미로그인 사용자를 /login 으로 보낸다.
export async function proxy(request: NextRequest) {
  // 환경변수가 없으면(키 준비 전) 인증 없이 통과시킨다. 화면은 데이터 대신 안내를 보여 준다.
  if (!hasSupabaseEnv()) return NextResponse.next({ request });

  let response = NextResponse.next({ request });

  const supabase = createServerClient<Database>(SUPABASE_URL, SUPABASE_ANON_KEY, {
    cookieOptions: { maxAge: SESSION_MAX_AGE },
    cookies: {
      getAll: () => request.cookies.getAll(),
      setAll: (cookiesToSet, headers) => {
        cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
        response = NextResponse.next({ request });
        cookiesToSet.forEach(({ name, value, options }) => response.cookies.set(name, value, options));
        Object.entries(headers).forEach(([key, value]) => response.headers.set(key, value));
      },
    },
  });

  // getClaims()가 JWT를 검증하고 필요하면 토큰을 갱신한다. 이 호출과 createServerClient 사이에 다른 코드를 두지 않는다.
  const { data } = await supabase.auth.getClaims();
  const signedIn = Boolean(data?.claims);
  const { pathname, search } = request.nextUrl;

  const redirect = (to: string) => {
    const res = NextResponse.redirect(new URL(to, request.url));
    response.cookies.getAll().forEach((c) => res.cookies.set(c));
    return res;
  };

  if (!signedIn && !matches(pathname, PUBLIC_PATHS)) {
    const next = pathname === "/" ? "" : `?next=${encodeURIComponent(pathname + search)}`;
    return redirect(`/login${next}`);
  }
  if (signedIn && matches(pathname, GUEST_ONLY)) return redirect("/");

  return response;
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico|webmanifest)$).*)"],
};
