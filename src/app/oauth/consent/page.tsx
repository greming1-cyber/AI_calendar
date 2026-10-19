import type { Metadata } from "next";
import { Suspense } from "react";
import { ConsentForm } from "./ConsentForm";

export const metadata: Metadata = { title: "앱 연결 · 라이프 매니저" };

/**
 * MCP-07: 원격 MCP OAuth 동의 화면. Supabase Auth OAuth 2.1 서버가 Site URL + Authorization Path(/oauth/consent)로
 * ?authorization_id= 를 붙여 보낸다. 로그인하지 않았으면 proxy가 /login?next= 로 보냈다가 돌아온다.
 * 로그인 화면처럼 셸 없이(AppShell BARE_PATHS) 브라우저에서만 그린다.
 */
export default function OAuthConsentPage() {
  return (
    <Suspense>
      <ConsentForm />
    </Suspense>
  );
}
