"use client";

import { useMutation, useQuery, useQueryClient, type QueryClient } from "@tanstack/react-query";
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

let kickTimer: ReturnType<typeof setTimeout> | undefined;

/**
 * 일정을 저장·삭제한 뒤 구글에 바로 반영한다(GCAL-05). 연결된 계정이 있을 때만, 연달아 바뀌면 한 번만 부른다.
 * 실패해도 화면에는 알리지 않는다(15분 주기 동기화가 다시 처리한다).
 */
export function kickGoogleSync(qc: QueryClient) {
  clearTimeout(kickTimer);
  kickTimer = setTimeout(async () => {
    const status = await qc
      .fetchQuery<GoogleStatus>({ queryKey: googleKeys.status, queryFn: getGoogleStatus, staleTime: 60_000 })
      .catch(() => null);
    if (!status?.connected || status.reauthRequired) return;
    await syncGoogle("sync").catch(() => undefined);
    afterSync(qc);
  }, 1500);
}
