-- 세션 05(MCP-07): 원격 MCP(mcp-remote)의 OAuth 연결별 권한
-- - 인가 서버는 Supabase Auth OAuth 2.1 서버(DCR·PKCE·토큰 발급·갱신은 Supabase가 한다).
-- - Supabase 스코프로는 서비스×읽기/쓰기를 나타낼 수 없어, 동의 화면(/oauth/consent)에서 고른 권한을 여기에 둔다.
--   scopes 값은 mcp_tokens.scopes와 같은 체계(events:read, events:write, todos:read, todos:write, tx:read, tx:write, weather:read).
-- - mcp-remote는 액세스 토큰의 sub·client_id로 이 행을 찾고, revoked_at이 있으면 즉시 거부한다.
--   연결 해제는 화면에서 supabase.auth.oauth.revokeGrant(Supabase 세션·refresh token 무효화) 후 revoked_at을 기록한다.
--   다시 동의하면 같은 행을 갱신(revoked_at = null)한다.

create table public.mcp_oauth_grants (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users on delete cascade,
  client_id text not null, -- Supabase OAuth 클라이언트 id(액세스 토큰의 client_id 클레임)
  client_name text not null default '',
  redirect_host text not null default '', -- 동의 화면에 보여 준 리다이렉트 호스트(예: claude.ai, chatgpt.com)
  scopes text[] not null default '{}',
  last_used_at timestamptz,
  revoked_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, client_id)
);

create trigger set_updated_at before update on public.mcp_oauth_grants
  for each row execute function public.set_updated_at();

alter table public.mcp_oauth_grants enable row level security;

create policy "mcp_oauth_grants_select_own" on public.mcp_oauth_grants
  for select to authenticated using (user_id = (select auth.uid()));
create policy "mcp_oauth_grants_insert_own" on public.mcp_oauth_grants
  for insert to authenticated with check (user_id = (select auth.uid()));
create policy "mcp_oauth_grants_update_own" on public.mcp_oauth_grants
  for update to authenticated using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy "mcp_oauth_grants_delete_own" on public.mcp_oauth_grants
  for delete to authenticated using (user_id = (select auth.uid()));

-- 사용 기록: OAuth 연결로 실행한 쓰기는 token_id 대신 client_id에 남긴다.
alter table public.mcp_audit_logs add column client_id text;
