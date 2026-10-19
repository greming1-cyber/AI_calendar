// 아직 실데이터가 없는 영역(날씨·구글 연동)의 예시 데이터.
// 일정·할일·가계부는 Supabase에서 읽는다(시안 데이터는 DB 함수 seed_demo로 채운다).
// TODO(04): 날씨 예시 제거  TODO(06): 이 파일 삭제
import { addDays } from "./date";
import type { ISODate } from "./types";

export const PROFILE = {
  region: "서울특별시 마포구",
  regionShort: "마포구",
};

// 오늘부터 10일치 예보 [표시, 강수확률]
const FORECAST: [string, number][] = [
  ["18°", 10],
  ["19°", 10],
  ["17°", 20],
  ["비 15°", 70],
  ["16°", 30],
  ["17°", 10],
  ["18°", 10],
  ["16°", 20],
  ["14°", 30],
  ["15°", 20],
];

/** 캘린더 날짜 칸에 표시할 예보 (예보 가능 기간만) */
export const dailyWeather = (today: ISODate): Record<ISODate, { label: string; rainChance: number }> =>
  Object.fromEntries(FORECAST.map(([label, rainChance], i) => [addDays(today, i), { label, rainChance }]));

/** 비 예보 알림을 띄울 야외 일정 카테고리 */
export const OUTDOOR_CATEGORIES = ["개인", "운동"];

export const CURRENT_WEATHER = {
  temp: 18,
  condition: "맑음",
  high: 21,
  low: 11,
  rainChance: 10,
  hourly: [
    { time: "09", temp: 14 },
    { time: "12", temp: 18 },
    { time: "15", temp: 20 },
    { time: "18", temp: 17 },
    { time: "21", temp: 14 },
    { time: "00", temp: 12 },
  ],
};
