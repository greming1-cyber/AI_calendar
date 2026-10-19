export type GoogleSyncDirection = "import" | "export" | "both";

export interface GoogleAccount {
  id: string;
  email: string;
  status: "active" | "reauth_required" | "revoked";
  lastSyncedAt: string | null;
  lastError: string | null;
}

/** useGoogleStatus(): 홈 "Google 동기화 · n분 전"과 설정 탭용 */
export interface GoogleStatus {
  connected: boolean;
  /** 다시 연결이 필요한 계정이 있다(GCAL-10) */
  reauthRequired: boolean;
  /** 계정들 중 가장 최근 동기화 시각 */
  lastSyncedAt: string | null;
  accounts: GoogleAccount[];
}

export interface GoogleCalendar {
  id: string;
  accountId: string;
  name: string;
  color: string | null;
  enabled: boolean;
  direction: GoogleSyncDirection;
  isPrimary: boolean;
  /** 쓰기 권한이 있어 내보낼 수 있다 */
  writable: boolean;
  lastSyncedAt: string | null;
}
