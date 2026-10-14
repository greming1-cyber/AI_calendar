import type { ISODate } from "./common";

export const REPEAT_OPTIONS = ["안 함", "매일", "매주", "매월", "매년"] as const;
export type Repeat = (typeof REPEAT_OPTIONS)[number];

export const REMINDER_OPTIONS = ["없음", "정시", "10분 전", "30분 전", "1시간 전", "하루 전"] as const;
export type Reminder = (typeof REMINDER_OPTIONS)[number];

/** 반복 일정 수정·삭제 범위(EVT-03): 이 일정만 / 이후 모두 / 전체 */
export type RecurrenceScope = "this" | "following" | "all";

export interface EventCategory {
  id: string;
  name: string;
  color: string;
}

/**
 * 화면용 일정. DB의 start_at/end_at(timestamptz)을 사용자 타임존의 날짜·시각으로 나눠 담는다.
 * 반복 일정을 펼친 회차는 id가 `"<원본id>:<회차 날짜>"`이고 seriesId가 원본 id다.
 */
export interface CalendarEvent {
  id: string;
  date: ISODate;
  /** 마지막 날(포함). 하루짜리면 date와 같다 */
  endDate: ISODate;
  allDay: boolean;
  start: string; // HH:mm, 종일이면 ""
  end: string; // HH:mm, 없으면 ""
  title: string;
  category: string; // 카테고리 이름, 없으면 ""
  location: string;
  source: "local" | "google";
  repeat: Repeat;
  /** RRULE 본문. 반복 원본·회차에만 있다 */
  rrule: string | null;
  reminder: Reminder;
  memo: string;
  /** 반복 시리즈의 원본 id. 펼친 회차와 예외 일정(이 일정만 수정)에 있다 */
  seriesId: string | null;
  /** 예외 일정이 대체하는 원래 회차 날짜, 펼친 회차는 그 회차 날짜 */
  occurrenceDate: ISODate | null;
}

/** 등록·수정 입력. endDate·rrule을 생략하면 하루짜리, repeat에서 만든 규칙으로 저장한다 */
export type EventInput = Omit<CalendarEvent, "id" | "endDate" | "rrule" | "seriesId" | "occurrenceDate"> & {
  endDate?: ISODate;
  rrule?: string | null;
};
