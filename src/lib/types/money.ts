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
}
