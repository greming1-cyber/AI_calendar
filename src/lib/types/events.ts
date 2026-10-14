import type { ISODate } from "./common";

export const REPEAT_OPTIONS = ["안 함", "매일", "매주", "매월", "매년"] as const;
export type Repeat = (typeof REPEAT_OPTIONS)[number];

export const REMINDER_OPTIONS = ["없음", "정시", "10분 전", "30분 전", "1시간 전", "하루 전"] as const;
export type Reminder = (typeof REMINDER_OPTIONS)[number];

export interface EventCategory {
  id: string;
  name: string;
  color: string;
}

/** 화면용 일정. DB의 start_at/end_at(timestamptz)을 사용자 타임존의 날짜·시각으로 나눠 담는다. */
export interface CalendarEvent {
  id: string;
  date: ISODate;
  allDay: boolean;
  start: string; // HH:mm, 종일이면 ""
  end: string; // HH:mm, 없으면 ""
  title: string;
  category: string; // 카테고리 이름, 없으면 ""
  location: string;
  source: "local" | "google";
  repeat: Repeat;
  reminder: Reminder;
  memo: string;
}

export type EventInput = Omit<CalendarEvent, "id">;
