"use client";

import { useCallback, useSyncExternalStore } from "react";

// 브라우저별 편의 설정(배경 사진 등)만 저장한다. 실패해도 화면은 기본값으로 동작한다.
const EVENT = "lm-local-storage";

const read = (key: string) => {
  try {
    return localStorage.getItem(key) ?? "";
  } catch {
    return "";
  }
};

const subscribe = (cb: () => void) => {
  window.addEventListener("storage", cb);
  window.addEventListener(EVENT, cb);
  return () => {
    window.removeEventListener("storage", cb);
    window.removeEventListener(EVENT, cb);
  };
};

export function useLocalStorage(key: string) {
  const value = useSyncExternalStore(subscribe, () => read(key), () => "");

  const set = useCallback(
    (next: string) => {
      try {
        if (next) localStorage.setItem(key, next);
        else localStorage.removeItem(key);
      } catch {
        // 저장 공간 초과·차단 시 무시
      }
      window.dispatchEvent(new Event(EVENT));
    },
    [key],
  );

  return [value, set] as const;
}
