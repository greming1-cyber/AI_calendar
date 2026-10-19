import { NextResponse, type NextRequest } from "next/server";
import { revokeToken } from "@/lib/google/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

/**
 * GCAL-01: 연결 해제(PRD 4.5-6). 토큰 폐기 → 구글 일정 처리 → 계정 삭제(캘린더는 cascade, Vault 토큰은 트리거가 지운다).
 * body: { accountId, keepEvents } — keepEvents면 가져온 일정을 "내 캘린더" 일정으로 남기고, 아니면 지운다.
 */
export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const { data } = await supabase.auth.getUser();
  if (!data.user) return NextResponse.json({ ok: false, message: "로그인이 필요해요." }, { status: 401 });

  const { accountId, keepEvents } = (await request.json().catch(() => ({}))) as { accountId?: string; keepEvents?: boolean };
  const admin = createAdminClient();
  const { data: account } = await admin
    .from("google_accounts")
    .select("id")
    .eq("id", accountId ?? "")
    .eq("user_id", data.user.id)
    .maybeSingle();
  if (!account) return NextResponse.json({ ok: false, message: "연결된 구글 계정을 찾을 수 없어요." }, { status: 404 });

  const { data: token } = await admin.rpc("get_google_refresh_token", { p_account_id: account.id });
  if (token) await revokeToken(token);

  const { data: cals } = await admin.from("google_calendars").select("id").eq("google_account_id", account.id);
  const calIds = (cals ?? []).map((c) => c.id);
  if (calIds.length) {
    const events = admin.from("events");
    const { error } = keepEvents
      ? await events
          .update({ source: "local", google_calendar_id: null, google_event_id: null, google_etag: null, google_updated_at: null, google_dirty: false })
          .in("google_calendar_id", calIds)
      : await events.delete().in("google_calendar_id", calIds);
    if (error) return NextResponse.json({ ok: false, message: "일정 정리에 실패했어요." }, { status: 500 });
  }

  const { error } = await admin.from("google_accounts").delete().eq("id", account.id);
  if (error) return NextResponse.json({ ok: false, message: "연결 해제에 실패했어요." }, { status: 500 });
  return NextResponse.json({ ok: true });
}
