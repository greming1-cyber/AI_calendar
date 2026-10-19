import { createHash, randomBytes } from "node:crypto";
import { NextResponse, type NextRequest } from "next/server";
import { MCP_SCOPES, type McpScope } from "../scopes";
import { createClient } from "@/lib/supabase/server";

const BASE62 = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz";

/** 랜덤 32바이트를 base62로(약 43자) */
function base62(bytes: Buffer) {
  let n = BigInt(`0x${bytes.toString("hex")}`);
  let out = "";
  while (n > 0n) {
    out = BASE62[Number(n % 62n)] + out;
    n /= 62n;
  }
  return out.padStart(43, "0");
}

/**
 * MCP-01·02: 개인 액세스 토큰 발급. body: { name, scopes }
 * 원문(lm_mcp_…)은 이 응답으로 한 번만 돌려주고, DB에는 SHA-256 해시와 앞·뒤 4자리만 저장한다.
 * 사용자 세션으로 insert하므로 RLS(user_id = auth.uid())가 그대로 적용된다.
 */
export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const { data } = await supabase.auth.getUser();
  if (!data.user) return NextResponse.json({ ok: false, message: "로그인이 필요해요." }, { status: 401 });

  const body = (await request.json().catch(() => ({}))) as { name?: unknown; scopes?: unknown };
  const name = typeof body.name === "string" ? body.name.trim() : "";
  if (!name || name.length > 50) return NextResponse.json({ ok: false, message: "토큰 이름을 1~50자로 입력해 주세요." }, { status: 400 });
  const scopes = Array.isArray(body.scopes) ? [...new Set(body.scopes)] : [];
  if (!scopes.length || scopes.some((s) => !MCP_SCOPES.includes(s as McpScope))) {
    return NextResponse.json({ ok: false, message: "권한을 하나 이상 골라 주세요." }, { status: 400 });
  }

  const body62 = base62(randomBytes(32));
  const token = `lm_mcp_${body62}`;
  const { data: row, error } = await supabase
    .from("mcp_tokens")
    .insert({
      user_id: data.user.id,
      name,
      token_hash: createHash("sha256").update(token).digest("hex"),
      token_prefix: `lm_mcp_${body62.slice(0, 4)}…${body62.slice(-4)}`,
      scopes: scopes as string[],
    })
    .select("id")
    .single();
  if (error) return NextResponse.json({ ok: false, message: "토큰을 만들지 못했어요." }, { status: 500 });
  return NextResponse.json({ ok: true, id: row.id, token });
}
