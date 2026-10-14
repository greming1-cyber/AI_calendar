"use client";

import { useState } from "react";
import { CardHead, Segmented, Switch } from "@/components/ui";
import { GOOGLE_SYNC, MCP_LOGS, MCP_TOKEN, PROFILE } from "@/lib/mock-data";

type Tab = "noti" | "google" | "weather" | "mcp";
type ToggleKey =
  | "evAlert" | "dueAlert" | "budgetAlert" | "weatherAlert"
  | "gWork" | "gPersonal" | "gHoliday"
  | "wxCalendar" | "wxDust"
  | "mcpWrite" | "mcpEvents" | "mcpTodos" | "mcpMoney";

const INITIAL: Record<ToggleKey, boolean> = {
  evAlert: true, dueAlert: true, budgetAlert: true, weatherAlert: true,
  gWork: true, gPersonal: true, gHoliday: false,
  wxCalendar: true, wxDust: false,
  mcpWrite: true, mcpEvents: true, mcpTodos: true, mcpMoney: true,
};

const TABS: Record<Tab, { label: string; isNew: boolean; desc: string; rows: [ToggleKey, string, string][] }> = {
  noti: {
    label: "알림 설정",
    isNew: false,
    desc: "받을 알림을 선택하세요.",
    rows: [
      ["evAlert", "일정 알림", "일정 시작 전 설정한 시간에 알림"],
      ["dueAlert", "할일 마감 알림", "마감 당일 오전 9시"],
      ["budgetAlert", "예산 초과 알림", "분류별 예산의 80%, 100% 도달 시"],
      ["weatherAlert", "악천후 예보 알림", "야외 일정 날짜에 비·눈 예보가 있을 때"],
    ],
  },
  google: {
    label: "구글 캘린더 연동",
    isNew: true,
    desc: "구글 캘린더와 일정을 동기화해요.",
    rows: [
      ["gWork", "업무 캘린더", PROFILE.workEmail],
      ["gPersonal", "개인 캘린더", PROFILE.googleEmail],
      ["gHoliday", "대한민국 공휴일", "읽기 전용"],
    ],
  },
  weather: {
    label: "날씨 설정",
    isNew: true,
    desc: "날씨 정보 표시 방식을 설정해요.",
    rows: [
      ["wxCalendar", "캘린더 날씨 아이콘", "예보 가능 기간(최대 10일)에 표시"],
      ["wxDust", "미세먼지 표시", "홈 날씨 위젯에 함께 표시"],
    ],
  },
  mcp: {
    label: "MCP 연결",
    isNew: true,
    desc: "Claude Desktop / Claude Code에서 대화로 일정·할일·가계부를 다뤄요.",
    rows: [
      ["mcpWrite", "쓰기 권한", "끄면 조회만 가능 (읽기 전용)"],
      ["mcpEvents", "일정 접근 허용", "list_events, create_event, find_free_time 외"],
      ["mcpTodos", "할일 접근 허용", "list_todos, create_todo, complete_todo 외"],
      ["mcpMoney", "가계부 접근 허용", "list_transactions, add_transaction, get_budget_status 외"],
    ],
  },
};

// PRD 4.4 Claude Desktop 설정 예시 (로컬 stdio MCP 서버)
const MCP_CONFIG = `{
  "mcpServers": {
    "life-manager": {
      "command": "npx",
      "args": ["-y", "life-manager-mcp"],
      "env": {
        "LIFE_API_URL": "https://<project>.supabase.co/functions/v1/mcp-api",
        "LIFE_TOKEN": "lm_mcp_…7f3a"
      }
    }
  }
}`;

const SYNC_MODES = [
  { value: "import", label: "가져오기만" },
  { value: "export", label: "내보내기만" },
  { value: "both", label: "양방향" },
] as const;

export function SettingsView() {
  const [tab, setTab] = useState<Tab>("mcp");
  const [toggles, setToggles] = useState(INITIAL);
  const [sync, setSync] = useState<(typeof SYNC_MODES)[number]["value"]>("both");
  const [unit, setUnit] = useState<"c" | "f">("c");
  const [copied, setCopied] = useState(false);
  const def = TABS[tab];

  const copyConfig = async () => {
    try {
      await navigator.clipboard.writeText(MCP_CONFIG);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // 클립보드 권한이 없으면 무시
    }
  };

  return (
    <main className="grid items-start gap-4 px-4 pb-7 md:grid-cols-[minmax(180px,240px)_minmax(0,1fr)] md:px-7">
      <nav className="card card-flat flex-row gap-0.5 overflow-x-auto p-3.5 md:flex-col">
        {(Object.keys(TABS) as Tab[]).map((id) => (
          <button
            key={id}
            type="button"
            aria-current={tab === id ? "page" : undefined}
            onClick={() => setTab(id)}
            className={`flex justify-between gap-3 rounded-xl px-3.5 py-[11px] text-left text-sm whitespace-nowrap ${
              tab === id ? "bg-white/10 font-semibold text-fg" : "text-muted hover:bg-white/5"
            }`}
          >
            {TABS[id].label}
            {TABS[id].isNew && <span className="text-[10px] text-accent">신규</span>}
          </button>
        ))}
      </nav>

      <div className="flex max-w-[880px] min-w-0 flex-col gap-3">
        <div className="flex flex-col gap-1 pt-1 pb-2">
          <span className="text-2xl font-bold">{def.label}</span>
          <span className="text-[13px] text-muted">{def.desc}</span>
        </div>

        {tab === "google" && (
          <section className="card card-warm flex-row flex-wrap items-center gap-4 p-5">
            <div className="flex size-11 items-center justify-center rounded-full bg-fg font-extrabold text-ink">G</div>
            <div className="flex flex-1 flex-col gap-[3px]">
              <span className="text-[15px] font-semibold">{PROFILE.googleEmail}</span>
              <span className="text-xs text-muted">
                마지막 동기화 {GOOGLE_SYNC.lastSynced} · {SYNC_MODES.find((m) => m.value === sync)?.label}
              </span>
            </div>
            <span className="pill pill-accent">지금 동기화</span>
            <span className="pill">연결 해제</span>
          </section>
        )}

        {tab === "weather" && (
          <section className="card card-warm flex-row flex-wrap items-center gap-4 p-5">
            <div className="flex flex-1 flex-col gap-[3px]">
              <span className="text-xs text-muted">기본 지역</span>
              <span className="text-xl font-semibold">{PROFILE.region}</span>
            </div>
            <span className="pill">현재 위치 사용</span>
            <span className="pill">지역 변경</span>
          </section>
        )}

        <section className="card card-flat py-1.5">
          {def.rows.map(([key, label, desc]) => (
            <div key={key} className="flex items-center gap-4 border-b border-line py-3.5 last:border-b-0">
              <div className="flex flex-1 flex-col gap-[3px]">
                <span className="text-sm">{label}</span>
                <span className="text-xs text-subtle">{desc}</span>
              </div>
              <Switch label={label} checked={toggles[key]} onChange={() => setToggles((t) => ({ ...t, [key]: !t[key] }))} />
            </div>
          ))}
        </section>

        {tab === "google" && (
          <section className="card card-flat gap-3 p-5">
            <span className="text-[15px] font-semibold">동기화 방식</span>
            <div className="self-start">
              <Segmented options={SYNC_MODES} value={sync} onChange={setSync} />
            </div>
            <span className="text-xs text-subtle">양쪽에서 동시에 수정되면 최근 수정본을 우선하고 변경 이력을 보관해요.</span>
          </section>
        )}

        {tab === "weather" && (
          <section className="card card-flat flex-row flex-wrap items-center gap-4 p-5">
            <div className="flex flex-1 flex-col gap-[3px]">
              <span className="text-sm">온도 단위</span>
              <span className="text-xs text-subtle">홈 위젯, 캘린더, 일정 상세에 적용</span>
            </div>
            <Segmented
              options={[
                { value: "c", label: "섭씨 °C" },
                { value: "f", label: "화씨 °F" },
              ]}
              value={unit}
              onChange={setUnit}
            />
          </section>
        )}

        {tab === "mcp" && (
          <>
            <div className="grid grid-cols-[repeat(auto-fit,minmax(280px,1fr))] gap-3">
              <section className="card card-warm gap-3 p-5">
                <CardHead title="액세스 토큰" meta={<span className="text-ok">● 활성</span>} />
                <div className="rounded-[10px] bg-black/30 p-3 font-mono text-[13px]">{MCP_TOKEN.masked}</div>
                <span className="text-xs text-subtle">
                  {MCP_TOKEN.issued} 발급 · 마지막 사용 {MCP_TOKEN.lastUsed}
                </span>
                <div className="flex gap-2">
                  <span className="pill px-3 py-[7px]">새 토큰 발급</span>
                  <span className="pill pill-danger px-3 py-[7px]">폐기</span>
                </div>
              </section>
              <section className="card card-flat gap-3 p-5">
                <CardHead
                  title="연결 가이드"
                  meta={
                    <button type="button" onClick={copyConfig} className="text-xs text-accent">
                      {copied ? "복사됨" : "복사"}
                    </button>
                  }
                />
                <span className="text-xs text-muted">Claude Desktop 설정 파일에 붙여넣으세요.</span>
                <pre className="m-0 overflow-x-auto rounded-[10px] bg-black/30 p-3 font-mono text-[11px] leading-relaxed text-soft">
                  {MCP_CONFIG}
                </pre>
              </section>
            </div>
            <section className="card card-flat gap-2 p-5">
              <CardHead title="사용 기록" meta="최근 7일" />
              {MCP_LOGS.map((l) => (
                <div
                  key={`${l.tool}-${l.at}`}
                  className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-3.5 gap-y-1 border-b border-white/[.06] py-2 text-[13px] sm:grid-cols-[170px_minmax(0,1fr)_110px]"
                >
                  <span className="font-mono text-xs text-accent">{l.tool}</span>
                  <span className="order-3 col-span-2 sm:order-none sm:col-span-1">{l.text}</span>
                  <span className="text-right text-[11px] text-subtle">{l.at}</span>
                </div>
              ))}
            </section>
          </>
        )}
      </div>
    </main>
  );
}
