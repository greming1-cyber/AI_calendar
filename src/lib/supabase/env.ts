// Supabase 공개 설정. 값은 .env.local 에 넣는다(.env.example 참고).
export const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
export const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "";

export const hasSupabaseEnv = () => Boolean(SUPABASE_URL && SUPABASE_ANON_KEY);

export const assertSupabaseEnv = () => {
  if (!hasSupabaseEnv()) {
    throw new Error(".env.local 에 NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY 를 넣어 주세요.");
  }
};

/** AUTH-04: 로그인 유지 30일. 로그아웃하면 refresh token이 서버에서 폐기돼 즉시 만료된다. */
export const SESSION_MAX_AGE = 60 * 60 * 24 * 30;
