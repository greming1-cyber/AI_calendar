// MCP 토큰·사용 기록 데이터 계층(MCP-01~03, 06). 발급만 서버 라우트(/api/mcp/tokens)가 하고, 나머지는 RLS로 직접 읽고 쓴다.
import { MCP_SCOPES, type McpScope } from "@/app/api/mcp/scopes";
import { SUPABASE_URL } from "@/lib/supabase/env";
import { createClient } from "@/lib/supabase/client";

export { MCP_SCOPES, type McpScope };

/** 서비스별 권한(화면 표시 순서) */
export const MCP_SERVICES = [
  { key: "events", label: "일정", read: "events:read", write: "events:write" },
  { key: "todos", label: "할일", read: "todos:read", write: "todos:write" },
  { key: "tx", label: "가계부", read: "tx:read", write: "tx:write" },
  { key: "weather", label: "날씨", read: "weather:read", write: null },
] as const satisfies readonly { key: string; label: string; read: McpScope; write: McpScope | null }[];

/** Edge Function 주소. 설정 예시의 LIFE_API_URL */
export const MCP_API_URL = SUPABASE_URL ? `${SUPABASE_URL}/functions/v1/mcp-api` : "https://<project>.supabase.co/functions/v1/mcp-api";

export interface McpToken {
  id: string;
  name: string;
  /** 앞·뒤 4자리. 예: lm_mcp_AbCd…7f3a */
  prefix: string;
  scopes: McpScope[];
  createdAt: string;
  lastUsedAt: string | null;
  revokedAt: string | null;
}

export interface McpAuditLog {
  id: string;
  tool: string;
  summary: string;
  status: "ok" | "error";
  tokenName: string | null;
  at: string;
}

export interface McpStatus {
  /** 폐기되지 않은 토큰이 있다 */
  hasToken: boolean;
  /** 최근 24시간 안에 Claude가 토큰을 썼다(헤더 "Claude 연결됨" 표시용) */
  connected: boolean;
  lastUsedAt: string | null;
}

/** 최근 사용으로 볼 기간 */
const RECENT_MS = 24 * 60 * 60 * 1000;

export async function listMcpTokens(): Promise<McpToken[]> {
  const { data, error } = await createClient()
    .from("mcp_tokens")
    .select("id, name, token_prefix, scopes, created_at, last_used_at, revoked_at")
    .order("revoked_at", { nullsFirst: true })
    .order("created_at", { ascending: false });
  if (error) throw error;
  return data.map((t) => ({
    id: t.id,
    name: t.name,
    prefix: t.token_prefix,
    scopes: t.scopes.filter((s): s is McpScope => MCP_SCOPES.includes(s as McpScope)),
    createdAt: t.created_at,
    lastUsedAt: t.last_used_at,
    revokedAt: t.revoked_at,
  }));
}

/** 새 토큰. 원문 token은 이 반환값으로 한 번만 받는다 */
export async function createMcpToken(input: { name: string; scopes: McpScope[] }): Promise<{ id: string; token: string }> {
  const res = await fetch("/api/mcp/tokens", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok || !body.ok) throw new Error(body.message ?? "토큰을 만들지 못했어요.");
  return { id: body.id, token: body.token };
}

/** 폐기: revoked_at을 기록하면 mcp-api가 즉시 거부한다 */
export async function revokeMcpToken(id: string) {
  const { error } = await createClient().from("mcp_tokens").update({ revoked_at: new Date().toISOString() }).eq("id", id).is("revoked_at", null);
  if (error) throw error;
}

/** 쓰기 작업 사용 기록(MCP-06). 기본 최근 7일 */
export async function listMcpAuditLogs(days = 7): Promise<McpAuditLog[]> {
  const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();
  const { data, error } = await createClient()
    .from("mcp_audit_logs")
    .select("id, tool, result_summary, status, created_at, mcp_tokens(name)")
    .gte("created_at", since)
    .order("created_at", { ascending: false })
    .limit(100);
  if (error) throw error;
  return data.map((l) => ({
    id: l.id,
    tool: l.tool,
    summary: l.result_summary ?? "",
    status: l.status === "error" ? "error" : "ok",
    tokenName: (l.mcp_tokens as { name: string } | null)?.name ?? null,
    at: l.created_at,
  }));
}

export async function getMcpStatus(): Promise<McpStatus> {
  const { data, error } = await createClient()
    .from("mcp_tokens")
    .select("last_used_at")
    .is("revoked_at", null)
    .order("last_used_at", { ascending: false, nullsFirst: false })
    .limit(1);
  if (error) throw error;
  const lastUsedAt = data[0]?.last_used_at ?? null;
  return {
    hasToken: data.length > 0,
    connected: lastUsedAt != null && Date.now() - Date.parse(lastUsedAt) < RECENT_MS,
    lastUsedAt,
  };
}
