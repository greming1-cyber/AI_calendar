import type { ISODate } from "./common";

// 날씨 표준 응답(WTH-02~05). Edge Function `weather`가 돌려주는 형태와 같다.
// supabase/functions/_shared/kma.ts에 같은 정의가 있다. 한쪽을 바꾸면 다른 쪽도 고친다.

export type Sky = "맑음" | "구름많음" | "흐림";
export type PrecipType = "없음" | "비" | "비/눈" | "눈" | "소나기";

/** 현재 날씨(초단기실황 + 그 시각 단기예보 하늘). 기온 °C, 풍속 m/s, 습도 % */
export interface WeatherCurrent {
  temp: number;
  feelsLike: number;
  sky: Sky;
  precipType: PrecipType;
  humidity: number;
  wind: number;
  /** 1시간 강수량(mm) */
  rain1h: number;
  /** 관측 시각(ISO 8601) */
  observedAt: string;
}

/** 시간별 예보(단기예보, 오늘~최대 4일 뒤) */
export interface WeatherHour {
  /** 한국 시각 "YYYY-MM-DDTHH:00" */
  time: string;
  date: ISODate;
  /** "HH" */
  hour: string;
  temp: number;
  sky: Sky;
  precipType: PrecipType;
  rainChance: number;
}

/** 일별 예보. 가까운 날은 단기예보, 그 뒤(최대 10일)는 중기예보로 채운다 */
export interface WeatherDay {
  date: ISODate;
  high: number | null;
  low: number | null;
  sky: Sky;
  precipType: PrecipType;
  rainChance: number;
  /** 하늘·강수 한 줄 표시(예: "구름많고 비") */
  summary: string;
  source: "short" | "mid";
}

export interface WeatherReport {
  /** 가장 최근 발표 시각(ISO 8601) */
  updatedAt: string | null;
  location: { nx: number; ny: number; label: string; isDefault: boolean };
  current: WeatherCurrent | null;
  hourly: WeatherHour[];
  daily: WeatherDay[];
  /** 기상청 호출이 실패해 만료된 캐시를 보여 주는 중 */
  stale: boolean;
  /** 받지 못한 부분(예: ["mid"]). 앱은 나머지로 그린다 */
  missing: ("now" | "short" | "mid")[];
}
