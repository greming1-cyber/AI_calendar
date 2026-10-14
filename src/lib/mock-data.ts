// 예시 데이터. Supabase 연결(M0~M1) 전까지 화면을 채우는 용도이며, 기준일은 TODAY로 고정한다.
import type {
  Budget,
  CalendarEvent,
  EventCategory,
  ISODate,
  McpLog,
  RecurringTodo,
  RecurringTransaction,
  Todo,
  Transaction,
} from "./types";

export const TODAY: ISODate = "2026-10-14";

export const PROFILE = {
  name: "김지훈",
  googleEmail: "jihoon.kim@gmail.com",
  workEmail: "jihoon.kim@company.com",
  region: "서울특별시 마포구",
  regionShort: "마포구",
};

const ACCENT = "oklch(0.72 0.17 50)";

export const EVENT_CATEGORIES: EventCategory[] = [
  { name: "업무", color: ACCENT },
  { name: "개인", color: "oklch(0.62 0.1 240)" },
  { name: "가족", color: "oklch(0.65 0.12 330)" },
  { name: "운동", color: "oklch(0.7 0.1 150)" },
];

export const categoryColor = (name: string) =>
  EVENT_CATEGORIES.find((c) => c.name === name)?.color ?? "rgb(255 255 255 / 0.3)";

// [일, 시작("종일"이면 종일), 제목, 카테고리, 장소, 구글 출처]
const EVENT_ROWS: [number, string, string, string, string, boolean][] = [
  [2, "10:00", "분기 킥오프", "업무", "본사 3층", true],
  [3, "종일", "개천절", "가족", "", true],
  [6, "19:00", "요가", "운동", "합정", false],
  [9, "종일", "한글날", "가족", "", true],
  [10, "13:00", "친구 결혼식", "개인", "더채플", false],
  [13, "19:00", "PT 수업", "운동", "합정 피트니스", false],
  [14, "종일", "엄마 생신", "가족", "본가", true],
  [14, "10:00", "주간 팀 회의", "업무", "본사 3층", true],
  [14, "12:30", "점심 약속", "개인", "강남역", false],
  [14, "19:00", "PT 수업", "운동", "합정 피트니스", false],
  [15, "15:00", "치과 예약", "개인", "연남 치과", false],
  [16, "15:00", "주간 정리", "업무", "본사", true],
  [17, "08:00", "북한산 등산", "개인", "북한산", false],
  [20, "10:00", "디자인 리뷰", "업무", "본사", true],
  [20, "19:00", "PT 수업", "운동", "합정 피트니스", false],
  [22, "14:00", "클라이언트 미팅", "업무", "판교", true],
  [25, "12:00", "카드 결제일", "개인", "", false],
  [27, "19:00", "PT 수업", "운동", "합정 피트니스", false],
  [31, "18:00", "할로윈 모임", "개인", "이태원", false],
];

const day = (d: number): ISODate => `2026-10-${String(d).padStart(2, "0")}`;

export const INITIAL_EVENTS: CalendarEvent[] = EVENT_ROWS.map(([d, start, title, category, location, google], i) => ({
  id: `ev-${i + 1}`,
  date: day(d),
  allDay: start === "종일",
  start: start === "종일" ? "" : start,
  end: "",
  title,
  category,
  location,
  source: google ? "google" : "local",
  repeat: "안 함",
  reminder: "10분 전",
  memo: "",
}));

/** 캘린더 날짜 칸에 표시할 예보 (예보 가능 기간만) */
export const DAILY_WEATHER: Record<ISODate, { label: string; rainChance: number }> = {
  [day(14)]: { label: "18°", rainChance: 10 },
  [day(15)]: { label: "19°", rainChance: 10 },
  [day(16)]: { label: "17°", rainChance: 20 },
  [day(17)]: { label: "비 15°", rainChance: 70 },
  [day(18)]: { label: "16°", rainChance: 30 },
  [day(19)]: { label: "17°", rainChance: 10 },
  [day(20)]: { label: "18°", rainChance: 10 },
  [day(21)]: { label: "16°", rainChance: 20 },
  [day(22)]: { label: "14°", rainChance: 30 },
  [day(23)]: { label: "15°", rainChance: 20 },
};

/** 비 예보 알림을 띄울 야외 일정 카테고리 */
export const OUTDOOR_CATEGORIES = ["개인", "운동"];

export const CURRENT_WEATHER = {
  temp: 18,
  condition: "맑음",
  high: 21,
  low: 11,
  rainChance: 10,
  hourly: [
    { time: "09", temp: 14 },
    { time: "12", temp: 18 },
    { time: "15", temp: 20 },
    { time: "18", temp: 17 },
    { time: "21", temp: 14 },
    { time: "00", temp: 12 },
  ],
};

export const GOOGLE_SYNC = { lastSynced: "3분 전" };

export const PROJECTS = ["업무", "개인", "가족"];

const PRI = { 높음: "high", 보통: "normal", 낮음: "low" } as const;

// [제목, 마감일, 우선순위, 프로젝트, 메모, 완료]
const TODO_ROWS: [string, number, keyof typeof PRI, string, string, boolean][] = [
  ["보험 서류 제출", 12, "높음", "개인", "", false],
  ["분기 보고서 초안", 14, "높음", "업무", "체크리스트 2/4", false],
  ["치과 예약 확인", 14, "보통", "개인", "", false],
  ["택배 반품 접수", 14, "낮음", "개인", "", false],
  ["생신 선물 포장", 14, "보통", "가족", "엄마 생신 일정 연결", false],
  ["운동 기록 정리", 14, "낮음", "개인", "매주 수 반복", false],
  ["디자인 리뷰 자료 준비", 19, "높음", "업무", "디자인 리뷰 일정 연결", false],
  ["등산 장비 점검", 16, "보통", "개인", "", false],
  ["가족 여행 숙소 예약", 24, "보통", "가족", "", false],
  ["공과금 납부", 12, "높음", "개인", "매월 12일 반복", true],
  ["팀 회의 안건 공유", 13, "보통", "업무", "", true],
];

export const INITIAL_TODOS: Todo[] = TODO_ROWS.map(([title, d, pri, project, note, done], i) => ({
  id: `todo-${i + 1}`,
  title,
  dueDate: day(d),
  priority: PRI[pri],
  project,
  note,
  done,
}));

export const RECURRING_TODOS: RecurringTodo[] = [
  { title: "운동 기록 정리", rule: "매주 수", next: day(21) },
  { title: "공과금 납부", rule: "매월 12일", next: "2026-11-12" },
  { title: "주간 회고", rule: "매주 금", next: day(16) },
];

export const TX_CATEGORY_COLORS: Record<string, string> = {
  식비: ACCENT,
  카페: "oklch(0.62 0.1 240)",
  교통: "oklch(0.7 0.1 150)",
  쇼핑: "oklch(0.65 0.12 330)",
  주거: "rgb(255 255 255 / 0.25)",
  급여: "rgb(255 255 255 / 0.18)",
  부수입: "rgb(255 255 255 / 0.18)",
};

// [일, 분류, 메모, 결제수단, 금액(+수입/-지출), Claude 경유]
const TX_ROWS: [number, string, string, Transaction["method"], number, boolean][] = [
  [1, "식비", "점심", "카드", -9000, false],
  [1, "카페", "아메리카노", "카드", -4700, false],
  [1, "교통", "교통카드 충전", "카드", -50000, false],
  [2, "식비", "회식 2차", "카드", -32000, false],
  [2, "카페", "라떼", "카드", -5200, false],
  [3, "식비", "장보기", "카드", -47000, false],
  [4, "교통", "택시", "카드", -17700, false],
  [5, "식비", "점심", "카드", -8500, false],
  [5, "카페", "카페 작업", "카드", -6300, false],
  [5, "부수입", "중고 거래", "계좌", 35000, false],
  [6, "식비", "점심", "카드", -9500, false],
  [6, "카페", "아메리카노", "카드", -4700, false],
  [7, "식비", "배달 저녁", "카드", -27000, true],
  [7, "카페", "디저트", "카드", -12800, false],
  [8, "식비", "점심", "카드", -9000, false],
  [8, "카페", "아메리카노", "카드", -4700, false],
  [9, "주거", "월세", "계좌", -650000, false],
  [9, "주거", "관리비", "계좌", -200000, false],
  [10, "급여", "10월 급여", "계좌", 3450000, false],
  [10, "식비", "장보기", "카드", -41500, false],
  [11, "쇼핑", "생활용품", "카드", -9500, false],
  [12, "식비", "점심", "카드", -10000, false],
  [12, "카페", "카페", "카드", -5500, false],
  [13, "교통", "택시", "카드", -14300, false],
  [13, "식비", "저녁 장보기", "카드", -48000, true],
  [13, "카페", "브런치 카페", "카드", -9400, false],
  [14, "식비", "점심 김밥", "카드", -4500, true],
  [14, "카페", "아메리카노", "카드", -4700, false],
  [14, "쇼핑", "생신 꽃다발", "카드", -39000, false],
];

export const INITIAL_TRANSACTIONS: Transaction[] = TX_ROWS.map(([d, category, memo, method, amt, via], i) => ({
  id: `tx-${i + 1}`,
  date: day(d),
  type: amt > 0 ? "income" : "expense",
  amount: Math.abs(amt),
  category,
  memo,
  method,
  viaClaude: via,
}));

export const MONTHLY_BUDGET = 2000000;

export const BUDGETS: Budget[] = [
  { category: "식비", amount: 300000 },
  { category: "카페", amount: 100000 },
  { category: "교통", amount: 200000 },
  { category: "쇼핑", amount: 300000 },
  { category: "주거", amount: 1000000 },
];

/** 지난 달 같은 기간(1~14일) 지출 — 전월 대비 증감 계산용 */
export const PREV_MONTH_SAME_PERIOD_EXPENSE = 1187000;

/** 지난 5개월 수입·지출 (이번 달은 내역에서 계산) */
export const PAST_MONTHS = [
  { label: "5월", income: 3450000, expense: 2150000 },
  { label: "6월", income: 3450000, expense: 2380000 },
  { label: "7월", income: 3450000, expense: 2620000 },
  { label: "8월", income: 3680000, expense: 2440000 },
  { label: "9월", income: 3450000, expense: 2210000 },
];

export const UPCOMING_FIXED: RecurringTransaction[] = [
  { title: "보험료", amount: 250000, date: day(21) },
  { title: "통신비", amount: 62000, date: day(25) },
];

export const MCP_TOKEN = {
  masked: "lm_mcp_••••••••••••7f3a",
  issued: "2026-09-30",
  lastUsed: "어제 12:41",
};

export const MCP_LOGS: McpLog[] = [
  { tool: "add_transaction", text: "점심 김밥 4,500원 · 카드", at: "10/14 12:41" },
  { tool: "add_transaction", text: "저녁 장보기 48,000원 · 카드", at: "10/13 19:20" },
  { tool: "create_event", text: "금 15:00 주간 정리", at: "10/13 09:05" },
  { tool: "complete_todo", text: "공과금 납부", at: "10/12 21:30" },
  { tool: "get_weather", text: "토요일 북한산 · 강수 70%", at: "10/12 20:10" },
];
