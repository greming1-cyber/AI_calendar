export const won = (n: number) => `${n.toLocaleString("ko-KR")}원`;

export const signedWon = (n: number) => `${n > 0 ? "+" : n < 0 ? "-" : ""}${Math.abs(n).toLocaleString("ko-KR")}원`;

/** 32.8만 */
export const manwon = (n: number) => `${Number((n / 10000).toFixed(1))}만`;

export const pct = (part: number, whole: number) => (whole ? Math.round((part / whole) * 100) : 0);

/** "방금", "3분 전", "2시간 전", "4일 전". 시각이 없으면 "아직 안 함" */
export function timeAgo(iso: string | null, now = Date.now()) {
  if (!iso) return "아직 안 함";
  const min = Math.floor((now - Date.parse(iso)) / 60_000);
  if (min < 1) return "방금";
  if (min < 60) return `${min}분 전`;
  if (min < 60 * 24) return `${Math.floor(min / 60)}시간 전`;
  return `${Math.floor(min / 1440)}일 전`;
}
