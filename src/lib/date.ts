import type { ISODate } from "./types";

export const WEEKDAYS = ["일", "월", "화", "수", "목", "금", "토"] as const;

// 날짜 계산은 UTC 기준으로 해서 브라우저 타임존 영향을 받지 않게 한다.
const toDate = (iso: ISODate) => {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d));
};

const fromDate = (dt: Date): ISODate => dt.toISOString().slice(0, 10);

export const isoDate = (y: number, m: number, d: number): ISODate =>
  fromDate(new Date(Date.UTC(y, m - 1, d)));

export const addDays = (iso: ISODate, n: number): ISODate => {
  const dt = toDate(iso);
  dt.setUTCDate(dt.getUTCDate() + n);
  return fromDate(dt);
};

export const parts = (iso: ISODate) => {
  const dt = toDate(iso);
  return { y: dt.getUTCFullYear(), m: dt.getUTCMonth() + 1, d: dt.getUTCDate(), dow: dt.getUTCDay() };
};

export const weekday = (iso: ISODate) => WEEKDAYS[parts(iso).dow];

/** 10월 14일 수요일 */
export const longLabel = (iso: ISODate) => {
  const { m, d } = parts(iso);
  return `${m}월 ${d}일 ${weekday(iso)}요일`;
};

/** 10/14 */
export const shortLabel = (iso: ISODate) => {
  const { m, d } = parts(iso);
  return `${m}/${d}`;
};

/** 일요일 시작 월 달력 칸. 앞뒤 달 날짜를 포함해 7의 배수로 채운다. */
export const monthGrid = (y: number, m: number) => {
  const first = isoDate(y, m, 1);
  const lead = parts(first).dow;
  const days = parts(isoDate(y, m + 1, 0)).d;
  const total = Math.ceil((lead + days) / 7) * 7;
  return Array.from({ length: total }, (_, i) => {
    const date = addDays(first, i - lead);
    return { date, inMonth: parts(date).m === m };
  });
};

export const shiftMonth = (y: number, m: number, n: number) => {
  const { y: ny, m: nm } = parts(isoDate(y, m + n, 1));
  return { y: ny, m: nm };
};
