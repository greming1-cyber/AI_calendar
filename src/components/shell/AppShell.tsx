"use client";

import { usePathname } from "next/navigation";
import { useSyncExternalStore, type ReactNode } from "react";
import { LoadingState } from "@/components/ui";
import { hasSupabaseEnv } from "@/lib/supabase/env";
import { Header } from "./Header";
import { Sidebar } from "./Sidebar";

/** 사이드바·헤더 없이 보여 주는 화면(로그인·가입·재설정) */
const BARE_PATHS = ["/login", "/signup", "/reset-password", "/update-password"];

const noop = () => () => {};

/**
 * 앱 공통 셸. 화면 데이터는 모두 로그인 사용자의 것이라 브라우저에서 TanStack Query로 읽는다.
 * cacheComponents는 클라이언트 컴포넌트도 서버에서 미리 렌더하므로, 현재 시각·쿼리 상태를 읽는 화면 본문은
 * 브라우저에서만 그린다(서버 렌더에는 셸과 로딩 표시만 들어간다).
 */
export function AppShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const inBrowser = useSyncExternalStore(noop, () => true, () => false);

  if (BARE_PATHS.some((p) => pathname === p || pathname.startsWith(`${p}/`))) return <>{children}</>;

  return (
    <div className="grid min-h-screen grid-cols-1 md:grid-cols-[76px_minmax(0,1fr)]">
      <Sidebar />
      <div className="relative flex min-w-0 flex-col pb-20 md:pb-0">
        <Header />
        {!inBrowser ? (
          <LoadingState />
        ) : !hasSupabaseEnv() ? (
          <LoadingState label=".env.local 에 Supabase 환경변수를 넣으면 실데이터가 보여요." />
        ) : (
          children
        )}
      </div>
    </div>
  );
}
