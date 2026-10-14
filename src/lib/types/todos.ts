import type { ISODate } from "./common";

export type Priority = "high" | "normal" | "low";

export interface Todo {
  id: string;
  title: string;
  dueDate: ISODate | null; // 마감 없음이면 null
  priority: Priority;
  project: string; // 프로젝트 이름, 없으면 ""
  projectId: string | null;
  note: string; // memo
  done: boolean;
  rrule: string | null; // 반복 할일이면 RRULE 본문
  parentId: string | null; // 서브태스크면 상위 할일 id
  // ── 02에서 추가(선택). listTodos가 항상 채운다 ──
  dueTime?: string; // 마감 시각 HH:mm(사용자 타임존), 없으면 ""
  eventId?: string | null; // 연결 일정(TODO-08)
  completedAt?: string | null;
  createdAt?: string;
  subtaskCount?: number; // 상위 할일의 서브태스크 수
  subtaskDone?: number;
}

/** 할일 등록·수정 입력. TodoModal의 initial 타입 */
export interface TodoInput {
  title: string;
  dueDate: ISODate | null;
  dueTime: string; // HH:mm, 시각 없음이면 ""
  priority: Priority;
  projectId: string | null;
  note: string;
  rrule: string | null;
  eventId: string | null;
  parentId: string | null;
}

export interface Project {
  id: string;
  name: string;
  color: string | null;
}

/** listTodos/useTodos 필터. 기본값은 상위 할일(parentId: null) 전체 */
export interface TodoFilter {
  status?: "open" | "done" | "all";
  /** null이면 상위 할일만, 문자열이면 그 할일의 서브태스크만, undefined면 모두 */
  parentId?: string | null;
  /** 마감일 범위(포함). 마감 없는 할일은 빠진다 */
  dueFrom?: ISODate;
  dueTo?: ISODate;
  projectId?: string;
}

/** complete_todo 결과. next는 반복 할일의 새 회차 */
export interface CompleteTodoResult {
  todo: Todo;
  next: Todo | null;
}
