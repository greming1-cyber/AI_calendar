"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createMcpToken, getMcpStatus, listMcpAuditLogs, listMcpTokens, revokeMcpToken, type McpScope } from "@/lib/data/mcp-tokens";

export const mcpKeys = {
  all: ["mcp"] as const,
  tokens: ["mcp", "tokens"] as const,
  logs: (days: number) => ["mcp", "logs", days] as const,
  status: ["mcp", "status"] as const,
};

export function useMcpTokens() {
  return useQuery({ queryKey: mcpKeys.tokens, queryFn: listMcpTokens });
}

/** 사용 기록(MCP-06). Claude가 쓰는 동안 새 기록이 생기므로 짧게 다시 읽는다 */
export function useMcpAuditLogs(days = 7) {
  return useQuery({ queryKey: mcpKeys.logs(days), queryFn: () => listMcpAuditLogs(days), staleTime: 15_000 });
}

/** 헤더 "Claude 연결됨" 표시용(06이 쓴다): 유효 토큰이 있고 최근 24시간 안에 쓰였는지 */
export function useMcpStatus() {
  return useQuery({ queryKey: mcpKeys.status, queryFn: getMcpStatus, staleTime: 60_000 });
}

export function useCreateMcpToken() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: { name: string; scopes: McpScope[] }) => createMcpToken(input),
    onSettled: () => qc.invalidateQueries({ queryKey: mcpKeys.all }),
  });
}

export function useRevokeMcpToken() {
  const qc = useQueryClient();
  return useMutation({ mutationFn: revokeMcpToken, onSettled: () => qc.invalidateQueries({ queryKey: mcpKeys.all }) });
}
