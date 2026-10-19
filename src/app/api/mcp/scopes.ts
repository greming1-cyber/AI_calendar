// MCP 토큰 권한 범위(MCP-02). 서버 라우트와 화면(lib/data/mcp-tokens.ts)이 함께 쓴다.
// Edge Function mcp-api의 도구별 범위 표와 같아야 한다.
export const MCP_SCOPES = ["events:read", "events:write", "todos:read", "todos:write", "tx:read", "tx:write", "weather:read"] as const;
export type McpScope = (typeof MCP_SCOPES)[number];
