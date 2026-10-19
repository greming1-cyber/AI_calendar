import type { ISODate } from "./common";

export type TxType = "income" | "expense";

export interface Transaction {
  id: string;
  date: ISODate;
  type: TxType;
  amount: number; // 원 단위 양수
  category: string; // 분류 이름, 없으면 ""
  categoryId: string | null;
  memo: string;
  method: string; // 결제수단 이름, 없으면 ""
  paymentMethodId: string | null;
  viaClaude: boolean; // MCP로 등록된 내역
  /** 고정지출에서 자동 생성된 내역이면 그 고정지출 id */
  recurringId?: string | null;
  /** 연결 일정(events 행 id, TX-09) */
  eventId?: string | null;
}

/** 내역 등록·수정 입력(TX-01) */
export interface TransactionInput {
  type: TxType;
  amount: number;
  date: ISODate;
  categoryId: string | null;
  paymentMethodId: string | null;
  memo: string;
  eventId: string | null;
}

/** 내역 필터(TX-03). 비어 있는 항목은 조건 없음 */
export interface TxFilter {
  type?: TxType | null;
  categoryIds?: string[];
  paymentMethodIds?: string[];
  keyword?: string;
}

export interface TxCategory {
  id: string;
  type: TxType;
  name: string;
  color: string | null;
}

export interface PaymentMethod {
  id: string;
  type: "cash" | "card" | "account";
  name: string;
}

/** 월 예산. category가 null이면 월 전체 예산 */
export interface Budget {
  category: string | null;
  amount: number;
  categoryId?: string | null;
}

/** 고정지출·고정수입 (매월 dayOfMonth일) */
export interface RecurringTransaction {
  id: string;
  type: TxType;
  title: string; // memo
  amount: number;
  dayOfMonth: number;
  category: string;
  active: boolean;
  categoryId?: string | null;
  paymentMethodId?: string | null;
  method?: string;
}

export interface RecurringInput {
  type: TxType;
  title: string;
  amount: number;
  dayOfMonth: number;
  categoryId: string | null;
  paymentMethodId: string | null;
  active: boolean;
}
