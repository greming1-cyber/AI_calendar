"use client";

import { useSyncExternalStore } from "react";
import { todayIn } from "@/lib/date";
import type { ISODate } from "@/lib/types";
import { useTimezone } from "./use-profile";

// 1분마다 확인해 자정이 지나면 날짜가 바뀐다.
const subscribe = (cb: () => void) => {
  const id = setInterval(cb, 60_000);
  return () => clearInterval(id);
};

/**
 * 사용자 타임존(profiles.timezone) 기준 오늘(YYYY-MM-DD). `TODAY` 상수 대신 쓴다.
 * 서버 렌더에서는 ""를 돌려준다. 앱 화면은 AppShell이 브라우저에서만 그리므로 화면 코드에서는 항상 날짜가 들어 있다.
 */
export function useToday(): ISODate {
  const tz = useTimezone();
  return useSyncExternalStore(subscribe, () => todayIn(tz), () => "");
}
