# 세션 05 — MCP 서버 (Claude 연동)

> 웨이브 2. 00 병합 후 01·02·03·04와 동시에 진행한다. 공통 규칙은 [README.md](README.md)를 따른다.

## 1. 목표

Claude Desktop / Claude Code에서 대화로 일정·할일·가계부를 조회·등록할 수 있게 한다. 구성은 세 부분이다.
- Edge Function `mcp-api`: 토큰 검증과 데이터 처리
- 로컬 stdio MCP 서버 `life-manager-mcp`: Claude가 실행하는 쪽
- 설정 MCP 탭: 토큰 관리

| 요구사항 | 내용 | 우선순위 |
|---|---|---|
| MCP-01 | 개인 액세스 토큰(PAT) 발급·이름 지정·폐기, 원문은 발급 시 1회만 표시 | P0 |
| MCP-02 | 토큰별 권한: 서비스(일정/할일/가계부/날씨) × 읽기/쓰기 | P0 |
| MCP-03 | Claude Desktop / Claude Code 설정 예시와 복사 버튼 | P0 |
| MCP-04 | PRD 4.4의 도구 19개 | P0 |
| MCP-05 | 삭제 도구는 `confirm: true`일 때만 삭제, 아니면 대상 요약 반환 | P0 |
| MCP-06 | 쓰기 작업 사용 기록 저장·조회 | P1 |
| MCP-07 | 원격(HTTP) MCP 서버 배포(claude.ai 커스텀 커넥터) | P2 |

## 2. 선행 조건

- 00이 main에 병합돼 있어야 한다. 필요한 것은 `mcp_tokens`, `mcp_audit_logs`, 전체 도메인 테이블, 설정 탭 파일 분리(`McpTab.tsx`)다.
- **시작 전에 `claude-api` 스킬을 불러** MCP SDK와 도구 정의 관련 최신 정보를 확인한다.
- 날씨 도구는 04의 `weather` Edge Function을 호출한다. 04가 끝나기 전에는 `UPSTREAM` 오류를 반환하는 자리만 둔다.

## 3. 작업 환경

```powershell
git worktree add D:\ChaAI-wt\mcp -b feat/mcp
cd D:\ChaAI-wt\mcp; npm install; Copy-Item D:\ChaAI\06_calendar\.env.local .
npm run dev -- -p 3005
```
- 테스트 계정: `dev+mcp@…`. 가입 후 `seed_demo`를 실행한다.
- Claude Desktop 또는 Claude Code에 개발용 MCP 서버를 등록해 실제 대화로 시험한다.

## 4. 소유 파일

- `supabase/functions/mcp-api/**`
- `mcp/**` — 별도 npm 패키지(`mcp/package.json`, `mcp/src/**`, `mcp/README.md`). Next 앱과 의존성을 공유하지 않는다.
- `src/components/settings/McpTab.tsx`, `src/lib/data/mcp-tokens.ts`, `src/lib/hooks/use-mcp-tokens.ts`
- `src/app/api/mcp/**` (토큰 발급처럼 service role이 필요한 서버 라우트를 둘 경우)

**읽기만 한다**
- `lib/data/*.ts`의 변환 규칙(01·02·03). Edge Function은 Deno 환경이라 직접 import하지 않고, 같은 규칙을 `mcp-api` 안에 구현한다. 규칙이 바뀌면 해당 세션과 맞춘다.

## 5. 작업 상세

### 5.1 토큰 (MCP-01, 02)
- [x] 발급
  - 서버에서 `lm_mcp_` + 랜덤 32바이트(base62)를 만든다.
  - DB에는 SHA-256 해시와 앞·뒤 4자리(`token_prefix`)만 저장한다.
  - 원문은 응답으로 **한 번만** 돌려준다.
- [x] 범위 `scopes text[]`
  - 값: `events:read`, `events:write`, `todos:read`, `todos:write`, `tx:read`, `tx:write`, `weather:read`
  - 화면의 "쓰기 권한" 스위치를 끄면 모든 `*:write`를 뺀다.
- [x] 폐기는 `revoked_at`을 기록한다. 조회 시 `last_used_at`을 갱신한다.

### 5.2 Edge Function `mcp-api`
- [x] 요청: `POST { tool: string, args: object }`, 헤더 `Authorization: Bearer <PAT>`
- [x] 처리 순서
  1. 토큰 해시를 조회하고, 폐기 여부를 확인한다.
  2. 도구에 필요한 범위를 확인한다(부족하면 `FORBIDDEN_SCOPE`).
  3. 인자를 검증한다(`VALIDATION`).
  4. service role 클라이언트로 **반드시 `user_id = 토큰 소유자` 조건을 붙여** 처리한다.
  5. 쓰기 도구면 `mcp_audit_logs`에 남긴다.
- [x] 응답: `{ ok: true, now, data }` 또는 `{ ok: false, code, message, candidates? }`
  - `now`는 사용자 타임존 기준 현재 시각이다(PRD 4.4 규칙).
- [x] 도구 19개 (PRD 4.4 표)

  | 영역 | 도구 |
  |---|---|
  | 일정 | `list_events`, `create_event`, `update_event`, `delete_event`, `find_free_time` |
  | 할일 | `list_todos`, `create_todo`, `update_todo`, `complete_todo`, `delete_todo` |
  | 가계부 | `list_transactions`, `add_transaction`, `update_transaction`, `delete_transaction`, `get_budget_status`, `get_spending_summary` |
  | 공통 | `get_today_summary`, `get_weather`, `search` |

- [x] 동작 규칙(PRD 4.4)
  - 날짜는 절대값(ISO 8601)만 받는다.
  - 분류·결제수단·카테고리·프로젝트는 이름으로 받아 찾는다. 없으면 **만들지 않고** `NOT_FOUND`와 `candidates`를 돌려준다.
  - 삭제 도구는 `confirm !== true`이면 삭제 대상 요약만 돌려준다.
  - `add_transaction`은 `via_mcp=true`로 저장한다(가계부 "· Claude" 표시).
  - `list_events`는 반복 일정을 펼친 결과를 준다(01의 RRULE 규칙과 동일하게).
  - `complete_todo`는 02의 DB 함수 `complete_todo(id)`가 있으면 그것을 호출한다(반복 다음 회차).
  - `create_event`의 `calendar`가 구글 캘린더 이름이면 `source='google'`로 저장한다. 동기화는 04의 트리거가 처리한다.
- [ ] `npx supabase functions deploy mcp-api --no-verify-jwt` (JWT 대신 PAT로 인증)

### 5.3 로컬 MCP 서버 `mcp/` (`life-manager-mcp`)
- [x] TypeScript + `@modelcontextprotocol/sdk`, stdio 전송
- [x] 환경변수 `LIFE_API_URL`, `LIFE_TOKEN`을 받는다. 없으면 시작할 때 이유를 출력하고 종료한다.
- [x] 도구 19개를 등록한다.
  - 각 도구 설명은 Claude가 정확히 고르도록 한국어·영어를 섞어 명확히 쓴다. 예: 언제 쓰는지, 날짜 형식, 금액 단위(원).
  - 입력 스키마는 zod로 정의한다.
  - 실행은 `mcp-api`로 그대로 전달한다.
- [x] 오류를 Claude가 이해할 수 있는 문장으로 바꾼다. `candidates`가 있으면 "다음 중 하나로 다시 시도: …"처럼 안내한다.
- [x] 빌드·실행 스크립트: `npm run build`, `npx life-manager-mcp`(bin). 사용법은 `mcp/README.md`에 적는다.
- [x] Claude Code 등록 예: `claude mcp add life-manager -e LIFE_API_URL=… -e LIFE_TOKEN=… -- node D:/…/mcp/dist/index.js`
- [ ] (P2, MCP-07) Streamable HTTP 원격 모드 — 별도 단계로 미룬다.

### 5.4 설정 MCP 탭 (MCP-03, 06)
- [x] 토큰 목록: 이름, 앞뒤 4자리, 범위, 발급일, 마지막 사용, 상태
- [x] "새 토큰 발급" 모달
  - 이름, 범위 선택
  - 발급 후 원문을 1회 표시하고 복사 버튼과 "다시 볼 수 없습니다" 안내를 띄운다.
- [x] 폐기는 확인 후 진행한다.
- [x] 연결 가이드: Claude Desktop JSON과 Claude Code 명령을 탭으로 보여주고 복사 버튼을 단다. 실제 `LIFE_API_URL`을 채우고, 토큰 자리는 비워 둔다.
- [x] 사용 기록: `mcp_audit_logs` 최근 7일, 도구명·요약·시각
- [x] `mock-data.ts`의 `MCP_TOKEN`, `MCP_LOGS` 사용처를 제거한다.
- [x] 헤더의 "Claude 연결됨" 표시용 `useMcpStatus()`(유효 토큰과 최근 사용 여부)를 제공한다. 헤더 반영은 06이 한다.

## 6. 다른 세션과의 계약

| 제공 | 대상 |
|---|---|
| `useMcpStatus()` | 06 헤더 |
| `transactions.via_mcp=true` 저장 | 03 화면 표시 |

| 사용 | 제공 세션 |
|---|---|
| 반복 펼치기 규칙(RRULE) | 01 |
| `complete_todo(id)` DB 함수 | 02 |
| 이름으로 분류·결제수단 찾기 규칙 | 03 |
| `weather` Edge Function | 04 |

## 7. 완료 기준

- [ ] 설정에서 토큰을 발급하고, Claude Desktop(또는 Claude Code)에 등록하면 도구 19개가 보인다.
- [x] Claude에 아래 요청을 하면 결과가 앱 화면에 반영된다.
  - "점심 김밥 4,500원 카드로 기록해줘" → 가계부에 "· Claude" 표시와 함께 기록
  - "내일 오후 3시에 치과 예약 넣어줘" → 일정 생성
  - "이번 주 마감 할일 알려줘", "이번 달 식비 예산 얼마나 남았어?" → 정확한 값으로 답변
- [x] 없는 분류("간식")를 말하면 새로 만들지 않고 후보를 제시한다.
- [x] "치과 일정 지워줘"는 먼저 대상을 확인하고, 확인 후에만 삭제한다.
- [x] 읽기 전용 토큰으로 쓰기 도구를 쓰면 `FORBIDDEN_SCOPE`가 나온다. 다른 계정의 데이터는 절대 조회되지 않는다.
- [x] 폐기한 토큰은 즉시 거부된다.
- [x] 쓰기 작업이 사용 기록에 나타난다.
- [x] Next 앱 `npm run build`·`npm run lint`와 `mcp/`의 `npm run build`가 통과한다.

## 8. 세션 시작 프롬프트

```
docs/sessions/README.md 와 docs/sessions/05-mcp.md 를 읽고 세션 05(MCP 서버) 작업을 진행해.
지금 폴더는 feat/mcp worktree 야. 시작 전에 claude-api 스킬로 MCP SDK 사용법을 확인하고,
토큰(5.1) → mcp-api(5.2) → mcp 패키지(5.3) → 설정 탭(5.4) 순서로 진행해. 소유 파일 밖은 수정하지 마.
```

## 9. 요청 사항
(다른 세션에 요청할 내용이나 받은 요청을 여기에 적는다)

- 04(날씨): `weather` Edge Function이 생기면 `supabase/functions/mcp-api/index.ts`의 `weather()`와 `get_today_summary`의 날씨 자리를 연결한다. 지금은 "준비 중"(UPSTREAM)을 돌려준다.
- 06(헤더): "Claude 연결됨" 표시는 `useMcpStatus()`(`src/lib/hooks/use-mcp-tokens.ts`)의 `connected`(유효 토큰이 최근 24시간 안에 쓰임)를 쓴다.

## 10. 구현 메모 (세션 05 결과)

- 토큰 발급은 `POST /api/mcp/tokens`(사용자 세션, RLS insert). 원문 `lm_mcp_` + base62 43자(256비트), DB에는 SHA-256 hex와 `lm_mcp_앞4…뒤4`만 둔다. 폐기는 클라이언트가 `revoked_at`을 기록한다. 범위 상수는 `src/app/api/mcp/scopes.ts`.
- `mcp-api`는 `index.ts`(인증·범위·감사), `events.ts`·`todos.ts`·`money.ts`(도구), `util.ts`(검증·타임존·이름 찾기)로 나뉜다. 반복 펼침은 `src/lib/rrule.ts`를 상대 경로로 import한다.
- 응답에는 `now`(예: `2026-10-19T14:03:22+09:00`)와 `timezone`을 함께 준다. 연결 확인용 숨은 도구 `ping`(범위 목록)이 있다.
- 사용 기록: 쓰기 도구가 실제로 바꾼 경우(삭제 미리보기 제외)와 실패(VALIDATION·NOT_FOUND 제외)를 `mcp_audit_logs`에 남긴다.
- `complete_todo` DB 함수는 security invoker라, service role로 부르기 전에 할일 소유자를 먼저 확인한다.
- 구글 일정 쓰기는 service role이라 `mark_google_dirty` 트리거가 표시하지 않으므로 `google_dirty=true`를 직접 넣는다. 구글 반영은 15분 주기 동기화 때 된다(즉시 반영 안 됨).
- 거래는 `transactions`에 직접 쓴다(`via_mcp=true`, `recurring_id`는 비움). 이름 찾기 규칙은 03의 `findCategoryByName`과 같다(정확히 일치 → 없으면 서로 포함되는 후보, 그것도 없으면 전체).
- 로컬 시험: Deno로 `mcp-api`를 띄우고(`mcp/README.md` 개발 절) 테스트 계정 `dev+mcp@example.com`, `dev+mcp2@example.com`(격리 확인용)으로 확인했다.
