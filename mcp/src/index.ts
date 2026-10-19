#!/usr/bin/env node
// life-manager-mcp — 라이프 매니저 로컬 stdio MCP 서버.
// DB에 직접 붙지 않고 LIFE_API_URL(Edge Function mcp-api)에 LIFE_TOKEN(PAT)으로만 요청한다.
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { TOOLS } from "./tools.js";

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

const HINTS: Record<string, string> = {
  UNAUTHORIZED: "토큰이 잘못됐거나 폐기됐습니다. 사용자에게 설정 → MCP 연결에서 새 토큰을 발급해 LIFE_TOKEN을 바꾸라고 안내하세요.",
  FORBIDDEN_SCOPE: "이 토큰에 권한이 없습니다. 다른 방법으로 시도하지 말고 사용자에게 권한이 필요하다고 알리세요.",
  NOT_FOUND: "대상을 찾지 못했습니다.",
  VALIDATION: "인자를 고쳐 다시 시도하세요.",
  CONFLICT: "같은 항목이 이미 있습니다.",
  UPSTREAM: "서버 또는 외부 서비스 문제입니다.",
};

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

const header = (r: ApiResponse) => (r.now ? `now: ${r.now} (${r.timezone ?? "Asia/Seoul"})\n` : "");

const server = new McpServer({ name: "life-manager", version: "0.1.0" });

for (const t of TOOLS) {
  server.registerTool(
    t.name,
    {
      title: t.title,
      description: t.description,
      inputSchema: t.input,
      annotations: { readOnlyHint: Boolean(t.readOnly), destructiveHint: Boolean(t.destructive), openWorldHint: false },
    },
    async (args: unknown) => {
      const r = await call(t.name, args);
      if (r.ok) {
        return { content: [{ type: "text" as const, text: `${header(r)}${JSON.stringify(r.data, null, 2)}` }] };
      }
      const lines = [`오류 ${r.code ?? "UPSTREAM"}: ${r.message ?? "알 수 없는 오류"}`];
      if (r.candidates?.length) lines.push(`다음 중 하나로 다시 시도: ${r.candidates.join(", ")}`);
      const hint = r.code && HINTS[r.code];
      if (hint) lines.push(hint);
      return { isError: true, content: [{ type: "text" as const, text: `${header(r)}${lines.join("\n")}` }] };
    },
  );
}

await server.connect(new StdioServerTransport());
console.error(`life-manager-mcp 실행 중 (도구 ${TOOLS.length}개)`);
