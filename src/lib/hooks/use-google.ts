"use client";

import { useMutation, useQuery, useQueryClient, type QueryClient } from "@tanstack/react-query";
import { useEffect, useSyncExternalStore } from "react";
import {
  disconnectGoogle,
  getGoogleStatus,
  listGoogleCalendars,
  syncGoogle,
  updateGoogleCalendar,
} from "@/lib/data/google";
import type { GoogleStatus, GoogleSyncDirection } from "@/lib/types";

export const googleKeys = {
  all: ["google"] as const,
  status: ["google", "status"] as const,
  calendars: ["google", "calendars"] as const,
};

/** 연결 여부·마지막 동기화·재연결 필요(GCAL-10). 홈과 설정 탭이 쓴다 */
export function useGoogleStatus() {
  return useQuery({ queryKey: googleKeys.status, queryFn: getGoogleStatus, staleTime: 60_000 });
}

/** 동기화 대상 캘린더 목록(GCAL-02, 06) */
export function useGoogleCalendars() {
  return useQuery({ queryKey: googleKeys.calendars, queryFn: listGoogleCalendars, staleTime: 60_000 });
}

const afterSync = (qc: QueryClient) => {
  qc.invalidateQueries({ queryKey: googleKeys.all });
  qc.invalidateQueries({ queryKey: ["events"] });
};

/** "지금 동기화" */
export function useSyncGoogle() {
  const qc = useQueryClient();
  return useMutation({ mutationFn: (action: "sync" | "calendars" = "sync") => syncGoogle(action), onSettled: () => afterSync(qc) });
}

export function useUpdateGoogleCalendar() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, ...patch }: { id: string; enabled?: boolean; direction?: GoogleSyncDirection }) => updateGoogleCalendar(id, patch),
    onSettled: () => afterSync(qc),
  });
}

export function useDisconnectGoogle() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ accountId, keepEvents }: { accountId: string; keepEvents: boolean }) => disconnectGoogle(accountId, keepEvents),
    onSettled: () => afterSync(qc),
  });
}

// ── 화면에서 부르는 동기화(저장 직후·자동) ─────────────────
// 한 탭 안에서는 동기화를 한 번에 하나만 돌린다(모듈 수준 진행 중 표시). 다른 탭과 겹치면 서버의 2분 잠금이 막는다.

let inFlight: Promise<void> | null = null;
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((l) => l());
const subscribe = (l: () => void) => {
  listeners.add(l);
  return () => {
    listeners.delete(l);
  };
};

/** 동기화를 한 번 돌린다. 이미 돌고 있으면 그 작업을 함께 기다린다. 실패는 조용히 넘긴다 */
function runSync(qc: QueryClient): Promise<void> {
  inFlight ??= syncGoogle("sync")
    .then(
      () => undefined,
      () => undefined,
    )
    .finally(() => {
      inFlight = null;
      afterSync(qc);
      emit();
    });
  emit();
  return inFlight;
}

const fetchStatus = (qc: QueryClient, staleTime: number) =>
  qc.fetchQuery<GoogleStatus>({ queryKey: googleKeys.status, queryFn: getGoogleStatus, staleTime }).catch(() => null);

let kickTimer: ReturnType<typeof setTimeout> | undefined;

/**
 * 일정을 저장·삭제한 뒤 구글에 바로 반영한다(GCAL-05). 연결된 계정이 있을 때만, 연달아 바뀌면 한 번만 부른다.
 * 자동 동기화가 돌고 있으면 그 동기화는 방금 바꾼 일정을 놓쳤을 수 있으므로, 끝나기를 기다렸다가 한 번 더 돌린다.
 * 실패해도 화면에는 알리지 않는다(15분 주기 동기화가 다시 처리한다).
 */
export function kickGoogleSync(qc: QueryClient) {
  clearTimeout(kickTimer);
  kickTimer = setTimeout(async () => {
    const status = await fetchStatus(qc, 60_000);
    if (!status?.connected || status.reauthRequired) return;
    if (inFlight) await inFlight;
    await runSync(qc);
  }, 1500);
}

/** 마지막 동기화가 이보다 오래됐을 때만 자동 동기화한다 */
const AUTO_SYNC_AFTER = 2 * 60_000;
/** 화면이 열려 있는 동안 조건을 다시 보는 간격 */
const AUTO_SYNC_EVERY = 5 * 60_000;
let checking = false;
let lastCheck = 0;

/** 조건(연결됨·재연결 필요 아님·마지막 동기화 2분 경과)을 보고 맞으면 동기화한다 */
async function autoSync(qc: QueryClient) {
  // focus·visibilitychange가 함께 오거나 여러 화면이 동시에 불러도 한 번만 확인한다.
  if (inFlight || checking || Date.now() - lastCheck < 10_000) return;
  checking = true;
  lastCheck = Date.now();
  try {
    // 다른 탭·주기 동기화가 방금 했을 수 있어 30초 넘은 상태는 다시 읽는다.
    const status = await fetchStatus(qc, 30_000);
    if (!status?.connected || status.reauthRequired) return;
    if (status.lastSyncedAt && Date.now() - Date.parse(status.lastSyncedAt) < AUTO_SYNC_AFTER) return;
    if (!inFlight) await runSync(qc);
  } finally {
    checking = false;
  }
}

/** 이 탭에서 구글 동기화가 도는 중인지(화면의 "동기화 중…" 표시용) */
export function useGoogleSyncing() {
  return useSyncExternalStore(
    subscribe,
    () => inFlight !== null,
    () => false,
  );
}

/**
 * 캘린더·홈을 열 때 구글 일정을 자동으로 가져온다. 화면 진입 시, 탭이 다시 보일 때, 열려 있는 동안 5분마다
 * 조건을 보고 마지막 동기화가 2분 넘게 지났으면 동기화한다. 숨은 탭에서는 하지 않는다. 동기화 중 여부를 돌려준다.
 */
export function useAutoGoogleSync() {
  const qc = useQueryClient();
  useEffect(() => {
    const check = () => {
      if (document.visibilityState === "visible") void autoSync(qc);
    };
    check();
    document.addEventListener("visibilitychange", check);
    window.addEventListener("focus", check);
    const timer = setInterval(check, AUTO_SYNC_EVERY);
    return () => {
      document.removeEventListener("visibilitychange", check);
      window.removeEventListener("focus", check);
      clearInterval(timer);
    };
  }, [qc]);
  return useGoogleSyncing();
}
