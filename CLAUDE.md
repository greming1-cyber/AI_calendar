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

## 현재 상태

M0 단계: Claude Design 시안(`Life Manager App.dc.html`)을 옮긴 화면이 **예시 데이터로** 동작한다. Supabase·인증·외부 API는 아직 연결하지 않았다.

- `src/app/` — 라우트 `/`(홈), `/calendar`, `/todos`, `/money`, `/settings`. 각 `page.tsx`는 `src/components/<화면>/`의 클라이언트 컴포넌트만 렌더링한다. 공통 셸(사이드바·헤더)은 `layout.tsx`.
- `src/lib/store.tsx` — 화면 간 공유 상태(일정, 할일 완료)를 담은 `StoreProvider`/`useStore`. Supabase 연결 시 이 훅의 구현만 쿼리·뮤테이션으로 바꾸고 화면 코드는 그대로 둔다.
- `src/lib/mock-data.ts` — 예시 데이터. 기준일은 `TODAY`(2026-10-14) 상수이며, 화면은 `new Date()` 대신 이 값을 쓴다.
- `src/lib/money.ts`, `todo.ts`, `date.ts` — 집계·정렬·날짜 계산. 날짜는 `YYYY-MM-DD` 문자열이고 UTC 기준으로 계산해 타임존 영향을 받지 않게 한다.
- 디자인 토큰(색·폰트)은 `globals.css`의 `@theme`, 반복되는 카드·알약 버튼·세그먼트·입력·스위치는 `@layer components`의 `.card`, `.pill`, `.seg`, `.field`, `.switch` 클래스다. 기본 스타일은 `@layer base`에 둬야 유틸리티 클래스가 덮어쓸 수 있다.

- `PRD.md` — 요구사항의 기준 문서. 요구사항 ID(`EVT-01`, `GCAL-04`, `MCP-05` …)와 우선순위(P0=MVP, P1, P2), 데이터 모델(4.3), MCP 도구 명세(4.4), 동기화·날씨 흐름(4.5, 4.6), 로드맵(M0~M5)이 있다.
- `Sitemap.md` — 메뉴 구조와 화면별 기능. 메뉴 번호(2.1, 6.7 …)는 PRD와 화면 구현에서 같은 번호로 참조한다.

기능을 구현·변경할 때는 해당 요구사항 ID를 기준으로 작업하고, 요구사항이 바뀌면 두 문서를 함께 갱신한다.

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

- git 루트는 상위 폴더 `D:\ChaAI`이고, 다른 프로젝트(`02_1page`, `03_blog` 등)와 같은 저장소를 쓴다. 원격: `github.com/greming1-cyber/cal`.
- `core.hooksPath=.githooks`로 설정된 **post-commit 훅이 커밋 직후 자동으로 `git push`** 한다. 커밋은 곧 원격 반영이므로 커밋 전에 내용을 확인한다.
- 루트 `vercel.json`은 정적 사이트용(`framework: null`, `/` → `02_1page/index.html`)이다. 이 프로젝트를 Next.js로 배포하려면 루트 설정을 건드리지 말고 Root Directory를 `06_calendar`로 지정한 별도 Vercel 프로젝트를 쓴다.

## 작성 규칙

- 사용자에게 보이는 문서·안내문·UI 문구는 한국어로 작성한다.
