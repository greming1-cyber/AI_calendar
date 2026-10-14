// PRD 4.3 데이터 모델을 화면에서 쓰는 형태로 줄인 타입. Supabase 연결 시 테이블 컬럼과 맞춘다.

export type ISODate = string; // YYYY-MM-DD (사용자 타임존 기준)

export const REPEAT_OPTIONS = ["안 함", "매일", "매주", "매월", "매년"] as const;
export type Repeat = (typeof REPEAT_OPTIONS)[number];

export const REMINDER_OPTIONS = ["없음", "정시", "10분 전", "30분 전", "1시간 전", "하루 전"] as const;
export type Reminder = (typeof REMINDER_OPTIONS)[number];

export interface EventCategory {
  name: string;
  color: string;
}

export interface CalendarEvent {
  id: string;
  date: ISODate;
  allDay: boolean;
  start: string; // HH:mm, 종일이면 ""
  end: string; // HH:mm, 없으면 ""
  title: string;
  category: string;
  location: string;
  source: "local" | "google";
  repeat: Repeat;
  reminder: Reminder;
  memo: string;
}

export type EventInput = Omit<CalendarEvent, "id">;

export type Priority = "high" | "normal" | "low";

export interface Todo {
  id: string;
  title: string;
  dueDate: ISODate;
  priority: Priority;
  project: string;
  note: string; // 하위 체크리스트·연결 일정·반복 규칙 요약
  done: boolean;
}

export interface RecurringTodo {
  title: string;
  rule: string;
  next: ISODate;
}

export interface Transaction {
  id: string;
  date: ISODate;
  type: "income" | "expense";
  amount: number; // 원 단위 양수
  category: string;
  memo: string;
  method: "현금" | "카드" | "계좌";
  viaClaude: boolean; // MCP로 등록된 내역
}

export interface Budget {
  category: string;
  amount: number;
}

export interface RecurringTransaction {
  title: string;
  amount: number;
  date: ISODate;
}

export interface McpLog {
  tool: string;
  text: string;
  at: string;
}
