# 병렬 세션 개발 가이드

라이프 매니저를 Claude Code 세션 여러 개로 나눠 동시에 개발하기 위한 안내서다. 세션마다 자기 문서(`00`~`06`)를 읽고, 이 README의 공통 규칙을 따른다.

- 요구사항 기준: [`PRD.md`](../../PRD.md) (요구사항 ID), [`Sitemap.md`](../../Sitemap.md) (메뉴 번호)
- 현재 상태: 00(기반)이 끝나면 로그인과 Supabase 실데이터로 동작한다. 일정·할일·가계부·구글·MCP·날씨 모두 실데이터다(`mock-data.ts`는 04 날씨 연결 때 지웠다). 구조는 `CLAUDE.md`의 "현재 상태"를 본다.

---

## 1. 세션 구성

| 세션 | 문서 | 담당 요구사항 | 브랜치 | 개발 포트 |
|---|---|---|---|---|
| 00 기반 | [00-foundation.md](00-foundation.md) | AUTH-01~05, SET-01, 데이터 계층·스키마 전체 | `feat/foundation` | 3000 |
| 01 일정 | [01-calendar.md](01-calendar.md) | EVT-01~09 | `feat/calendar` | 3001 |
| 02 할일 | [02-todos.md](02-todos.md) | TODO-01~08 | `feat/todos` | 3002 |
| 03 가계부 | [03-money.md](03-money.md) | TX-01~09 | `feat/money` | 3003 |
| 04 외부 연동 | [04-integrations.md](04-integrations.md) | GCAL-01~10, WTH-01~09 | `feat/integrations` | 3004 |
| 05 MCP | [05-mcp.md](05-mcp.md) | MCP-01~07 | `feat/mcp` | 3005 |
| 06 통합 | [06-home-integration.md](06-home-integration.md) | HOME-01~06, SRCH-01~02, SET-02~05, NOTI-01~02 | `feat/home` | 3006 |

## 2. 실행 순서

```
웨이브 1  ── 00 기반 (단독) ──────────────────────────► main 병합
                                                         │
웨이브 2  ── 01 일정 ─┐                                   │
             02 할일 ─┤                                   │
             03 가계부 ┼─ 동시에 진행 ─► 끝나는 대로 main 병합
             04 외부연동┤
             05 MCP ──┘
                                                         │
웨이브 3  ── 06 통합 (01·02·03 병합 후 시작) ───────────► main 병합
```

- **00이 끝나기 전에는 웨이브 2를 시작하지 않는다.** 00이 스키마, 데이터 계층, 공용 컴포넌트, 파일 분리를 먼저 끝내야 각 세션의 파일이 겹치지 않는다.
- 04·05는 01~03과 독립이라 웨이브 2 안에서 순서 상관없이 병합해도 된다.
- 06은 01·02·03이 내보내는 등록 모달과 훅을 재사용하므로 마지막에 한다.

## 3. 작업 환경 준비 (세션마다)

모든 세션은 **자기 git worktree**에서 작업한다. 같은 폴더를 여러 세션이 함께 쓰지 않는다. worktree는 Claude Code의 **EnterWorktree**로 만들고, 위치는 저장소 안의 `.claude/worktrees/<세션>`이다(`.gitignore`에 들어 있다).

1. main 작업 폴더(`D:\ChaAI\06_calendar`)에서 00이 main에 병합된 것을 확인한 뒤 Claude Code 세션을 시작한다.
2. 세션에서 EnterWorktree로 자기 worktree를 만들고 브랜치를 표의 이름으로 맞춘다(예: worktree `calendar`, 브랜치 `feat/calendar`).
3. worktree 안에서 준비한다.
   ```powershell
   npm install
   Copy-Item D:\ChaAI\06_calendar\.env.local .     # 00이 만든 환경변수 파일(커밋하지 않음)
   npm run dev -- -p 3001                          # 표의 개발 포트 사용
   ```
4. 문서 끝의 **세션 시작 프롬프트**로 작업을 시작한다.

- 직접 만들 때는 `git worktree add .claude/worktrees/calendar -b feat/calendar`로 같은 위치에 만든다.
- 00 세션만 예외로 main 작업 폴더에서 `feat/foundation` 브랜치를 만들어 진행한다.
- 같은 폴더를 여러 세션이 읽는 동안에는 `git stash`, `git reset`, `git checkout -- .`, `git clean`처럼 작업 트리 전체를 건드리는 명령을 쓰지 않는다.
- `npm run dev`는 `AGENTS.md` 끝에 Next.js 안내 블록을 자동으로 넣는다. 생긴 변경은 지우지 말고 그대로 둔다.
### 테스트 계정
Supabase 클라우드 프로젝트 하나를 모든 세션이 같이 쓴다. 데이터가 섞이지 않도록 **세션마다 자기 테스트 계정**으로 로그인한다. 예: `dev+calendar@…`, `dev+todos@…`. 가입 후 설정 → 내 정보 → "예시 데이터 채우기"(DB 함수 `seed_demo`)로 시안과 같은 예시 데이터를 넣을 수 있다. 그 계정의 일정·할일·가계부 데이터를 지우고 다시 넣는다.

## 4. 파일 소유 규칙

각 세션 문서의 **소유 파일**만 수정한다. 그 밖의 파일은 읽기만 한다.

| 영역 | 소유 세션 |
|---|---|
| `supabase/config.toml`, `supabase/migrations/0001_*`, `src/lib/supabase/**`, `src/proxy.ts`, `src/app/(auth)/**`, `src/app/providers.tsx`, `tsconfig.json`, `eslint.config.mjs`, `next.config.ts`, `package.json`의 공용 의존성, `.env.example` | 00 |
| `src/lib/types/common.ts`·`index.ts`, `src/lib/data/profile.ts`, `src/lib/hooks/use-profile.ts`·`use-today.ts`, `src/components/settings/ProfileTab.tsx`·`ToggleList.tsx` | 00 |
| `src/app/globals.css`, `src/components/ui/**`, `src/components/shell/**`, `src/app/layout.tsx`, `src/components/settings/SettingsView.tsx`(탭 목록) | 00 → 웨이브 3에서 06 |
| `src/lib/date.ts`, `src/lib/format.ts` | 00 (함수 추가는 각 세션 허용, 기존 시그니처 변경 금지) |
| 일정: `components/calendar/**`, `app/calendar/**`, `lib/data/events.ts`, `lib/hooks/use-events.ts`, `lib/types/events.ts` | 01 |
| 할일: `components/todos/**`, `app/todos/**`, `lib/data/todos.ts`, `lib/hooks/use-todos.ts`, `lib/types/todos.ts`, `lib/todo.ts` | 02 |
| 가계부: `components/money/**`, `app/money/**`, `lib/data/transactions.ts`·`budgets.ts`, `lib/hooks/use-transactions.ts`, `lib/types/money.ts`, `lib/money.ts` | 03 |
| `supabase/functions/{gcal-sync,weather}`, `components/settings/GoogleTab.tsx`·`WeatherTab.tsx` | 04 |
| `supabase/functions/mcp-api`, `mcp/**`, `components/settings/McpTab.tsx` | 05 |
| `components/home/**`, 검색, `components/settings/NotificationsTab.tsx`, 알림, `mock-data.ts` 제거 | 06 |

`lib/todo.ts`·`lib/money.ts`는 홈(06)도 쓴다. 06은 함수 추가만 하고 기존 시그니처는 바꾸지 않는다.
다른 세션의 파일을 고쳐야 하면 직접 고치지 말고 다음 순서로 처리한다.
1. 자기 문서 맨 아래 **요청 사항** 칸에 무엇이 왜 필요한지 적는다.
2. 해당 세션에 알린다. 다른 세션 이름은 `/list-agents`(또는 `ListAgents`)로 확인하고 `SendMessage`로 보낸다.
3. 급하면 임시 구현을 자기 파일 안에 두고 `// TODO(세션명): …` 주석을 남긴다.

### 공유 계약
- 00이 정한 **훅·데이터 함수의 기존 시그니처는 바꾸지 않는다.** 필요하면 새 함수나 선택 인자를 추가한다.
- 01·02·03은 06이 빠른 등록에서 재사용할 수 있도록 **등록 모달 컴포넌트를 내보낸다.** 모양은 `{ open: boolean; onClose: () => void; initial?: Partial<입력타입> }`로 통일한다.

## 5. 데이터베이스 변경 규칙 (공유 클라우드 DB)

- 00이 PRD 4.3의 **모든 테이블**을 첫 마이그레이션에 만든다. 웨이브 2 세션은 가능하면 스키마를 바꾸지 않는다.
- 꼭 바꿔야 하면 다음 순서를 따른다.
  1. 새 파일 `supabase/migrations/<YYYYMMDDHHmmss>_<세션>_<설명>.sql`을 만든다. 기존 마이그레이션은 절대 수정하지 않는다.
  2. 컬럼·테이블·인덱스 추가처럼 **다른 세션 코드를 깨지 않는 변경만** 한다. 삭제·이름 변경은 하지 않는다.
  3. 그 마이그레이션 파일만 담은 커밋을 **먼저 main에 병합**하고, main 작업 폴더에서 `npx supabase db push`로 적용한다. 브랜치마다 따로 push하면 마이그레이션 이력이 어긋난다.
  4. main에서 타입을 다시 만든다: `npx supabase gen types typescript --linked > src/lib/supabase/database.types.ts`
  5. 다른 세션에 알리고, 각 세션은 `git merge main`으로 받는다.
- `database.types.ts`가 병합 충돌하면 손으로 고치지 말고 main에서 다시 생성한다.
- Edge Function은 세션마다 다른 함수를 맡으므로 각자 `npx supabase functions deploy <이름>`으로 배포해도 된다.

## 6. 병합 규칙

- 병합 전에 해당 브랜치에서 반드시 확인한다.
  - `npm run build` 통과
  - `npm run lint` 오류 없음
  - 자기 문서의 **완료 기준** 체크리스트 모두 충족
- 병합 직전에 `git merge main`으로 최신 main을 받아 충돌을 자기 브랜치에서 해결한 뒤 main에 병합한다.
- 이 저장소는 자동 push가 없다. 병합 후 `git push`는 사람이 결정한다.
- 병합이 끝난 worktree는 정리한다: ExitWorktree, 또는 `git worktree remove .claude/worktrees/<세션>`

## 7. 공통 개발 규칙

- Next.js 16.4 + React 19 + Tailwind v4이고, `cacheComponents`가 켜져 있다. Next 관련 코드를 쓰기 전에 `node_modules/next/dist/docs/`를 확인한다. 예를 들어 `middleware`는 `proxy`로 바뀌었다.
- 화면 문구는 한국어로 쓴다. 금액은 원 단위 정수, 날짜는 `YYYY-MM-DD` 문자열(사용자 타임존 기준), 일시는 `timestamptz`로 다룬다.
- 디자인은 기존 토큰과 클래스를 재사용한다. 토큰은 `globals.css`의 `@theme`, 클래스는 `.card`, `.pill`, `.seg`, `.field`, `.switch`이고, 공용 컴포넌트는 `src/components/ui`에 있다. 새 색상을 하드코딩하지 않는다.
- 외부 API(구글, 기상청)가 실패해도 일정·할일·가계부 기본 기능은 동작해야 한다.
- 비밀값은 `.env.local`과 `npx supabase secrets set`으로만 다룬다. 코드와 문서에 쓰지 않는다.
