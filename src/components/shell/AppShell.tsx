"use client";

import { usePathname } from "next/navigation";
import type { ReactNode } from "react";
import { Header } from "./Header";
import { Sidebar } from "./Sidebar";

/** 사이드바·헤더 없이 보여 주는 화면(로그인·가입·재설정, MCP 연결 동의) */
const BARE_PATHS = ["/login", "/signup", "/reset-password", "/update-password", "/oauth"];

/**
 * 앱 공통 셸. 화면 본문은 각 `page.tsx`가 `Screen`으로 감싸 브라우저에서만 그린다(서버 렌더에는 셸과 로딩 표시만 들어간다).
 * 여기서 children을 빼면 페이지 세그먼트가 렌더되지 않아 Next의 instant navigation 검증이 경고를 낸다.
 */
export function AppShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();

  if (BARE_PATHS.some((p) => pathname === p || pathname.startsWith(`${p}/`))) return <>{children}</>;

  return (
    <div className="grid min-h-screen grid-cols-1 md:grid-cols-[76px_minmax(0,1fr)]">
      <Sidebar />
      <div className="relative flex min-w-0 flex-col pb-20 md:pb-0">
        <Header />
        {children}
      </div>
    </div>
  );
}
