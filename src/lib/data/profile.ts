// 내 정보(profiles + 로그인 이메일)
import { createClient } from "@/lib/supabase/client";
import type { Tables } from "@/lib/supabase/database.types";
import type { Profile, WeatherLocation } from "@/lib/types";

export function toProfile(row: Tables<"profiles">, email: string): Profile {
  return {
    id: row.id,
    userId: row.user_id,
    email,
    name: row.name,
    timezone: row.timezone,
    weekStart: row.week_start === 1 ? 1 : 0,
    theme: row.theme as Profile["theme"],
    defaultView: row.default_view as Profile["defaultView"],
    weatherLocation: (row.weather_location as WeatherLocation | null) ?? null,
  };
}

/** 로그인한 사용자의 프로필. 미로그인이면 null */
export async function getProfile(): Promise<Profile | null> {
  const supabase = createClient();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) return null;
  const { data, error } = await supabase.from("profiles").select("*").eq("user_id", auth.user.id).single();
  if (error) throw error;
  return toProfile(data, auth.user.email ?? "");
}

export async function updateProfileName(name: string) {
  const supabase = createClient();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) throw new Error("로그인이 필요해요.");
  const { error } = await supabase.from("profiles").update({ name }).eq("user_id", auth.user.id);
  if (error) throw error;
}

/** 테스트 계정에 시안 예시 데이터를 채운다(기존 일정·할일·가계부 데이터는 지워진다). */
export async function seedDemo() {
  const supabase = createClient();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) throw new Error("로그인이 필요해요.");
  const { error } = await supabase.rpc("seed_demo", { uid: auth.user.id });
  if (error) throw error;
}
