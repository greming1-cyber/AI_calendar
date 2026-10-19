// 날씨 표시·판단 도우미(WTH-05~07). 화면과 알림(06)이 함께 쓴다.
import type { CalendarEvent, ISODate, PrecipType, Sky, WeatherDay } from "./types";

/** 비 예보 알림 기준 강수확률(%) */
export const RAIN_ALERT_CHANCE = 60;

/** 비 예보 알림 대상 야외 일정 카테고리 */
export const OUTDOOR_CATEGORIES = ["개인", "운동"];

/** 하늘·강수 한 줄 표시. 예: "구름많고 비" (Edge Function의 summaryOf와 같은 규칙) */
export function summaryOf(sky: Sky, precip: PrecipType): string {
  if (precip === "없음") return sky;
  if (sky === "맑음") return precip;
  return `${sky === "흐림" ? "흐리고" : "구름많고"} ${precip}`;
}

/** 지역 이름의 마지막 단위. 예: "서울특별시 마포구" → "마포구". "현재 위치(… 부근)"는 그대로 */
export const shortLabel = (label: string) => (label.includes("(") ? label : (label.split(" ").at(-1) ?? label));

/** 캘린더 날짜 칸 표시. 예: "18°", "비 15°" */
export function dayLabel(day: WeatherDay): string {
  const temp = day.high ?? day.low;
  const t = temp == null ? "" : `${Math.round(temp)}°`;
  if (day.precipType === "없음") return t || day.sky;
  return t ? `${day.precipType} ${t}` : day.precipType;
}

/** 최고/최저. 예: "21°/11°", 한쪽이 없으면 "-" */
export const highLow = (day: WeatherDay | null | undefined) =>
  day ? `${day.high == null ? "-" : Math.round(day.high)}°/${day.low == null ? "-" : Math.round(day.low)}°` : "-";

export interface RainAlert {
  date: ISODate;
  rainChance: number;
  summary: string;
  events: CalendarEvent[];
}

/**
 * WTH-07: 그날 비·눈 예보(강수확률 60% 이상)가 있고 야외 일정이 있으면 알림 내용을 돌려준다. 없으면 null.
 * 발송 시점(일정 전날 18시)과 실제 발송은 호출하는 쪽(06 알림)이 정한다.
 */
export function rainAlertsFor(
  date: ISODate,
  daily: WeatherDay[],
  events: CalendarEvent[],
  { threshold = RAIN_ALERT_CHANCE, categories = OUTDOOR_CATEGORIES }: { threshold?: number; categories?: string[] } = {},
): RainAlert | null {
  const day = daily.find((d) => d.date === date);
  if (!day || day.rainChance < threshold) return null;
  const outdoor = events.filter((e) => e.date <= date && e.endDate >= date && categories.includes(e.category));
  if (!outdoor.length) return null;
  return { date, rainChance: day.rainChance, summary: day.summary, events: outdoor };
}
