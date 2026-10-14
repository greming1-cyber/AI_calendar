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
}
