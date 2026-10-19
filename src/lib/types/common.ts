// 여러 도메인이 함께 쓰는 타입

export type ISODate = string; // YYYY-MM-DD (사용자 타임존 기준)

/** 날짜 구간. from·to 모두 포함 */
export interface DateRange {
  from: ISODate;
  to: ISODate;
}

/**
 * 날씨 기본 위치(profiles.weather_location). lat·lon은 지역 대표 좌표 또는 격자 중심이다.
 * 브라우저 현재 위치의 원본 좌표는 저장하지 않는다(WTH-01).
 */
export interface WeatherLocation {
  lat: number;
  lon: number;
  nx: number;
  ny: number;
  label: string;
  /** 중기 기온·육상 구역 코드(04 날씨). 없으면 서버가 격자에서 가장 가까운 구역을 고른다 */
  midTa?: string;
  midLand?: string;
}

/** profiles 행 + 로그인 이메일 */
export interface Profile {
  id: string;
  userId: string;
  email: string;
  name: string;
  timezone: string;
  weekStart: 0 | 1;
  theme: "light" | "dark" | "system";
  defaultView: "month" | "week" | "day";
  weatherLocation: WeatherLocation | null;
}

export interface McpLog {
  tool: string;
  text: string;
  at: string;
}
