#!/usr/bin/env node
// life-manager-mcp — 라이프 매니저 로컬 stdio MCP 서버.
// DB에 직접 붙지 않고 LIFE_API_URL(Edge Function mcp-api)에 LIFE_TOKEN(PAT)으로만 요청한다.
// 도구 정의는 원격 MCP(mcp-remote)와 같은 supabase/functions/_shared/life/defs.ts를 빌드 때 복사해 쓴다.
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { CallToolRequestSchema, ListToolsRequestSchema } from "@modelcontextprotocol/sdk/types.js";
import { TOOL_DEFS, toolResultText } from "./generated/defs.js";

const API_URL = process.env.LIFE_API_URL?.trim();
const TOKEN = process.env.LIFE_TOKEN?.trim();

// stdout은 MCP 프로토콜 전용이라 안내는 stderr로 쓴다.
if (!API_URL || !TOKEN) {
  console.error(
    [
      "life-manager-mcp를 시작할 수 없습니다.",
      !API_URL && "- LIFE_API_URL이 없습니다. 예: https://<project>.supabase.co/functions/v1/mcp-api",
      !TOKEN && "- LIFE_TOKEN이 없습니다. 웹 앱 설정 → MCP 연결에서 토큰을 발급해 넣으세요.",
    ]
      .filter(Boolean)
      .join("\n"),
  );
  process.exit(1);
}
if (!/^https?:\/\//.test(API_URL)) {
  console.error(`LIFE_API_URL이 URL이 아닙니다: ${API_URL}`);
  process.exit(1);
}

interface ApiResponse {
  ok: boolean;
  now?: string;
  timezone?: string;
  data?: unknown;
  code?: string;
  message?: string;
  candidates?: string[];
}

async function call(tool: string, args: unknown): Promise<ApiResponse> {
  try {
    const res = await fetch(API_URL!, {
      method: "POST",
      headers: { Authorization: `Bearer ${TOKEN}`, "Content-Type": "application/json" },
      body: JSON.stringify({ tool, args: args ?? {} }),
      signal: AbortSignal.timeout(30_000),
    });
    const text = await res.text();
    try {
      return JSON.parse(text) as ApiResponse;
    } catch {
      return { ok: false, code: "UPSTREAM", message: `API 응답을 읽을 수 없습니다(HTTP ${res.status}): ${text.slice(0, 200)}` };
    }
  } catch (e) {
    return { ok: false, code: "UPSTREAM", message: `API에 연결할 수 없습니다: ${(e as Error).message}` };
  }
}

const server = new Server({ name: "life-manager", version: "0.2.0" }, { capabilities: { tools: {} } });

server.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools: TOOL_DEFS.map((t) => ({
    name: t.name,
    title: t.title,
    description: t.description,
    inputSchema: t.inputSchema,
    annotations: { title: t.title, readOnlyHint: !t.write, destructiveHint: Boolean(t.destructive), openWorldHint: false },
  })),
}));

server.setRequestHandler(CallToolRequestSchema, async (req) => {
  if (!TOOL_DEFS.some((t) => t.name === req.params.name)) {
    return { isError: true, content: [{ type: "text" as const, text: `알 수 없는 도구입니다: ${req.params.name}` }] };
  }
  const r = toolResultText(await call(req.params.name, req.params.arguments));
  return { isError: r.isError, content: [{ type: "text" as const, text: r.text }] };
});

await server.connect(new StdioServerTransport());
console.error(`life-manager-mcp 실행 중 (도구 ${TOOL_DEFS.length}개)`);
