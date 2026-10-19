// MCP 요청 인증: PAT(lm_mcp_…, mcp_tokens) 또는 Supabase OAuth 2.1 액세스 토큰(mcp_oauth_grants).
// 성공하면 Principal을, 실패하면 ApiError(UNAUTHORIZED)를 던진다. 마지막 사용 시각을 갱신한다.
import type { SupabaseClient } from "npm:@supabase/supabase-js@2";
import type { Principal } from "./run.ts";
import { ApiError } from "./util.ts";

export const PAT_PATTERN = /^lm_mcp_[0-9A-Za-z]{20,64}$/;

export async function sha256Hex(text: string) {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

export const bearer = (req: Request) => req.headers.get("Authorization")?.replace(/^Bearer\s+/i, "").trim() ?? "";

/** 개인 액세스 토큰. 해시로 찾고 폐기 여부를 본다 */
export async function authenticatePat(db: SupabaseClient, raw: string): Promise<Principal> {
  if (!PAT_PATTERN.test(raw)) throw new ApiError("UNAUTHORIZED", "토큰이 없거나 형식이 잘못됐습니다(LIFE_TOKEN 확인).");
  const { data: token, error } = await db
    .from("mcp_tokens")
    .select("id, user_id, scopes, revoked_at")
    .eq("token_hash", await sha256Hex(raw))
    .maybeSingle();
  if (error) throw new ApiError("UPSTREAM", "토큰 확인 중 오류가 났습니다.");
  if (!token || token.revoked_at) {
    throw new ApiError("UNAUTHORIZED", "유효하지 않거나 폐기된 토큰입니다. 설정 → MCP 연결에서 새 토큰을 발급하세요.");
  }
  await db.from("mcp_tokens").update({ last_used_at: new Date().toISOString() }).eq("id", token.id);
  return { userId: token.user_id, scopes: new Set(token.scopes ?? []), tokenId: token.id, clientId: null };
}
