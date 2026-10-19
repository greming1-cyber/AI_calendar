// Edge Function mcp-api — 로컬 MCP 서버(life-manager-mcp)가 부르는 API (MCP-01~06, PRD 4.4)
//
// 요청: POST { tool, args }, 헤더 Authorization: Bearer <PAT(lm_mcp_…)>
// 응답: { ok: true, now, timezone, data } | { ok: false, now?, code, message, candidates? }
//
// 처리 순서
// 1. 토큰 SHA-256 해시로 mcp_tokens를 찾고 폐기 여부를 본다(UNAUTHORIZED). last_used_at을 갱신한다.
// 2. 도구에 필요한 범위를 확인한다(FORBIDDEN_SCOPE).
// 3. 인자를 검증한다(VALIDATION). 날짜는 절대값(ISO 8601)만 받는다.
// 4. service role 클라이언트로 처리하되 모든 쿼리에 user_id = 토큰 소유자 조건을 붙인다.
// 5. 쓰기 도구가 실제로 바꾼 경우(삭제 미리보기 제외) mcp_audit_logs에 남긴다. 실패도 status='error'로 남긴다.
// 2~5는 원격 MCP(mcp-remote)와 같은 _shared/life/run.ts가 한다.
//
// 배포: npx supabase functions deploy mcp-api --no-verify-jwt (JWT 대신 PAT로 인증)
import { createClient } from "npm:@supabase/supabase-js@2";
import { authenticatePat, bearer } from "../_shared/life/auth.ts";
import { type Principal, STATUS, runTool } from "../_shared/life/run.ts";
import { ApiError, type Args } from "../_shared/life/util.ts";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...CORS, "Content-Type": "application/json; charset=utf-8" } });

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return json({ ok: false, code: "VALIDATION", message: "POST로 호출하세요." }, 405);

  const db = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  let who: Principal;
  try {
    who = await authenticatePat(db, bearer(req));
  } catch (e) {
    const err = e instanceof ApiError ? e : new ApiError("UPSTREAM", "토큰 확인 중 오류가 났습니다.");
    return json({ ok: false, code: err.code, message: err.message }, STATUS[err.code] ?? 401);
  }

  const body = await req.json().catch(() => null);
  const name = typeof body?.tool === "string" ? body.tool : "";
  const args: Args = body?.args && typeof body.args === "object" && !Array.isArray(body.args) ? body.args : {};
  const { status, body: out } = await runTool(db, who, name, args);
  return json(out, status);
});
