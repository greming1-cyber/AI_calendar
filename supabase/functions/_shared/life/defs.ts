// 라이프 매니저 MCP 도구 정의(PRD 4.4) — 이름·설명·필요 권한·입력 JSON Schema·힌트의 단일 출처.
// import가 없는 순수 TS라 Edge Function(mcp-api, mcp-remote, Deno)과 로컬 stdio 서버(mcp/, Node)가 함께 쓴다.
// mcp/는 빌드할 때 이 파일을 mcp/src/generated/defs.ts로 복사한다(mcp/scripts/copy-defs.mjs).
// 설명은 Claude·ChatGPT가 도구를 정확히 고르도록 언제 쓰는지, 날짜 형식, 금액 단위를 적는다.

export type JsonSchema = {
  type?: string | string[];
  description?: string;
  enum?: readonly (string | number)[];
  items?: JsonSchema;
  properties?: Record<string, JsonSchema>;
  required?: readonly string[];
  minimum?: number;
  maximum?: number;
  additionalProperties?: boolean;
};

export interface ToolDef {
  name: string;
  title: string;
  description: string;
  /** 필요한 범위. "any-read" = 읽기 범위 하나 이상(결과는 가진 범위만큼만) */
  scope: string;
  /** 데이터를 바꾸는 도구(사용 기록 대상) */
  write?: boolean;
  /** 삭제처럼 되돌릴 수 없는 도구 */
  destructive?: boolean;
  inputSchema: JsonSchema & { type: "object" };
}

const DATE = "YYYY-MM-DD (absolute date in the user's timezone; resolve '내일', '이번 주 금요일' yourself using `now` from the previous response)";
const DATETIME =
  "ISO 8601. 'YYYY-MM-DD' = 종일(all-day), 'YYYY-MM-DDTHH:mm' = 사용자 타임존 기준 시각. Never send relative words like 'tomorrow'.";

const str = (description: string): JsonSchema => ({ type: "string", description });
const nullableStr = (description: string): JsonSchema => ({ type: ["string", "null"], description });
const int = (description: string, minimum?: number, maximum?: number): JsonSchema => ({ type: "integer", description, minimum, maximum });
const bool = (description: string): JsonSchema => ({ type: "boolean", description });
const oneOf = (values: readonly string[], description: string): JsonSchema => ({ type: "string", enum: values, description });
const obj = (properties: Record<string, JsonSchema>, required: string[] = []) =>
  ({ type: "object", properties, required, additionalProperties: false }) as const;

const id = (what: string) => str(`${what} id. 목록·검색 도구가 돌려준 id를 그대로 쓴다 (copy the id exactly as returned).`);
const scope = oneOf(
  ["this", "following", "all"],
  "반복 일정일 때 범위: this=이 회차만, following=이 회차부터 이후 모두, all=전체. 회차 id(…:YYYY-MM-DD)면 기본 this, 원본 id면 기본 all.",
);
const confirm = bool(
  "true일 때만 실제로 삭제한다. 생략하면 삭제 대상 요약만 돌려준다. Show the summary to the user and get explicit confirmation before calling again with confirm: true.",
);
const PRIORITY = ["high", "normal", "low"] as const;
const priority = oneOf(PRIORITY, "우선순위: high(높음), normal(보통), low(낮음)");
const TX_TYPE = ["income", "expense"] as const;
const amount = int("금액, 원(KRW) 단위 정수. 예: 4,500원 → 4500", 1);
const limit = (max: number) => int(`최대 개수(1~${max})`, 1, max);

export const TOOL_DEFS: readonly ToolDef[] = [
  // ── 공통 ──
  {
    name: "get_today_summary",
    title: "오늘 요약",
    description:
      "하루 요약: 그날 일정, 밀린·오늘 마감 할일, 그날·이번 달 지출, 예산 사용률. '오늘 뭐 있어?', '오늘 하루 정리해줘'처럼 전반적인 질문에 먼저 쓴다. Overview of a day across calendar, todos and spending.",
    scope: "any-read",
    inputSchema: obj({ date: str(`${DATE}. 생략하면 오늘.`) }),
  },
  {
    name: "search",
    title: "통합 검색",
    description:
      "일정·할일·가계부 내역을 키워드로 찾는다. id를 모를 때(예: '치과 일정 지워줘') 대상을 찾는 데 쓴다. Keyword search across events, todos and transactions.",
    scope: "any-read",
    inputSchema: obj(
      {
        query: str("검색어 (제목·메모·장소·분류명)"),
        types: { type: "array", items: oneOf(["events", "todos", "transactions"], "유형"), description: "찾을 유형. 생략하면 전부" },
        limit: limit(100),
      },
      ["query"],
    ),
  },
  {
    name: "get_weather",
    title: "날씨",
    description: "현재 날씨나 특정 날짜 예보. Weather for the user's saved location.",
    scope: "weather:read",
    inputSchema: obj({ date: str(`${DATE}. 생략하면 현재 날씨.`), location: str("지역 이름. 생략하면 설정한 위치") }),
  },

  // ── 일정 ──
  {
    name: "list_events",
    title: "일정 조회",
    description:
      "기간 안의 일정 목록. 반복 일정은 회차별로 펼쳐서 준다(회차 id는 '<원본id>:YYYY-MM-DD'). '이번 주 일정', '내일 약속 있어?'에 쓴다. List calendar events in a date range (recurring events expanded).",
    scope: "events:read",
    inputSchema: obj(
      {
        from: str(`시작일 ${DATE}`),
        to: str(`종료일(포함) ${DATE}. 최대 366일`),
        category: str("일정 카테고리 이름(예: 업무, 개인, 가족, 운동)"),
        query: str("제목·장소·메모에 들어간 글자"),
        limit: limit(500),
      },
      ["from", "to"],
    ),
  },
  {
    name: "create_event",
    title: "일정 등록",
    description:
      "새 일정을 만든다. '내일 오후 3시에 치과 예약 넣어줘' → start='YYYY-MM-DDT15:00'. 시각 없이 날짜만 주면 종일 일정. Create a calendar event.",
    scope: "events:write",
    write: true,
    inputSchema: obj(
      {
        title: str("제목"),
        start: str(`시작. ${DATETIME}`),
        end: str(`끝. ${DATETIME} 생략하면 끝 시각 없음(종일이면 하루). 여러 날 종일 일정은 마지막 날 날짜`),
        all_day: bool("종일 일정이면 true"),
        location: str("장소"),
        memo: str("메모"),
        category: str("일정 카테고리 이름. 없는 이름이면 만들지 않고 후보를 돌려준다"),
        rrule: str("반복 규칙 RFC 5545 RRULE 본문. 예: 'FREQ=WEEKLY;BYDAY=TU,TH', 'FREQ=MONTHLY;COUNT=6'"),
        calendar: str("'local'(기본, 내 캘린더) 또는 연결된 구글 캘린더 이름"),
        reminder_minutes: int("몇 분 전에 알림. 생략하면 알림 없음", 0),
      },
      ["title", "start"],
    ),
  },
  {
    name: "update_event",
    title: "일정 수정",
    description: "일정의 제목·시간·장소 등을 바꾼다. 보낸 필드만 바뀐다. 반복 일정은 scope로 범위를 정한다. Update an event; only provided fields change.",
    scope: "events:write",
    write: true,
    inputSchema: obj(
      {
        id: id("일정(또는 반복 회차)"),
        title: str("새 제목"),
        start: str(`새 시작. ${DATETIME}`),
        end: str(`새 끝. ${DATETIME}`),
        all_day: bool("종일 일정 여부"),
        location: str("장소"),
        memo: str("메모"),
        category: nullableStr("카테고리 이름. null이면 분류 없음"),
        rrule: nullableStr("반복 규칙. null이면 반복 해제"),
        reminder_minutes: { type: ["integer", "null"], minimum: 0, description: "몇 분 전 알림. null이면 알림 없음" },
        scope,
      },
      ["id"],
    ),
  },
  {
    name: "delete_event",
    title: "일정 삭제",
    description:
      "일정을 지운다. 반드시 먼저 confirm 없이 호출해 대상 요약을 사용자에게 보여 주고, 사용자가 확인하면 confirm: true로 다시 호출한다. Delete an event (two-step: preview, then confirm).",
    scope: "events:write",
    write: true,
    destructive: true,
    inputSchema: obj({ id: id("일정(또는 반복 회차)"), scope, confirm }, ["id"]),
  },
  {
    name: "find_free_time",
    title: "빈 시간 찾기",
    description:
      "기간 안에서 일정이 없는 시간대를 찾는다. '이번 주에 1시간 비는 때 있어?'에 쓴다. Find free slots of at least duration_minutes within work hours.",
    scope: "events:read",
    inputSchema: obj(
      {
        from: str(`시작일 ${DATE}`),
        to: str(`종료일(포함) ${DATE}. 최대 31일`),
        duration_minutes: int("필요한 시간(분)", 5),
        work_hours: str("찾을 시간대. 예: '09-18'(기본), '10:00-22:00'"),
        skip_weekends: bool("주말 제외"),
      },
      ["from", "to", "duration_minutes"],
    ),
  },

  // ── 할일 ──
  {
    name: "list_todos",
    title: "할일 조회",
    description:
      "할일 목록. '이번 주 마감 할일' → status='open', due_before=그 주 마지막 날. 밀린 할일 수(overdue)도 준다. List todos (top-level; checklist progress included).",
    scope: "todos:read",
    inputSchema: obj({
      status: oneOf(["open", "done", "all"], "open=미완료(기본), done=완료, all=전체"),
      due_before: str(`이 날짜까지 마감(포함). ${DATE}`),
      due_after: str(`이 날짜부터 마감(포함). ${DATE}`),
      project: str("프로젝트 이름(예: 업무, 개인, 가족)"),
      priority,
      query: str("제목·메모 검색어"),
      limit: limit(500),
    }),
  },
  {
    name: "create_todo",
    title: "할일 등록",
    description: "새 할일을 만든다. Create a todo.",
    scope: "todos:write",
    write: true,
    inputSchema: obj(
      {
        title: str("제목"),
        due: str(`마감. ${DATETIME}`),
        priority: oneOf(PRIORITY, "우선순위, 기본 normal"),
        project: str("프로젝트 이름. 없는 이름이면 만들지 않고 후보를 돌려준다"),
        memo: str("메모"),
        rrule: str("반복 규칙(RRULE 본문). 예: 'FREQ=WEEKLY;BYDAY=FR'. due가 필요하다"),
        subtasks: { type: "array", items: str("항목 제목"), description: "체크리스트 항목 제목들" },
      },
      ["title"],
    ),
  },
  {
    name: "update_todo",
    title: "할일 수정",
    description: "할일의 제목·마감·우선순위·프로젝트·메모를 바꾼다. 보낸 필드만 바뀐다. 완료 처리는 complete_todo를 쓴다. Update a todo.",
    scope: "todos:write",
    write: true,
    inputSchema: obj(
      {
        id: id("할일"),
        title: str("새 제목"),
        due: nullableStr(`새 마감. ${DATETIME} null이면 마감 없음`),
        priority,
        project: nullableStr("프로젝트 이름. null이면 프로젝트 없음"),
        memo: str("메모"),
        rrule: nullableStr("반복 규칙. null이면 반복 해제"),
      },
      ["id"],
    ),
  },
  {
    name: "complete_todo",
    title: "할일 완료",
    description: "할일을 완료(또는 done=false로 완료 취소)한다. 반복 할일이면 다음 회차가 자동으로 생긴다. Mark a todo done/undone.",
    scope: "todos:write",
    write: true,
    inputSchema: obj({ id: id("할일"), done: bool("기본 true. false면 완료 취소") }, ["id"]),
  },
  {
    name: "delete_todo",
    title: "할일 삭제",
    description:
      "할일(과 체크리스트)을 지운다. 먼저 confirm 없이 호출해 대상을 보여 주고, 사용자가 확인하면 confirm: true로 다시 호출한다. Delete a todo (two-step).",
    scope: "todos:write",
    write: true,
    destructive: true,
    inputSchema: obj({ id: id("할일"), confirm }, ["id"]),
  },

  // ── 가계부 ──
  {
    name: "list_transactions",
    title: "가계부 내역 조회",
    description: "기간 안의 수입·지출 내역과 합계(원). List income/expense transactions with totals (KRW).",
    scope: "tx:read",
    inputSchema: obj(
      {
        from: str(`시작일 ${DATE}`),
        to: str(`종료일(포함) ${DATE}`),
        type: oneOf(TX_TYPE, "income=수입, expense=지출"),
        category: str("분류 이름(예: 식비, 카페, 교통)"),
        payment_method: str("결제수단 이름(예: 현금, 카드, 계좌)"),
        query: str("메모 검색어"),
        limit: limit(500),
      },
      ["from", "to"],
    ),
  },
  {
    name: "add_transaction",
    title: "가계부 기록",
    description:
      "수입·지출을 기록한다. '점심 김밥 4,500원 카드로 기록해줘' → type='expense', amount=4500, category='식비', payment_method='카드', memo='점심 김밥'. 분류·결제수단이 없는 이름이면 만들지 않고 후보를 돌려준다. Record a transaction (amount in KRW).",
    scope: "tx:write",
    write: true,
    inputSchema: obj(
      {
        type: oneOf(TX_TYPE, "income=수입, expense=지출"),
        amount,
        date: str(`${DATE}. 생략하면 오늘`),
        category: str("분류 이름(지출: 식비, 카페, 교통, 주거, 통신, 쇼핑, 의료, 문화, 경조사, 기타 / 수입: 급여, 부수입, 기타 등)"),
        payment_method: str("결제수단 이름(현금, 카드, 계좌 등)"),
        memo: str("내용. 예: 점심 김밥"),
      },
      ["type", "amount"],
    ),
  },
  {
    name: "update_transaction",
    title: "가계부 내역 수정",
    description: "기록한 내역을 고친다. 보낸 필드만 바뀐다. Update a transaction.",
    scope: "tx:write",
    write: true,
    inputSchema: obj(
      {
        id: id("내역"),
        type: oneOf(TX_TYPE, "income=수입, expense=지출"),
        amount,
        date: str(DATE),
        category: nullableStr("분류 이름. null이면 분류 없음"),
        payment_method: nullableStr("결제수단 이름. null이면 없음"),
        memo: str("내용"),
      },
      ["id"],
    ),
  },
  {
    name: "delete_transaction",
    title: "가계부 내역 삭제",
    description:
      "내역을 지운다. 먼저 confirm 없이 호출해 대상을 보여 주고, 사용자가 확인하면 confirm: true로 다시 호출한다. Delete a transaction (two-step).",
    scope: "tx:write",
    write: true,
    destructive: true,
    inputSchema: obj({ id: id("내역"), confirm }, ["id"]),
  },
  {
    name: "get_budget_status",
    title: "예산 현황",
    description:
      "월 예산 대비 사용액·남은 금액·사용률(전체와 분류별). '이번 달 식비 예산 얼마나 남았어?'에 쓴다. Budget vs. spending for a month (KRW).",
    scope: "tx:read",
    inputSchema: obj({ month: str("YYYY-MM. 생략하면 이번 달") }),
  },
  {
    name: "get_spending_summary",
    title: "지출 요약",
    description:
      "기간 지출(또는 수입)을 분류·월·결제수단별로 합산한다. '지난달 어디에 제일 많이 썼어?'에 쓴다. Totals grouped by category/month/payment_method.",
    scope: "tx:read",
    inputSchema: obj(
      {
        from: str(`시작일 ${DATE}`),
        to: str(`종료일(포함) ${DATE}`),
        group_by: oneOf(["category", "month", "payment_method"], "묶는 기준"),
        type: oneOf(TX_TYPE, "기본 expense(지출)"),
      },
      ["from", "to", "group_by"],
    ),
  },
];

/** 범위 목록(MCP-02). 웹 앱 src/app/api/mcp/scopes.ts와 같아야 한다 */
export const READ_SCOPES = ["events:read", "todos:read", "tx:read", "weather:read"] as const;

/** 오류 코드별 Claude·ChatGPT용 안내(로컬·원격 서버가 같은 문장을 쓴다) */
export const ERROR_HINTS: Record<string, string> = {
  UNAUTHORIZED: "인증이 잘못됐거나 폐기됐습니다. 사용자에게 라이프 매니저 설정 → MCP 연결에서 다시 연결(또는 새 토큰 발급)하라고 안내하세요.",
  FORBIDDEN_SCOPE: "이 연결에는 권한이 없습니다. 다른 방법으로 시도하지 말고 사용자에게 권한이 필요하다고 알리세요.",
  NOT_FOUND: "대상을 찾지 못했습니다.",
  VALIDATION: "인자를 고쳐 다시 시도하세요.",
  CONFLICT: "같은 항목이 이미 있습니다.",
  UPSTREAM: "서버 또는 외부 서비스 문제입니다.",
};

/** API 응답 → MCP 도구 결과 텍스트. 성공이면 now 머리말 + JSON, 실패면 오류 문장과 후보 */
export function toolResultText(r: {
  ok: boolean;
  now?: string;
  timezone?: string;
  data?: unknown;
  code?: string;
  message?: string;
  candidates?: string[];
}): { isError: boolean; text: string } {
  const header = r.now ? `now: ${r.now} (${r.timezone ?? "Asia/Seoul"})\n` : "";
  if (r.ok) return { isError: false, text: `${header}${JSON.stringify(r.data, null, 2)}` };
  const lines = [`오류 ${r.code ?? "UPSTREAM"}: ${r.message ?? "알 수 없는 오류"}`];
  if (r.candidates?.length) lines.push(`다음 중 하나로 다시 시도: ${r.candidates.join(", ")}`);
  const hint = r.code && ERROR_HINTS[r.code];
  if (hint) lines.push(hint);
  return { isError: true, text: `${header}${lines.join("\n")}` };
}
