"use client";

// MCP 연결 탭 (MCP-01~03·06, 05 세션 담당). 지금은 시안 예시 데이터로 보여 준다.
import { useState } from "react";
import { CardHead } from "@/components/ui";
import { MCP_LOGS, MCP_TOKEN } from "@/lib/mock-data";
import { ToggleList } from "./ToggleList";

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

export function McpTab() {
  const [copied, setCopied] = useState(false);

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
    <>
      <ToggleList
        rows={[
          { key: "mcpWrite", label: "쓰기 권한", desc: "끄면 조회만 가능 (읽기 전용)", initial: true },
          { key: "mcpEvents", label: "일정 접근 허용", desc: "list_events, create_event, find_free_time 외", initial: true },
          { key: "mcpTodos", label: "할일 접근 허용", desc: "list_todos, create_todo, complete_todo 외", initial: true },
          { key: "mcpMoney", label: "가계부 접근 허용", desc: "list_transactions, add_transaction, get_budget_status 외", initial: true },
        ]}
      />
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
  );
}
