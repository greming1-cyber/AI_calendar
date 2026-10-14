# AGENTS.md

이 저장소에서 작업하는 AI 코딩 에이전트(Codex, Gemini CLI, Cursor 등)를 위한 안내서. Claude Code용 안내는 `CLAUDE.md`에 있으며 내용은 같은 기준을 따른다.

## 프로젝트

일정관리 · 할일관리 · 가계부를 하나로 묶은 개인용 서비스 "라이프 매니저". 구글 캘린더 동기화, 날씨 정보, Claude(MCP) 연동을 제공한다.

## 명령

```powershell
npm run dev      # 개발 서버 (http://localhost:3000)
npm run build    # 프로덕션 빌드 (타입 검사 포함)
npm run lint     # ESLint
```

테스트는 아직 없다. Next.js 16.4 + React 19 + Tailwind v4이며, `next.config.ts`에 `cacheComponents`가 켜져 있다. 학습 데이터와 API가 다를 수 있으니 Next 관련 코드는 `node_modules/next/dist/docs/`를 먼저 확인한다. `next/font/google`은 Tailwind turbopack 로더와 충돌해 빌드가 깨지므로 폰트는 `globals.css`의 `@import url(...)`로 불러온다.

## 현재 상태

M0 단계: Claude Design 시안(`Life Manager App.dc.html`)을 옮긴 화면이 **예시 데이터로** 동작한다. Supabase·인증·외부 API는 아직 연결하지 않았다.

- `src/app/` — 라우트 `/`(홈), `/calendar`, `/todos`, `/money`, `/settings`. 각 `page.tsx`는 `src/components/<화면>/`의 클라이언트 컴포넌트만 렌더링한다. 공통 셸(사이드바·헤더)은 `layout.tsx`.
- `src/lib/store.tsx` — 화면 간 공유 상태(일정, 할일 완료)를 담은 `StoreProvider`/`useStore`. Supabase 연결 시 이 훅의 구현만 쿼리·뮤테이션으로 바꾸고 화면 코드는 그대로 둔다.
- `src/lib/mock-data.ts` — 예시 데이터. 기준일은 `TODAY`(2026-10-14) 상수이며, 화면은 `new Date()` 대신 이 값을 쓴다.
- `src/lib/money.ts`, `todo.ts`, `date.ts` — 집계·정렬·날짜 계산. 날짜는 `YYYY-MM-DD` 문자열이고 UTC 기준으로 계산해 타임존 영향을 받지 않게 한다.
- 디자인 토큰(색·폰트)은 `globals.css`의 `@theme`, 반복되는 카드·알약 버튼·세그먼트·입력·스위치는 `@layer components`의 `.card`, `.pill`, `.seg`, `.field`, `.switch` 클래스다. 기본 스타일은 `@layer base`에 둬야 유틸리티 클래스가 덮어쓸 수 있다.
- `npm run dev`는 이 파일 끝에 Next.js 에이전트 안내 블록(`<!-- BEGIN:nextjs-agent-rules -->`)을 자동으로 추가할 수 있다. 지우지 말고 그대로 둔다.

| 문서 | 역할 |
|---|---|
| `PRD.md` | 요구사항의 기준 문서. 요구사항 ID(`EVT-01`, `GCAL-04`, `MCP-05` …)와 우선순위(P0=MVP, P1, P2), 데이터 모델(4.3), MCP 도구 명세(4.4), 동기화·날씨 흐름(4.5, 4.6), 로드맵(M0~M5) |
| `Sitemap.md` | 메뉴 구조와 화면별 기능. 메뉴 번호(2.1, 6.7 …)는 PRD와 화면 구현에서 같은 번호로 참조 |
| `CLAUDE.md` | Claude Code용 안내 (이 문서와 같은 기준) |

기능을 구현·변경할 때는 해당 요구사항 ID를 기준으로 작업하고, 요구사항이 바뀌면 `PRD.md`와 `Sitemap.md`를 함께 갱신한다. 이 문서의 규칙을 바꾸면 `CLAUDE.md`도 같이 고친다.

## 작업 순서 (PRD 7장 로드맵)

| 단계 | 범위 |
|---|---|
| M0 | Supabase 스키마·RLS, Next.js 기본 레이아웃, 인증 |
| M1 | 일정·할일·가계부 P0 기능, 홈 대시보드 |
| M2 | 구글 캘린더 연동, 날씨 |
| M3 | `mcp-api` Edge Function, MCP 서버, 토큰 관리 화면 |
| M4 | P1 전체 |

여러 세션이 나눠 개발할 때는 이 순서 대신 `docs/sessions/README.md`의 웨이브 순서(00 기반 → 01~05 병렬 → 06 통합)를 따른다. 작업을 시작하기 전에 README와 자기 세션 문서(`docs/sessions/0N-*.md`)를 읽고, 그 문서의 소유 파일만 수정한다.

## 아키텍처

세 개의 진입점이 같은 Supabase 백엔드를 공유한다.

```
웹 앱 (Next.js) ──(사용자 JWT, RLS)──> Supabase ──> Google Calendar API
MCP 서버 (로컬 stdio) ──(PAT)──> Edge Function mcp-api      └─> 기상청 API
```

- **웹 앱**: Next.js(App Router) + TypeScript, Tailwind + shadcn/ui, FullCalendar, Recharts, TanStack Query. 사용자 JWT로 supabase-js를 직접 호출하며 접근 제어는 **RLS(`user_id = auth.uid()`)**에 맡긴다. 서비스 키는 브라우저 코드에 넣지 않는다.
- **Supabase**: Auth(이메일, Google), Postgres, Edge Functions, pg_cron, Realtime, Vault.
  - `mcp-api`: PAT 검증(SHA-256 해시 비교, 범위 `events/todos/tx/weather × read/write`) 후 데이터 처리
  - `gcal-sync`: 구글 캘린더 증분 가져오기(syncToken, pg_cron 15분)와 내보내기(etag 비교로 충돌 감지 → `sync_conflicts`)
  - `weather`: 기상청 API 호출, 공용 `weather_cache`(user_id 없음, service role만 쓰기)
- **MCP 서버**: TypeScript + `@modelcontextprotocol/sdk`. DB에 직접 접속하지 않고 `LIFE_API_URL`(= `mcp-api`)과 `LIFE_TOKEN`(PAT)으로만 통신한다.

## 지켜야 할 설계 규칙

- **데이터 형식**: 금액은 원 단위 `bigint`, 일시는 `timestamptz`, 반복은 RRULE 문자열, 기본 타임존 `Asia/Seoul`.
- **테이블 공통 컬럼**: `id uuid`, `user_id`, `created_at`, `updated_at`. 새 사용자 테이블에는 반드시 RLS 정책을 함께 만든다.
- **구글 캘린더**: 로그인과 별도의 OAuth 흐름으로 연동한다. Supabase Auth의 provider token은 자동 갱신되지 않으므로 refresh token을 `google_accounts`(Vault 암호화)에 직접 저장·갱신한다. 구글 출처 일정도 `events`에 `source='google'`, `google_event_id`(유니크), `google_etag`로 저장한다.
- **MCP 도구**
  - 날짜는 절대값(ISO 8601)만 받는다. 상대 날짜("내일") 해석은 Claude가 하며, 모든 응답에 사용자 타임존 기준 `now`를 포함한다.
  - 삭제 도구는 `confirm: true`일 때만 삭제하고, 그 외에는 삭제 대상 요약만 반환한다.
  - 분류·결제수단·카테고리·프로젝트는 이름으로 받아 서버에서 찾는다. 없으면 새로 만들지 않고 후보 목록을 반환한다.
  - 오류는 `code`(UNAUTHORIZED, FORBIDDEN_SCOPE, NOT_FOUND, VALIDATION, CONFLICT, UPSTREAM)와 메시지로 반환한다.
- **외부 API 장애**: 구글·기상청이 실패해도 일정·할일·가계부 기본 기능은 동작해야 한다. 날씨는 만료된 캐시라도 업데이트 시각과 함께 보여준다.

## 저장소 환경

- 이 폴더는 **독립 git 저장소**다(원격 `github.com/greming1-cyber/AI_calendar`, 브랜치 `main`). 상위 `D:\ChaAI` 저장소는 `.gitignore`로 이 폴더를 제외한다. 이 폴더 밖의 파일은 수정하지 않는다.
- 상위 저장소의 자동 push 훅(`.githooks/post-commit`)은 이 저장소에 적용되지 않는다. push는 직접 한다.
- 상위 폴더의 `vercel.json`(정적 사이트용)과 무관하다. Vercel 배포는 이 저장소를 그대로 연결한다.
- 개발 환경은 Windows + PowerShell이다.

## 작성 규칙

- 문서, UI 문구, 사용자 안내는 한국어로 작성한다. 코드 식별자와 테이블·컬럼명은 영어 snake_case(DB)·camelCase(TS)를 쓴다.

<!-- BEGIN:nextjs-agent-rules -->

## This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->
