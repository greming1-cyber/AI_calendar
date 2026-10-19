// 구글 캘린더 연동 데이터 계층(GCAL-01~04, 10). 토큰 컬럼은 클라이언트가 읽을 수 없다(0001_init.sql 컬럼 권한).
import { createClient } from "@/lib/supabase/client";
import type { GoogleCalendar, GoogleStatus, GoogleSyncDirection } from "@/lib/types";

export async function getGoogleStatus(): Promise<GoogleStatus> {
  const { data, error } = await createClient()
    .from("google_accounts")
    .select("id, google_email, status, last_synced_at, last_error")
    .neq("status", "revoked")
    .order("created_at");
  if (error) throw error;
  const accounts = data.map((a) => ({
    id: a.id,
    email: a.google_email,
    status: a.status as GoogleStatus["accounts"][number]["status"],
    lastSyncedAt: a.last_synced_at,
    lastError: a.last_error,
  }));
  const times = accounts.map((a) => a.lastSyncedAt).filter((t): t is string => Boolean(t));
  return {
    connected: accounts.length > 0,
    reauthRequired: accounts.some((a) => a.status === "reauth_required"),
    lastSyncedAt: times.sort().at(-1) ?? null,
    accounts,
  };
}

export async function listGoogleCalendars(): Promise<GoogleCalendar[]> {
  const { data, error } = await createClient()
    .from("google_calendars")
    .select("id, google_account_id, name, color, enabled, sync_direction, is_primary, access_role, last_synced_at")
    .order("is_primary", { ascending: false })
    .order("name");
  if (error) throw error;
  return data.map((c) => ({
    id: c.id,
    accountId: c.google_account_id,
    name: c.name,
    color: c.color,
    enabled: c.enabled,
    direction: c.sync_direction as GoogleSyncDirection,
    isPrimary: c.is_primary,
    writable: c.access_role === "owner" || c.access_role === "writer",
    lastSyncedAt: c.last_synced_at,
  }));
}

/**
 * 캘린더 동기화 켜기/끄기·방향(GCAL-02, 03).
 * 끄면 그 캘린더에서 가져온 일정(아직 내보내지 않은 변경 제외)을 지우고, 다시 켜면 처음부터 받도록 sync_token을 비운다.
 */
export async function updateGoogleCalendar(id: string, patch: { enabled?: boolean; direction?: GoogleSyncDirection }) {
  const supabase = createClient();
  const { error } = await supabase
    .from("google_calendars")
    .update({
      ...(patch.enabled !== undefined ? { enabled: patch.enabled } : {}),
      ...(patch.direction ? { sync_direction: patch.direction } : {}),
      ...(patch.enabled === false || patch.direction === "export" ? { sync_token: null } : {}),
    })
    .eq("id", id);
  if (error) throw error;
  if (patch.enabled === false) {
    const { error: e } = await supabase.from("events").delete().eq("google_calendar_id", id).eq("google_dirty", false);
    if (e) throw e;
  }
}

export interface GoogleSyncResult {
  ok: boolean;
  results?: { email: string; exported?: number; imported?: number; deleted?: number; conflicts?: number; error?: string; reauth?: boolean }[];
}

/** "지금 동기화"(GCAL-04). Edge Function gcal-sync를 사용자 JWT로 부른다 */
export async function syncGoogle(action: "sync" | "calendars" = "sync"): Promise<GoogleSyncResult> {
  const { data, error } = await createClient().functions.invoke<GoogleSyncResult>("gcal-sync", { body: { action } });
  if (error) throw error;
  return data ?? { ok: false };
}

export async function disconnectGoogle(accountId: string, keepEvents: boolean) {
  const res = await fetch("/api/google/disconnect", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ accountId, keepEvents }),
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok || !body.ok) throw new Error(body.message ?? "연결 해제에 실패했어요.");
}
