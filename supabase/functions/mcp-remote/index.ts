// Edge Function mcp-remote — 원격 MCP 서버(Streamable HTTP, MCP-07). claude.ai·Claude Desktop/모바일(커스텀 커넥터),
// ChatGPT(개발자 모드 앱), Claude Code(--transport http)가 인터넷에서 바로 연결한다.
//
// 인증 두 가지
// - OAuth 2.1: 인가 서버는 Supabase Auth(DCR·PKCE·토큰 발급·갱신). 이 함수는 리소스 서버로서
//   미인증 요청에 401 + WWW-Authenticate(resource_metadata)를 돌려주고, 보호 리소스 메타데이터(RFC 9728)를 제공한다.
//   권한은 웹 앱 동의 화면(/oauth/consent)에서 고른 mcp_oauth_grants.scopes.
// - PAT: Authorization: Bearer lm_mcp_… (Claude Code 등 헤더를 넣을 수 있는 클라이언트용). mcp_tokens.scopes.
// 도구 정의·실행·범위 검사·사용 기록은 mcp-api와 같은 _shared/life를 쓴다.
//
// 요청마다 MCP 서버를 새로 만드는 stateless 방식(세션 없음, JSON 응답)이다.
// 배포: npx supabase functions deploy mcp-remote --no-verify-jwt (config.toml [functions.mcp-remote] verify_jwt = false)
import { Server } from "npm:@modelcontextprotocol/sdk@1.32.1/server/index.js";
import { WebStandardStreamableHTTPServerTransport } from "npm:@modelcontextprotocol/sdk@1.32.1/server/webStandardStreamableHttp.js";
import { CallToolRequestSchema, ListToolsRequestSchema } from "npm:@modelcontextprotocol/sdk@1.32.1/types.js";
import { type SupabaseClient, createClient } from "npm:@supabase/supabase-js@2";
import { PAT_PATTERN, authIssuer, authenticateOAuth, authenticatePat, bearer } from "../_shared/life/auth.ts";
import { TOOL_DEFS, toolResultText } from "../_shared/life/defs.ts";
import { type Principal, runTool } from "../_shared/life/run.ts";
import { ApiError, type Args } from "../_shared/life/util.ts";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, content-type, mcp-protocol-version, mcp-session-id, last-event-id",
  "Access-Control-Allow-Methods": "GET, POST, DELETE, OPTIONS",
  "Access-Control-Expose-Headers": "www-authenticate, mcp-session-id",
};

/** 이 서버의 정식 주소(보호 리소스 메타데이터의 resource). 사용자가 커넥터에 넣는 URL과 같아야 한다 */
const resourceUrl = () => `${Deno.env.get("SUPABASE_URL")!.replace(/\/$/, "")}/functions/v1/mcp-remote`;
const metadataUrl = () => `${resourceUrl()}/.well-known/oauth-protected-resource`;

const withCors = (res: Response) => {
  const headers = new Headers(res.headers);
  for (const [k, v] of Object.entries(CORS)) headers.set(k, v);
  return new Response(res.body, { status: res.status, headers });
};

const json = (body: unknown, status = 200, extra: Record<string, string> = {}) =>
  new Response(JSON.stringify(body), { status, headers: { ...CORS, "Content-Type": "application/json; charset=utf-8", ...extra } });

/** 401: 클라이언트가 OAuth 로그인을 시작하도록 메타데이터 위치를 알려 준다 */
const unauthorized = (message: string) =>
  json({ jsonrpc: "2.0", error: { code: -32001, message }, id: null }, 401, {
    "WWW-Authenticate": `Bearer resource_metadata="${metadataUrl()}"`,
  });

/** 보호 리소스 메타데이터(RFC 9728) */
const protectedResourceMetadata = () => ({
  resource: resourceUrl(),
  authorization_servers: [authIssuer()],
  bearer_methods_supported: ["header"],
  // offline_access: refresh token을 받아 웹 앱 없이도 연결을 유지한다.
  scopes_supported: ["email", "offline_access"],
  resource_name: "라이프 매니저",
  resource_documentation: "설정 → MCP 연결에서 연결 방법과 연결된 앱을 관리합니다.",
});

function mcpServer(db: SupabaseClient, who: Principal) {
  const server = new Server({ name: "life-manager", version: "0.2.0" }, { capabilities: { tools: {} } });
  server.setRequestHandler(ListToolsRequestSchema, () => ({
    tools: TOOL_DEFS.map((t) => ({
      name: t.name,
      title: t.title,
      description: t.description,
      inputSchema: t.inputSchema as { type: "object"; properties?: Record<string, object>; required?: string[] },
      annotations: { title: t.title, readOnlyHint: !t.write, destructiveHint: Boolean(t.destructive), openWorldHint: false },
    })),
  }));
  server.setRequestHandler(CallToolRequestSchema, async (req: { params: { name: string; arguments?: Record<string, unknown> } }) => {
    const args = (req.params.arguments ?? {}) as Args;
    const { body } = await runTool(db, who, req.params.name, args);
    const r = toolResultText(body);
    return { isError: r.isError, content: [{ type: "text" as const, text: r.text }] };
  });
  return server;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  const path = new URL(req.url).pathname;
  if (path.endsWith("/.well-known/oauth-protected-resource")) return json(protectedResourceMetadata());

  const db = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const raw = bearer(req);
  if (!raw) return unauthorized("라이프 매니저 계정으로 연결해야 합니다.");
  let who: Principal;
  try {
    who = PAT_PATTERN.test(raw) ? await authenticatePat(db, raw) : await authenticateOAuth(db, raw);
  } catch (e) {
    if (e instanceof ApiError && e.code === "UNAUTHORIZED") return unauthorized(e.message);
    return json({ jsonrpc: "2.0", error: { code: -32603, message: (e as Error).message }, id: null }, 502);
  }

  const transport = new WebStandardStreamableHTTPServerTransport({ sessionIdGenerator: undefined, enableJsonResponse: true });
  await mcpServer(db, who).connect(transport);
  return withCors(await transport.handleRequest(req));
});
