// 날씨 데이터 계층(WTH-01~05). 기상청 호출·캐시는 Edge Function `weather`가 한다.
import { createClient } from "@/lib/supabase/client";
import type { Json } from "@/lib/supabase/database.types";
import type { WeatherLocation, WeatherReport } from "@/lib/types";

/** 사용자 기본 위치(없으면 서울)의 날씨. 함수 오류·네트워크 오류면 예외 */
export async function getWeather(): Promise<WeatherReport> {
  const { data, error } = await createClient().functions.invoke<{ ok: boolean; report?: WeatherReport; message?: string }>("weather", {
    body: {},
  });
  if (error) throw error;
  if (!data?.ok || !data.report) throw new Error(data?.message ?? "날씨를 불러오지 못했어요.");
  return data.report;
}

/** 날씨 기본 위치 저장(profiles.weather_location). null이면 기본 위치(서울)로 되돌린다 */
export async function saveWeatherLocation(location: WeatherLocation | null) {
  const supabase = createClient();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) throw new Error("로그인이 필요해요.");
  const { error } = await supabase
    .from("profiles")
    .update({ weather_location: location as unknown as Json })
    .eq("user_id", auth.user.id);
  if (error) throw error;
}
