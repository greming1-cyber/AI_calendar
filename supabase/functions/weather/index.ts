// Edge Function weather — 기상청 날씨(WTH-01~05, 09)
//
// 호출: supabase.functions.invoke('weather', { body }) — 사용자 JWT 필수(함수가 직접 확인, --no-verify-jwt 배포)
//   body: {}                     → 사용자 기본 위치(profiles.weather_location, 없으면 서울)
//         { lat, lon, label? }   → 위경도를 격자로 바꿔 조회(위경도는 저장하지 않는다)
//         { nx, ny, label? }     → 격자로 조회
// 응답: { ok: true, report: WeatherReport } | { ok: false, message }
// 기상청 호출·캐시는 _shared/kma.ts. 실패해도 캐시·남은 부분으로 보고서를 만든다.
import { createClient } from "npm:@supabase/supabase-js@2";
import { getWeatherReport, isValidGrid, locationFromProfile, toGrid, type WeatherLocationInput } from "../_shared/kma.ts";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...CORS, "Content-Type": "application/json; charset=utf-8" } });

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  const key = Deno.env.get("KMA_SERVICE_KEY");
  if (!key) return json({ ok: false, message: "날씨 인증키가 설정되지 않았어요." }, 500);

  const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const jwt = req.headers.get("Authorization")?.replace(/^Bearer\s+/i, "");
  const { data: auth, error: authError } = jwt ? await admin.auth.getUser(jwt) : { data: null, error: true };
  if (authError || !auth?.user) return json({ ok: false, message: "로그인이 필요합니다." }, 401);

  const body = await req.json().catch(() => ({}));
  const label = typeof body.label === "string" ? body.label.slice(0, 60) : "";
  let loc: WeatherLocationInput;
  if (typeof body.lat === "number" && typeof body.lon === "number") {
    const g = toGrid(body.lat, body.lon);
    if (!isValidGrid(g.nx, g.ny)) return json({ ok: false, message: "기상청 예보 범위 밖의 위치예요." }, 400);
    loc = { ...g, label: label || "현재 위치", isDefault: false };
  } else if (body.nx !== undefined || body.ny !== undefined) {
    if (!isValidGrid(body.nx, body.ny)) return json({ ok: false, message: "격자 좌표가 올바르지 않아요." }, 400);
    loc = { nx: body.nx, ny: body.ny, label: label || `격자 ${body.nx},${body.ny}`, isDefault: false };
  } else {
    const { data: profile } = await admin.from("profiles").select("weather_location").eq("user_id", auth.user.id).maybeSingle();
    loc = locationFromProfile(profile?.weather_location);
  }

  try {
    return json({ ok: true, report: await getWeatherReport(admin, loc, key) });
  } catch (e) {
    console.error("weather", e);
    return json({ ok: false, message: "날씨를 불러오지 못했어요." }, 502);
  }
});
