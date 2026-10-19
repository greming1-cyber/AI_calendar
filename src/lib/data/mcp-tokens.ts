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

/** 원격 MCP 서버 주소(MCP-07). claude.ai·ChatGPT 커넥터와 Claude Code --transport http에 넣는다 */
export const MCP_REMOTE_URL = SUPABASE_URL ? `${SUPABASE_URL}/functions/v1/mcp-remote` : "https://<project>.supabase.co/functions/v1/mcp-remote";

/** 서비스 스위치와 쓰기 권한 스위치 → 범위 목록. 쓰기를 끄면 모든 *:write를 뺀다(MCP-02) */
export const scopesFor = (services: readonly string[], write: boolean): McpScope[] =>
  MCP_SERVICES.filter((s) => services.includes(s.key)).flatMap((s) => (write && s.write ? [s.read, s.write] : [s.read]));

/** OAuth로 연결된 앱(claude.ai·ChatGPT 등). 권한은 동의 화면에서 고른다 */
export interface McpGrant {
  id: string;
  clientId: string;
  clientName: string;
  redirectHost: string;
  scopes: McpScope[];
  createdAt: string;
  lastUsedAt: string | null;
  revokedAt: string | null;
}

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
  const supabase = createClient();
  const [logs, grants] = await Promise.all([
    supabase
      .from("mcp_audit_logs")
      .select("id, tool, result_summary, status, created_at, client_id, mcp_tokens(name)")
      .gte("created_at", since)
      .order("created_at", { ascending: false })
      .limit(100),
    supabase.from("mcp_oauth_grants").select("client_id, client_name"),
  ]);
  if (logs.error) throw logs.error;
  if (grants.error) throw grants.error;
  const clientName = new Map(grants.data.map((g) => [g.client_id, g.client_name]));
  return logs.data.map((l) => ({
    id: l.id,
    tool: l.tool,
    summary: l.result_summary ?? "",
    status: l.status === "error" ? "error" : "ok",
    // PAT로 실행했으면 토큰 이름, OAuth 연결이면 앱 이름
    tokenName: (l.mcp_tokens as { name: string } | null)?.name ?? (l.client_id ? clientName.get(l.client_id) || "연결된 앱" : null),
    at: l.created_at,
  }));
}

export async function getMcpStatus(): Promise<McpStatus> {
  const supabase = createClient();
  const [tokens, grants] = await Promise.all([
    supabase.from("mcp_tokens").select("last_used_at").is("revoked_at", null),
    supabase.from("mcp_oauth_grants").select("last_used_at").is("revoked_at", null),
  ]);
  if (tokens.error) throw tokens.error;
  if (grants.error) throw grants.error;
  const all = [...tokens.data, ...grants.data];
  const lastUsedAt = all.map((t) => t.last_used_at).filter((t): t is string => Boolean(t)).sort().at(-1) ?? null;
  return {
    hasToken: all.length > 0,
    connected: lastUsedAt != null && Date.now() - Date.parse(lastUsedAt) < RECENT_MS,
    lastUsedAt,
  };
}

// ── OAuth 연결(원격 MCP, MCP-07) ─────────────────────────

const toScopes = (list: string[]) => list.filter((s): s is McpScope => MCP_SCOPES.includes(s as McpScope));

export async function listMcpGrants(): Promise<McpGrant[]> {
  const { data, error } = await createClient()
    .from("mcp_oauth_grants")
    .select("id, client_id, client_name, redirect_host, scopes, created_at, last_used_at, revoked_at")
    .order("revoked_at", { nullsFirst: true })
    .order("created_at", { ascending: false });
  if (error) throw error;
  return data.map((g) => ({
    id: g.id,
    clientId: g.client_id,
    clientName: g.client_name,
    redirectHost: g.redirect_host,
    scopes: toScopes(g.scopes),
    createdAt: g.created_at,
    lastUsedAt: g.last_used_at,
    revokedAt: g.revoked_at,
  }));
}

/** 동의 화면에서 승인하기 직전에 권한을 저장한다. 다시 연결하면 같은 행을 되살린다 */
export async function saveMcpGrant(input: { userId: string; clientId: string; clientName: string; redirectHost: string; scopes: McpScope[] }) {
  const { error } = await createClient()
    .from("mcp_oauth_grants")
    .upsert(
      {
        user_id: input.userId,
        client_id: input.clientId,
        client_name: input.clientName,
        redirect_host: input.redirectHost,
        scopes: input.scopes,
        revoked_at: null,
      },
      { onConflict: "user_id,client_id" },
    );
  if (error) throw error;
}

/**
 * 연결 해제: Supabase 쪽 허가를 철회해 세션·refresh token을 무효화하고, 우리 권한 행에 revoked_at을 남긴다.
 * Supabase 철회가 실패해도(이미 철회됨 등) revoked_at이 있으면 mcp-remote가 즉시 거부한다.
 */
export async function revokeMcpGrant(clientId: string) {
  const supabase = createClient();
  await supabase.auth.oauth.revokeGrant({ clientId }).catch(() => undefined);
  const { error } = await supabase
    .from("mcp_oauth_grants")
    .update({ revoked_at: new Date().toISOString() })
    .eq("client_id", clientId)
    .is("revoked_at", null);
  if (error) throw error;
}
