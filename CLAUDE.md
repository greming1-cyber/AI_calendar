# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

> 같은 기준의 도구 중립 문서가 `AGENTS.md`에 있다. 한쪽 규칙을 바꾸면 다른 쪽도 함께 고친다.

## 명령

```powershell
npm run dev      # 개발 서버 (http://localhost:3000)
npm run build    # 프로덕션 빌드 (타입 검사 포함)
npm run lint     # ESLint
```

테스트는 아직 없다. Next.js 16.4 + React 19 + Tailwind v4이며, `next.config.ts`에 `cacheComponents`가 켜져 있다. 학습 데이터와 API가 다를 수 있으니 Next 관련 코드는 `node_modules/next/dist/docs/`를 먼저 확인한다. `next/font/google`은 Tailwind turbopack 로더와 충돌해 빌드가 깨지므로 폰트는 `globals.css`의 `@import url(...)`로 불러온다.

`npm run dev`는 `AGENTS.md` 끝에 Next.js 에이전트 안내 블록(`nextjs-agent-rules` HTML 주석으로 감싼 부분)을 자동으로 넣는다. 지우지 말고 그대로 둔다. 문서 본문에 그 시작 주석을 글자 그대로 적으면 `next dev`가 그 자리부터 파일 끝까지 덮어쓰므로 적지 않는다.

## 현재 상태

세션 00(기반)·01(일정)·02(할일)·03(가계부) 병합, 04의 구글 캘린더 동기화 구현(Supabase 클라우드 `fjnomlibtgpamjkbulif`에 연결). 날씨·MCP는 아직 `mock-data.ts` 예시다. 구글 동기화 구조는 `docs/sessions/04-integrations.md` 10절(`google_dirty` 표시 → Edge Function `gcal-sync`, 15분 pg_cron).

- `src/app/` — 라우트 `/`(홈), `/calendar`, `/todos`, `/money`, `/settings`. 각 `page.tsx`는 `src/components/<화면>/`의 클라이언트 컴포넌트만 렌더링한다. `(auth)/`는 `/login`, `/signup`, `/reset-password`, `/update-password`, `/auth/callback`(이메일 인증·구글 로그인·재설정 링크 처리).
- `src/app/layout.tsx` → `providers.tsx`(TanStack Query, 토스트) → `components/shell/AppShell.tsx`(사이드바·헤더). 화면 본문은 각 `page.tsx`가 `components/shell/Screen.tsx`로 감싸 **브라우저에서만** 그린다. `cacheComponents`가 클라이언트 컴포넌트도 서버에서 미리 렌더하는데, 화면들이 현재 시각과 쿼리 상태를 읽기 때문이다. 이 게이트를 AppShell(레이아웃)에 두면 페이지 세그먼트가 렌더되지 않아 instant navigation 검증 경고("Dropped segment")가 나므로, 새 화면도 `page.tsx` 안에서 `Screen`으로 감싼다. 로그인 화면은 셸 없이 보여 준다.
- `src/proxy.ts` — 요청마다 세션 쿠키를 갱신하고 미로그인 사용자를 `/login?next=…`로 보낸다(Next 16의 middleware 대체). 환경변수가 없으면 인증 없이 통과한다.
- `src/lib/supabase/` — `client.ts`(브라우저), `server.ts`(서버 컴포넌트·라우트 핸들러, `cookies()` 사용), `admin.ts`(service role, 서버 전용), `account-actions.ts`(회원 탈퇴 서버 액션), `database.types.ts`(DB 타입).
- **데이터 계층**: 화면 → `src/lib/hooks/use-<도메인>.ts`(TanStack Query 훅) → `src/lib/data/<도메인>.ts`(Supabase 쿼리, DB 행 ↔ 화면 타입 변환 `toEvent` 등) → Supabase(RLS).
  - 쿼리 키는 도메인명이 첫 원소다: `['events', from, to, tz]`, `['todos', filter]`, `['transactions', from, to]`, `['budgets', 'YYYY-MM']`, `['profile']` 등. 쓰기 후에는 도메인 키 전체(`['events']`)를 무효화한다.
  - 조회 함수·훅의 기존 시그니처는 공유 계약이라 바꾸지 않는다. 필요하면 선택 인자나 새 함수를 추가한다.
- `src/lib/types/` — 도메인별 화면 타입(`common`, `events`, `todos`, `money`). `@/lib/types`가 모두 다시 내보낸다.
- 오늘 날짜는 `useToday()`(사용자 타임존 `profiles.timezone` 기준 `YYYY-MM-DD`)를 쓴다. `new Date()`로 날짜를 만들지 않는다. timestamptz ↔ 날짜·시각 변환은 `date.ts`의 `zonedParts`, `zonedToUtc`.
- `src/lib/money.ts`, `todo.ts`, `date.ts` — 집계·정렬·날짜 계산. 날짜는 `YYYY-MM-DD` 문자열이고 UTC 기준으로 계산해 타임존 영향을 받지 않게 한다.
- 공용 UI는 `src/components/ui/`(`CardHead`, `ProgressBar`, `Switch`, `Segmented`, `Modal`, `useToast`, `LoadingState`, `ErrorState`)이고 `@/components/ui`로 가져온다. 설정 화면은 탭별 파일(`components/settings/*Tab.tsx`)로 나뉘어 있다.
- 디자인 토큰(색·폰트)은 `globals.css`의 `@theme`, 반복되는 카드·알약 버튼·세그먼트·입력·스위치는 `@layer components`의 `.card`, `.pill`, `.seg`, `.field`, `.switch` 클래스다. 기본 스타일은 `@layer base`에 둬야 유틸리티 클래스가 덮어쓸 수 있다.

## Supabase

- 환경변수: `.env.example`을 `.env.local`로 복사해 `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`(서버 전용)를 채운다. `.env.local`은 커밋하지 않는다.
- 스키마는 `supabase/migrations/0001_init.sql`(PRD 4.3 전체 테이블, RLS, 가입 트리거 `handle_new_user`, `seed_demo`). 적용한 마이그레이션은 고치지 않고 새 파일을 추가한다(`docs/sessions/README.md` 5절).
- 명령(main 작업 폴더에서):
  ```powershell
  npx supabase link --project-ref <ref>
  npx supabase db push                                                    # 마이그레이션 적용
  npx supabase gen types typescript --linked > src/lib/supabase/database.types.ts
  npx supabase functions deploy <이름>                                    # Edge Function 배포
  ```
- 테스트 계정은 세션마다 따로 만든다(예: `dev+calendar@…`). 시안과 같은 예시 데이터는 설정 → 내 정보 → "예시 데이터 채우기" 또는 SQL `select public.seed_demo('<user uuid>');`로 넣는다. 그 사용자의 일정·할일·가계부 내역·고정지출·예산을 **지우고** 오늘 날짜 기준으로 다시 넣는다.
- 클라이언트 insert는 `user_id`를 생략해도 된다(기본값 `auth.uid()`).
- `PRD.md` — 요구사항의 기준 문서. 요구사항 ID(`EVT-01`, `GCAL-04`, `MCP-05` …)와 우선순위(P0=MVP, P1, P2), 데이터 모델(4.3), MCP 도구 명세(4.4), 동기화·날씨 흐름(4.5, 4.6), 로드맵(M0~M5)이 있다.
- `Sitemap.md` — 메뉴 구조와 화면별 기능. 메뉴 번호(2.1, 6.7 …)는 PRD와 화면 구현에서 같은 번호로 참조한다.

기능을 구현·변경할 때는 해당 요구사항 ID를 기준으로 작업하고, 요구사항이 바뀌면 두 문서를 함께 갱신한다.

여러 세션이 나눠 개발할 때는 `docs/sessions/README.md`의 웨이브 순서(00 기반 → 01~05 병렬 → 06 통합)를 따른다. 작업을 시작하기 전에 README와 자기 세션 문서(`docs/sessions/0N-*.md`)를 읽고, 그 문서의 소유 파일만 수정한다.

## 계획된 아키텍처 (PRD 4장 요약)

일정·할일·가계부 통합 개인 서비스. 세 개의 진입점이 같은 Supabase 백엔드를 공유한다.

- **웹 앱**: Next.js(App Router) + TypeScript, Tailwind + shadcn/ui, FullCalendar, Recharts, TanStack Query. 사용자 JWT로 supabase-js를 직접 호출하며 접근 제어는 전적으로 **RLS(`user_id = auth.uid()`)**에 의존한다.
- **Supabase**: Auth(이메일, Google), Postgres, Edge Functions, pg_cron, Realtime, Vault.
  - `mcp-api` — PAT(SHA-256 해시 저장, 범위 `events/todos/tx/weather × read/write`) 검증 후 데이터 처리
  - `gcal-sync` — 구글 캘린더 증분 동기화(syncToken, 15분 pg_cron) 및 내보내기(etag 비교로 충돌 감지 → `sync_conflicts`)
  - `weather` — 기상청 API 호출, 공용 `weather_cache`(user_id 없음, service role만 쓰기)
- **MCP 서버**: TypeScript + `@modelcontextprotocol/sdk`, 로컬 stdio 실행. DB에 직접 붙지 않고 `LIFE_API_URL`(= `mcp-api`)과 `LIFE_TOKEN`(PAT)으로만 통신한다.

여러 파일에 걸쳐 지켜야 하는 설계 결정:
- 구글 캘린더 연동은 **로그인과 별도의 OAuth 흐름**이다. Supabase Auth의 provider token은 자동 갱신되지 않으므로 refresh token을 `google_accounts`(Vault 암호화)에 직접 저장·갱신한다.
- 구글 출처 일정도 `events` 테이블에 `source='google'`, `google_event_id`(유니크), `google_etag`로 함께 저장한다.
- MCP 도구는 절대 날짜(ISO 8601)만 받고 상대 날짜 해석은 Claude에게 맡긴다. 모든 응답에 사용자 타임존 기준 `now`를 포함한다.
- MCP 삭제 도구는 `confirm: true`일 때만 삭제하고, 그 외에는 대상 요약만 반환한다. 분류·프로젝트 등은 이름으로 받아 서버에서 찾고, 없으면 새로 만들지 않고 후보를 반환한다.
- 금액은 원 단위 `bigint`, 일시는 `timestamptz`, 반복은 RRULE 문자열, 기본 타임존 `Asia/Seoul`.

## 저장소 환경

- 이 폴더는 **독립 git 저장소**다(원격 `github.com/greming1-cyber/AI_calendar`, 브랜치 `main`). 상위 `D:\ChaAI` 저장소는 `.gitignore`로 이 폴더를 제외한다.
- 상위 저장소의 자동 push 훅(`.githooks/post-commit`)은 이 저장소에 적용되지 않는다. push는 직접 한다.
- 상위 폴더의 `vercel.json`(정적 사이트용)과 무관하다. Vercel 배포는 이 저장소를 그대로 연결한다.

## 작성 규칙

- 사용자에게 보이는 문서·안내문·UI 문구는 한국어로 작성한다.
