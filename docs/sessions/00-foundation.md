# 세션 00 — 기반 (Supabase · 인증 · 데이터 계층)

> 웨이브 1, **단독 진행**. 이 세션이 main에 병합돼야 01~05를 시작할 수 있다. 공통 규칙은 [README.md](README.md)를 따른다.

## 1. 목표

예시 데이터로 돌아가는 현재 화면을 **Supabase 실데이터 + 로그인** 구조로 바꾼다. 그리고 웨이브 2 세션들이 서로 파일을 건드리지 않고 병렬로 작업할 수 있도록 다음을 미리 깔아 둔다.
- 전체 DB 스키마
- 데이터 계층 패턴
- 공용 UI
- 파일 분리

| 요구사항    | 내용                                  | 우선순위 |
| ------- | ----------------------------------- | ---- |
| AUTH-01 | 이메일·비밀번호 회원가입, 이메일 인증               | P0   |
| AUTH-02 | 구글 로그인                              | P0   |
| AUTH-03 | 비밀번호 재설정 메일                         | P0   |
| AUTH-04 | 세션 30일 유지, 로그아웃 즉시 만료               | P0   |
| AUTH-05 | 회원 탈퇴 시 모든 데이터 삭제                   | P1   |
| SET-01  | 내 정보(이름, 이메일 확인, 비밀번호 변경)           | P0   |
| (공통)    | PRD 4.3 전체 스키마 + RLS, 데이터 계층, 공용 UI | P0   |

## 2. 선행 조건

- Supabase 클라우드 프로젝트를 만든다(사람이 supabase.com에서 생성). 리전은 서울(ap-northeast-2)을 권장한다.
- 아래 값을 받아 둔다.
  - Project URL, anon key, service_role key
  - DB 비밀번호
- Google Cloud 콘솔에 OAuth 클라이언트를 만든다(로그인용). 승인된 리디렉션 URI는 `https://<project>.supabase.co/auth/v1/callback`이다.
  - 캘린더 권한은 04 세션이 따로 추가한다.

## 3. 작업 환경

- main 작업 폴더 `D:\ChaAI\06_calendar`에서 `git switch -c feat/foundation` (00만 worktree 없이 진행)
- 개발 서버: `npm run dev` (포트 3000)

## 4. 소유 파일

**새로 만들거나 수정한다**
- `supabase/` 전체 (config, `migrations/0001_init.sql`, `seed/`)
- `src/lib/supabase/**`, `src/proxy.ts`
- `src/app/(auth)/**` (로그인·가입·재설정·콜백)
- `src/lib/types/**`, `src/lib/data/**`, `src/lib/hooks/**`: 뼈대와 조회 함수까지. 쓰기 기능은 각 세션이 채운다.
- `src/components/ui/**` (`ui.tsx`를 폴더로 옮김), `src/components/shell/**`
- `src/components/settings/` 탭 파일 분리, 내 정보 탭
- `tsconfig.json`, `eslint.config.mjs`, `next.config.ts`, `package.json`, `.env.example`, `.gitignore`
- `CLAUDE.md`, `AGENTS.md` (작업 결과 반영)

**건드리지 않는다**
- 각 화면의 기능 확장: 01~06 담당. 이 세션은 화면이 실데이터를 **읽어서 보여 주는 데까지만** 바꾼다.

## 5. 작업 상세

### 5.1 패키지와 환경변수
- [x] `npm i @supabase/supabase-js @supabase/ssr @tanstack/react-query`
- [x] `npm i -D supabase`를 설치한 뒤 `npx supabase init`, `npx supabase link --project-ref <ref>` — link는 Supabase 프로젝트 생성 후(키 대기)
- [x] `.env.example` 작성. 실제 값은 `.env.local`에만 넣고 커밋하지 않는다.
  ```
  NEXT_PUBLIC_SUPABASE_URL=
  NEXT_PUBLIC_SUPABASE_ANON_KEY=
  SUPABASE_SERVICE_ROLE_KEY=      # 서버 전용, 클라이언트 코드에서 import 금지
  ```
- [x] `tsconfig.json`의 `exclude`에 `supabase/functions`, `mcp`를 추가한다. 둘 다 Deno·별도 패키지라 Next 타입 검사에서 깨진다. `eslint.config.mjs`의 ignore에도 같은 경로를 추가한다.

### 5.2 스키마 — `supabase/migrations/0001_init.sql`
PRD 4.3의 **모든 테이블**을 한 번에 만든다. 웨이브 2가 스키마를 바꾸지 않아도 되게 하는 것이 목표다.
- [x] 공통 컬럼과 트리거
  - 공통 컬럼: `id uuid default gen_random_uuid()`, `user_id uuid references auth.users on delete cascade`, `created_at`, `updated_at`
  - `updated_at` 자동 갱신 트리거
- [x] 테이블
  - 프로필·일정: `profiles`, `event_categories`, `events`
  - 할일: `projects`, `todos`
  - 가계부: `tx_categories`, `payment_methods`, `transactions`, `recurring_transactions`, `budgets`
  - 구글 연동: `google_accounts`, `google_calendars`, `sync_conflicts`
  - 날씨: `weather_cache`
  - MCP: `mcp_tokens`, `mcp_audit_logs`
  - 알림: `notifications`
- [x] 컬럼 규칙: 금액은 `bigint`, 일시는 `timestamptz`, 날짜는 `date`, 반복은 `rrule text`, 열거형은 `check` 제약
- [x] `events`: `source in ('local','google')`, `(user_id, google_event_id)` 유니크, `deleted_at` 소프트 삭제
- [x] `todos`: `parent_id`(서브태스크), `event_id`(일정 연결), `rrule`
- [x] `transactions`: `via_mcp boolean` 추가. 화면의 "· Claude" 표시에 쓴다.
- [x] 인덱스: `events(user_id, start_at)`, `todos(user_id, due_date)`, `transactions(user_id, occurred_on)`
- [x] **RLS**: 사용자 테이블 전부에 `user_id = auth.uid()` 정책을 select/insert/update/delete별로 만든다.
  - `weather_cache`는 사용자 정책 없이 service role 전용으로 둔다.
  - `google_accounts.refresh_token`은 클라이언트에서 조회하지 못하게 한다. Vault로 옮기거나, 해당 컬럼을 제외한 view를 쓰거나, 컬럼 권한을 회수한다.
- [x] 회원가입 트리거 `handle_new_user()`: `profiles`를 만들고 기본 데이터를 넣는다.
  - 기본 일정 카테고리: 업무·개인·가족·운동
  - 기본 가계부 분류: 식비·카페·교통·주거·통신·쇼핑·의료·문화·경조사·기타 / 급여·부수입·기타
  - 기본 결제수단: 현금·카드·계좌
  - 기본 프로젝트: 업무·개인·가족
- [x] 데모 데이터 함수 `seed_demo(uid uuid)`: 현재 `src/lib/mock-data.ts`의 일정·할일·거래·예산을 그 사용자에게 넣는다. 날짜는 실행일 기준으로 옮긴다. 세션마다 테스트 계정을 채울 때 쓴다.
- [ ] (키 대기) `npx supabase db push`로 적용한 뒤 타입을 생성한다. 지금 `database.types.ts`는 마이그레이션을 PGlite에 적용해 만든 임시본이다: `npx supabase gen types typescript --linked > src/lib/supabase/database.types.ts`

### 5.3 Supabase 클라이언트와 인증
- [x] `src/lib/supabase/client.ts`(브라우저)와 `server.ts`(서버 컴포넌트·라우트 핸들러)를 `@supabase/ssr` 방식으로 만든다.
- [x] `src/proxy.ts`: 요청마다 세션을 갱신하고, 미로그인 사용자를 `/login`으로 보낸다.
  - Next 16은 `middleware`가 `proxy`로 바뀌었으니 `node_modules/next/dist/docs`에서 확인한다.
- [x] `src/app/(auth)/`에 만들 것
  - 화면: `login`, `signup`, `reset-password`, `update-password`
  - 라우트: `auth/callback`
  - 디자인은 기존 카드·필드·알약 버튼 클래스를 쓴다.
- [x] 구글 로그인 버튼(Supabase OAuth). 캘린더 권한은 요청하지 않는다(04 담당).
- [x] 로그아웃: 헤더 프로필을 누르면 메뉴가 열린다. 헤더의 이름은 실제 `profiles.name`으로 바꾼다.
- [x] `cacheComponents` 환경에서 쿠키를 읽는 서버 코드는 `Suspense` 경계가 필요하다. 문서를 확인하고 레이아웃 구조를 정리한다.

### 5.4 데이터 계층 패턴
웨이브 2가 따라 할 기준 구현이다.
- [x] `src/lib/types/`: 현재 `src/lib/types.ts`를 도메인별 파일로 나눈다.
  - `events.ts`, `todos.ts`, `money.ts`, `common.ts`
  - 기존 `@/lib/types` 경로는 `index.ts`가 다시 내보내게 해서 깨지지 않게 한다.
- [x] `src/lib/data/<domain>.ts`: Supabase 쿼리 함수
  - DB 행 ↔ 화면 타입 변환(`toEvent(row)` 등)을 여기에 둔다.
  - **조회 함수만** 만든다: `listEvents(from, to)`, `listEventCategories()`, `listTodos()`, `listProjects()`, `listTransactions(from, to)`, `listBudgets(month)`, `listTxCategories()`, `listPaymentMethods()`
- [x] `src/lib/hooks/use-<domain>.ts`: TanStack Query 훅
  - `useEvents(range)`, `useTodos(filter?)`, `useTransactions(range)` 등
  - 쿼리 키 규칙: `['events', from, to]`처럼 도메인명을 첫 원소로 한다.
- [x] `src/app/providers.tsx`에 `QueryClientProvider`를 두고 `layout.tsx`에서 감싼다.
- [x] 오늘 날짜: `TODAY` 상수 대신 `useToday()` 훅을 만든다(사용자 타임존 기준 `YYYY-MM-DD`).
- [x] 기존 화면(홈·캘린더·할일·가계부)이 `useStore()` 대신 새 훅으로 **읽기**를 하도록 바꾼다.
  - 쓰기 동작(일정 저장, 할일 완료)은 각 데이터 파일에 `// TODO(01/02)` 주석과 함께 최소 구현만 둔다.
  - 일정 저장·삭제, 할일 완료 토글은 화면이 계속 동작하도록 간단한 insert/update로 연결해 둔다.
- [x] `src/lib/store.tsx`의 사용처를 모두 없앤다. `mock-data.ts`에는 아직 실데이터가 없는 날씨·구글·MCP 예시만 남긴다(04·05·06이 제거).

### 5.5 공용 UI와 파일 분리
- [x] `src/components/ui.tsx`를 `src/components/ui/` 폴더로 옮긴다.
  - `card-head.tsx`, `progress-bar.tsx`, `switch.tsx`, `segmented.tsx`, `index.ts`
  - 기존 import 경로 `@/components/ui`는 그대로 동작하게 한다.
- [x] **모달 셸** `ui/modal.tsx`: `EventModal`의 바깥(배경, Esc로 닫기, 포커스, 제목)을 떼어 공용으로 만든다. 01·02·03이 등록 모달을 만들 때 쓴다.
- [x] **토스트** `ui/toast.tsx`: 저장·삭제·오류 알림. `useToast()`
- [x] 설정 화면을 탭별 파일로 나눈다. 웨이브 2가 같은 파일을 동시에 고치지 않게 하기 위해서다.
  - `SettingsView.tsx`(탭 목록만)
  - `ProfileTab.tsx`(00), `NotificationsTab.tsx`(06), `GoogleTab.tsx`(04), `WeatherTab.tsx`(04), `McpTab.tsx`(05)
  - Sitemap 6.1의 "내 정보" 탭을 추가한다.
- [x] `ProfileTab`: 이름 수정, 이메일 표시, 비밀번호 변경, 회원 탈퇴(AUTH-05: 확인 입력 후 삭제. 서버에서 service role로 `auth.admin.deleteUser`)

### 5.6 문서
- [x] `CLAUDE.md`·`AGENTS.md`에 반영할 내용
  - 데이터 계층 구조, 환경변수, Supabase 명령(`db push`, `gen types`, `functions deploy`)
  - 테스트 계정·`seed_demo` 사용법
- [x] README의 파일 소유 표와 실제 경로가 다르면 README를 고친다.

## 6. 다른 세션과의 계약

| 제공하는 것 | 사용하는 세션 |
|---|---|
| 전체 스키마 + `database.types.ts` | 전부 |
| `createClient()` (client/server) | 전부 |
| `list*` 조회 함수와 `use*` 훅의 시그니처 (바꾸지 않음) | 01·02·03·06 |
| `Modal`, `useToast`, 기존 `CardHead`·`ProgressBar`·`Switch`·`Segmented` | 전부 |
| 설정 탭 파일 분리 | 04·05·06 |
| `useToday()` | 전부 |
| `seed_demo(uid)` | 전부(테스트) |

## 7. 완료 기준

- [ ] 신규 가입 → 메일 인증 → 로그인 → 홈에 기본 카테고리가 보이고, `seed_demo`를 실행하면 기존 시안과 같은 화면이 나온다.
- [ ] 다른 계정으로 로그인하면 앞 계정의 데이터가 보이지 않는다(RLS 확인).
- [ ] 로그아웃 후 `/`에 접근하면 `/login`으로 이동한다.
- [ ] 캘린더에서 일정 추가·수정·삭제, 할일 완료 토글이 새로고침 후에도 유지된다.
- [x] `store.tsx`를 import하는 곳이 없다.
- [x] `npm run build`, `npm run lint`를 통과한다.
- [x] README 4절의 소유 경로가 실제 파일 구조와 일치한다.

## 8. 세션 시작 프롬프트

```
docs/sessions/README.md 와 docs/sessions/00-foundation.md 를 읽고 세션 00(기반) 작업을 진행해.
Supabase 프로젝트 URL·키는 내가 .env.local 에 넣어 둘게. 작업 순서는 문서 5장 순서를 따르고,
각 단계가 끝날 때마다 완료 기준을 확인한 뒤 다음으로 넘어가.
```

## 9. 요청 사항
(다른 세션이 이 세션에 요청할 내용을 여기에 적는다)
