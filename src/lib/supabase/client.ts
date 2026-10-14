"use client";

import { createBrowserClient } from "@supabase/ssr";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "./database.types";
import { SESSION_MAX_AGE, SUPABASE_ANON_KEY, SUPABASE_URL, assertSupabaseEnv } from "./env";

export type Supabase = SupabaseClient<Database>;

let browserClient: Supabase | undefined;

/** 브라우저(클라이언트 컴포넌트·TanStack Query)용. 사용자 JWT로 호출하며 접근 제어는 RLS가 한다. */
export function createClient(): Supabase {
  assertSupabaseEnv();
  browserClient ??= createBrowserClient<Database>(SUPABASE_URL, SUPABASE_ANON_KEY, {
    cookieOptions: { maxAge: SESSION_MAX_AGE },
  });
  return browserClient;
}
