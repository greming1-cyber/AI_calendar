// 도구 19개 정의(PRD 4.4). 실행은 모두 mcp-api로 그대로 전달한다.
// 설명은 Claude가 도구를 정확히 고르도록 언제 쓰는지, 날짜 형식, 금액 단위를 적는다.
import { z } from "zod";

const DATE = "YYYY-MM-DD (absolute date in the user's timezone; resolve '내일', '이번 주 금요일' yourself using `now` from the previous response)";
const DATETIME =
  "ISO 8601. 'YYYY-MM-DD' = 종일(all-day), 'YYYY-MM-DDTHH:mm' = 사용자 타임존 기준 시각. Never send relative words like 'tomorrow'.";

const date = (desc = DATE) => z.string().describe(desc);
const id = (what: string) => z.string().describe(`${what} id. 목록·검색 도구가 돌려준 id를 그대로 쓴다 (copy the id exactly as returned).`);
const scope = z
  .enum(["this", "following", "all"])
  .optional()
  .describe("반복 일정일 때 범위: this=이 회차만, following=이 회차부터 이후 모두, all=전체. 회차 id(…:YYYY-MM-DD)면 기본 this, 원본 id면 기본 all.");
const confirm = z
  .boolean()
  .optional()
  .describe("true일 때만 실제로 삭제한다. 생략하면 삭제 대상 요약만 돌려준다. Show the summary to the user and get explicit confirmation before calling again with confirm: true.");
const priority = z.enum(["high", "normal", "low"]).describe("우선순위: high(높음), normal(보통), low(낮음)");
const amount = z.number().int().positive().describe("금액, 원(KRW) 단위 정수. 예: 4,500원 → 4500");

export interface ToolDef {
  name: string;
  title: string;
  description: string;
  input: z.ZodRawShape;
  readOnly?: boolean;
  destructive?: boolean;
}

export const TOOLS: ToolDef[] = [
  // ── 공통 ──
  {
    name: "get_today_summary",
    title: "오늘 요약",
    description:
      "하루 요약: 그날 일정, 밀린·오늘 마감 할일, 그날·이번 달 지출, 예산 사용률. '오늘 뭐 있어?', '오늘 하루 정리해줘'처럼 전반적인 질문에 먼저 쓴다. Overview of a day across calendar, todos and spending.",
    input: { date: date(`${DATE}. 생략하면 오늘.`).optional() },
    readOnly: true,
  },
  {
    name: "search",
    title: "통합 검색",
    description: "일정·할일·가계부 내역을 키워드로 찾는다. id를 모를 때(예: '치과 일정 지워줘') 대상을 찾는 데 쓴다. Keyword search across events, todos and transactions.",
    input: {
      query: z.string().describe("검색어 (제목·메모·장소·분류명)"),
      types: z.array(z.enum(["events", "todos", "transactions"])).optional().describe("찾을 유형. 생략하면 전부"),
      limit: z.number().int().min(1).max(100).optional().describe("유형별 최대 개수, 기본 20"),
    },
    readOnly: true,
  },
  {
    name: "get_weather",
    title: "날씨",
    description: "현재 날씨나 특정 날짜 예보. (현재 준비 중이라 오류를 돌려준다.) Weather for the user's saved location.",
    input: {
      date: date(`${DATE}. 생략하면 현재 날씨.`).optional(),
      location: z.string().optional().describe("지역 이름. 생략하면 설정한 위치"),
    },
    readOnly: true,
  },

  // ── 일정 ──
  {
    name: "list_events",
    title: "일정 조회",
    description:
      "기간 안의 일정 목록. 반복 일정은 회차별로 펼쳐서 준다(회차 id는 '<원본id>:YYYY-MM-DD'). '이번 주 일정', '내일 약속 있어?'에 쓴다. List calendar events in a date range (recurring events expanded).",
    input: {
      from: date(`시작일 ${DATE}`),
      to: date(`종료일(포함) ${DATE}. 최대 366일`),
      category: z.string().optional().describe("일정 카테고리 이름(예: 업무, 개인, 가족, 운동)"),
      query: z.string().optional().describe("제목·장소·메모에 들어간 글자"),
      limit: z.number().int().min(1).max(500).optional(),
    },
    readOnly: true,
  },
  {
    name: "create_event",
    title: "일정 등록",
    description:
      "새 일정을 만든다. '내일 오후 3시에 치과 예약 넣어줘' → start='YYYY-MM-DDT15:00'. 시각 없이 날짜만 주면 종일 일정. Create a calendar event.",
    input: {
      title: z.string().describe("제목"),
      start: z.string().describe(`시작. ${DATETIME}`),
      end: z.string().optional().describe(`끝. ${DATETIME} 생략하면 끝 시각 없음(종일이면 하루). 여러 날 종일 일정은 마지막 날 날짜`),
      all_day: z.boolean().optional().describe("종일 일정이면 true"),
      location: z.string().optional().describe("장소"),
      memo: z.string().optional().describe("메모"),
      category: z.string().optional().describe("일정 카테고리 이름. 없는 이름이면 만들지 않고 후보를 돌려준다"),
      rrule: z.string().optional().describe("반복 규칙 RFC 5545 RRULE 본문. 예: 'FREQ=WEEKLY;BYDAY=TU,TH', 'FREQ=MONTHLY;COUNT=6'"),
      calendar: z.string().optional().describe("'local'(기본, 내 캘린더) 또는 연결된 구글 캘린더 이름"),
      reminder_minutes: z.number().int().min(0).optional().describe("몇 분 전에 알림. 생략하면 알림 없음"),
    },
  },
  {
    name: "update_event",
    title: "일정 수정",
    description: "일정의 제목·시간·장소 등을 바꾼다. 보낸 필드만 바뀐다. 반복 일정은 scope로 범위를 정한다. Update an event; only provided fields change.",
    input: {
      id: id("일정(또는 반복 회차)"),
      title: z.string().optional(),
      start: z.string().optional().describe(`새 시작. ${DATETIME}`),
      end: z.string().optional().describe(`새 끝. ${DATETIME}`),
      all_day: z.boolean().optional(),
      location: z.string().optional(),
      memo: z.string().optional(),
      category: z.string().nullable().optional().describe("카테고리 이름. null이면 분류 없음"),
      rrule: z.string().nullable().optional().describe("반복 규칙. null이면 반복 해제"),
      reminder_minutes: z.number().int().min(0).nullable().optional(),
      scope,
    },
  },
  {
    name: "delete_event",
    title: "일정 삭제",
    description:
      "일정을 지운다. 반드시 먼저 confirm 없이 호출해 대상 요약을 사용자에게 보여 주고, 사용자가 확인하면 confirm: true로 다시 호출한다. Delete an event (two-step: preview, then confirm).",
    input: { id: id("일정(또는 반복 회차)"), scope, confirm },
    destructive: true,
  },
  {
    name: "find_free_time",
    title: "빈 시간 찾기",
    description: "기간 안에서 일정이 없는 시간대를 찾는다. '이번 주에 1시간 비는 때 있어?'에 쓴다. Find free slots of at least duration_minutes within work hours.",
    input: {
      from: date(`시작일 ${DATE}`),
      to: date(`종료일(포함) ${DATE}. 최대 31일`),
      duration_minutes: z.number().int().min(5).describe("필요한 시간(분)"),
      work_hours: z.string().optional().describe("찾을 시간대. 예: '09-18'(기본), '10:00-22:00'"),
      skip_weekends: z.boolean().optional().describe("주말 제외"),
    },
    readOnly: true,
  },

  // ── 할일 ──
  {
    name: "list_todos",
    title: "할일 조회",
    description:
      "할일 목록. '이번 주 마감 할일' → status='open', due_before=그 주 마지막 날. 밀린 할일 수(overdue)도 준다. List todos (top-level; checklist progress included).",
    input: {
      status: z.enum(["open", "done", "all"]).optional().describe("open=미완료(기본), done=완료, all=전체"),
      due_before: date(`이 날짜까지 마감(포함). ${DATE}`).optional(),
      due_after: date(`이 날짜부터 마감(포함). ${DATE}`).optional(),
      project: z.string().optional().describe("프로젝트 이름(예: 업무, 개인, 가족)"),
      priority: priority.optional(),
      query: z.string().optional().describe("제목·메모 검색어"),
      limit: z.number().int().min(1).max(500).optional(),
    },
    readOnly: true,
  },
  {
    name: "create_todo",
    title: "할일 등록",
    description: "새 할일을 만든다. Create a todo.",
    input: {
      title: z.string().describe("제목"),
      due: z.string().optional().describe(`마감. ${DATETIME}`),
      priority: priority.optional().describe("기본 normal"),
      project: z.string().optional().describe("프로젝트 이름. 없는 이름이면 만들지 않고 후보를 돌려준다"),
      memo: z.string().optional(),
      rrule: z.string().optional().describe("반복 규칙(RRULE 본문). 예: 'FREQ=WEEKLY;BYDAY=FR'. due가 필요하다"),
      subtasks: z.array(z.string()).optional().describe("체크리스트 항목 제목들"),
    },
  },
  {
    name: "update_todo",
    title: "할일 수정",
    description: "할일의 제목·마감·우선순위·프로젝트·메모를 바꾼다. 보낸 필드만 바뀐다. 완료 처리는 complete_todo를 쓴다. Update a todo.",
    input: {
      id: id("할일"),
      title: z.string().optional(),
      due: z.string().nullable().optional().describe(`새 마감. ${DATETIME} null이면 마감 없음`),
      priority: priority.optional(),
      project: z.string().nullable().optional().describe("프로젝트 이름. null이면 프로젝트 없음"),
      memo: z.string().optional(),
      rrule: z.string().nullable().optional().describe("반복 규칙. null이면 반복 해제"),
    },
  },
  {
    name: "complete_todo",
    title: "할일 완료",
    description: "할일을 완료(또는 done=false로 완료 취소)한다. 반복 할일이면 다음 회차가 자동으로 생긴다. Mark a todo done/undone.",
    input: { id: id("할일"), done: z.boolean().optional().describe("기본 true. false면 완료 취소") },
  },
  {
    name: "delete_todo",
    title: "할일 삭제",
    description: "할일(과 체크리스트)을 지운다. 먼저 confirm 없이 호출해 대상을 보여 주고, 사용자가 확인하면 confirm: true로 다시 호출한다. Delete a todo (two-step).",
    input: { id: id("할일"), confirm },
    destructive: true,
  },

  // ── 가계부 ──
  {
    name: "list_transactions",
    title: "가계부 내역 조회",
    description: "기간 안의 수입·지출 내역과 합계(원). List income/expense transactions with totals (KRW).",
    input: {
      from: date(`시작일 ${DATE}`),
      to: date(`종료일(포함) ${DATE}`),
      type: z.enum(["income", "expense"]).optional().describe("income=수입, expense=지출"),
      category: z.string().optional().describe("분류 이름(예: 식비, 카페, 교통)"),
      payment_method: z.string().optional().describe("결제수단 이름(예: 현금, 카드, 계좌)"),
      query: z.string().optional().describe("메모 검색어"),
      limit: z.number().int().min(1).max(500).optional(),
    },
    readOnly: true,
  },
  {
    name: "add_transaction",
    title: "가계부 기록",
    description:
      "수입·지출을 기록한다. '점심 김밥 4,500원 카드로 기록해줘' → type='expense', amount=4500, category='식비', payment_method='카드', memo='점심 김밥'. 분류·결제수단이 없는 이름이면 만들지 않고 후보를 돌려준다. Record a transaction (amount in KRW).",
    input: {
      type: z.enum(["income", "expense"]).describe("income=수입, expense=지출"),
      amount,
      date: date(`${DATE}. 생략하면 오늘`).optional(),
      category: z.string().optional().describe("분류 이름(지출: 식비, 카페, 교통, 주거, 통신, 쇼핑, 의료, 문화, 경조사, 기타 / 수입: 급여, 부수입, 기타 등)"),
      payment_method: z.string().optional().describe("결제수단 이름(현금, 카드, 계좌 등)"),
      memo: z.string().optional().describe("내용. 예: 점심 김밥"),
    },
  },
  {
    name: "update_transaction",
    title: "가계부 내역 수정",
    description: "기록한 내역을 고친다. 보낸 필드만 바뀐다. Update a transaction.",
    input: {
      id: id("내역"),
      type: z.enum(["income", "expense"]).optional(),
      amount: amount.optional(),
      date: date().optional(),
      category: z.string().nullable().optional().describe("분류 이름. null이면 분류 없음"),
      payment_method: z.string().nullable().optional(),
      memo: z.string().optional(),
    },
  },
  {
    name: "delete_transaction",
    title: "가계부 내역 삭제",
    description: "내역을 지운다. 먼저 confirm 없이 호출해 대상을 보여 주고, 사용자가 확인하면 confirm: true로 다시 호출한다. Delete a transaction (two-step).",
    input: { id: id("내역"), confirm },
    destructive: true,
  },
  {
    name: "get_budget_status",
    title: "예산 현황",
    description: "월 예산 대비 사용액·남은 금액·사용률(전체와 분류별). '이번 달 식비 예산 얼마나 남았어?'에 쓴다. Budget vs. spending for a month (KRW).",
    input: { month: z.string().optional().describe("YYYY-MM. 생략하면 이번 달") },
    readOnly: true,
  },
  {
    name: "get_spending_summary",
    title: "지출 요약",
    description: "기간 지출(또는 수입)을 분류·월·결제수단별로 합산한다. '지난달 어디에 제일 많이 썼어?'에 쓴다. Totals grouped by category/month/payment_method.",
    input: {
      from: date(`시작일 ${DATE}`),
      to: date(`종료일(포함) ${DATE}`),
      group_by: z.enum(["category", "month", "payment_method"]).describe("묶는 기준"),
      type: z.enum(["income", "expense"]).optional().describe("기본 expense(지출)"),
    },
    readOnly: true,
  },
];
