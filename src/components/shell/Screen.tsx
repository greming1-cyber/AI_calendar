"use client";

import { useSyncExternalStore, type ReactNode } from "react";
import { LoadingState } from "@/components/ui";
import { hasSupabaseEnv } from "@/lib/supabase/env";

const noop = () => () => {};

/**
 * 화면 본문을 브라우저에서만 그린다. 화면 데이터는 모두 로그인 사용자의 것이라 TanStack Query로 읽는데,
 * cacheComponents는 클라이언트 컴포넌트도 서버에서 미리 렌더하므로 현재 시각·쿼리 상태를 읽는 본문은 서버에서 그리지 않는다.
 * 각 `page.tsx` 안에서 감싼다. 레이아웃(AppShell)이 children을 빼면 Next가 페이지 세그먼트를 렌더하지 못해
 * instant navigation 검증 경고("Dropped segment")를 낸다.
 */
export function Screen({ children }: { children: ReactNode }) {
  const inBrowser = useSyncExternalStore(noop, () => true, () => false);
  if (!inBrowser) return <LoadingState />;
  if (!hasSupabaseEnv()) return <LoadingState label=".env.local 에 Supabase 환경변수를 넣으면 실데이터가 보여요." />;
  return children;
}
