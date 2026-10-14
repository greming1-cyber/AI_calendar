import "server-only";

import { createClient } from "@supabase/supabase-js";
import type { Database } from "./database.types";
import { SUPABASE_URL } from "./env";

/**
 * service role 클라이언트. RLS를 우회하므로 서버 코드(라우트 핸들러·서버 액션)에서만,
 * 호출자 본인 확인을 마친 뒤에만 쓴다. 클라이언트 컴포넌트에서 import 하지 않는다.
 */
export function createAdminClient() {
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!SUPABASE_URL || !key) {
    throw new Error(".env.local 에 SUPABASE_SERVICE_ROLE_KEY 를 넣어 주세요.");
  }
  return createClient<Database>(SUPABASE_URL, key, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}
