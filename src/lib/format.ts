export const won = (n: number) => `${n.toLocaleString("ko-KR")}원`;

export const signedWon = (n: number) => `${n > 0 ? "+" : n < 0 ? "-" : ""}${Math.abs(n).toLocaleString("ko-KR")}원`;

/** 32.8만 */
export const manwon = (n: number) => `${Number((n / 10000).toFixed(1))}만`;

export const pct = (part: number, whole: number) => (whole ? Math.round((part / whole) * 100) : 0);
