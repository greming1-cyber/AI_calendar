// 여러 도메인이 함께 쓰는 타입

export type ISODate = string; // YYYY-MM-DD (사용자 타임존 기준)

/** 날짜 구간. from·to 모두 포함 */
export interface DateRange {
  from: ISODate;
  to: ISODate;
}

export interface WeatherLocation {
  lat: number;
  lon: number;
  nx: number;
  ny: number;
  label: string;
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
