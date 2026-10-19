# life-manager-mcp

라이프 매니저(일정·할일·가계부)를 Claude Desktop·Claude Code에서 대화로 쓰게 해 주는 로컬 stdio MCP 서버다.
DB에 직접 붙지 않고 Edge Function `mcp-api`에 개인 액세스 토큰(PAT)으로만 요청한다.

```
Claude ──stdio──> life-manager-mcp ──HTTPS + PAT──> Supabase Edge Function mcp-api ──> Postgres
```

> 설치 없이 쓰는 **원격 MCP**도 있다: `https://<project>.supabase.co/functions/v1/mcp-remote`(Streamable HTTP, Supabase OAuth 2.1 로그인 또는 `Authorization: Bearer lm_mcp_…`).
> claude.ai·Claude Desktop/모바일·ChatGPT·Claude Code(`claude mcp add --transport http …`)에서 쓴다. 연결 방법은 웹 앱 설정 → MCP 연결 → 연결 가이드, 설계는 `docs/sessions/05-mcp.md` 11절.
> 도구 정의는 원격과 같은 `supabase/functions/_shared/life/defs.ts`이고, `npm run build`가 `src/generated/`로 복사한다.

## 준비

1. 웹 앱 **설정 → MCP 연결**에서 토큰을 발급한다. 원문(`lm_mcp_…`)은 발급할 때 한 번만 보이니 바로 복사한다.
   - 서비스(일정·할일·가계부·날씨)별 접근과 쓰기 권한을 고를 수 있다. 쓰기를 끄면 조회 도구만 쓸 수 있다.
2. 이 폴더에서 빌드한다(Node 20 이상).
   ```powershell
   npm install
   npm run build        # dist/index.js 생성
   ```

## 등록

환경변수 두 개가 필요하다. 없으면 이유를 출력하고 바로 종료한다.

| 변수 | 값 |
|---|---|
| `LIFE_API_URL` | `https://<project>.supabase.co/functions/v1/mcp-api` (설정 화면 연결 가이드에 실제 주소가 있다) |
| `LIFE_TOKEN` | 발급한 토큰 `lm_mcp_…` |

**Claude Code**

```powershell
claude mcp add life-manager -e LIFE_API_URL=https://<project>.supabase.co/functions/v1/mcp-api -e LIFE_TOKEN=lm_mcp_… -- node D:/ChaAI/06_calendar/mcp/dist/index.js
```

**Claude Desktop** (`claude_desktop_config.json`)

```json
{
  "mcpServers": {
    "life-manager": {
      "command": "node",
      "args": ["D:/ChaAI/06_calendar/mcp/dist/index.js"],
      "env": {
        "LIFE_API_URL": "https://<project>.supabase.co/functions/v1/mcp-api",
        "LIFE_TOKEN": "lm_mcp_…"
      }
    }
  }
}
```

npm에 배포하지 않았으므로 `npx life-manager-mcp` 대신 빌드한 파일 경로를 쓴다. 이 폴더에서 `npm link`를 하면 `life-manager-mcp` 명령으로도 실행할 수 있다.

## 도구 (19개, PRD 4.4)

| 영역 | 도구 | 권한 |
|---|---|---|
| 공통 | `get_today_summary`, `search` | 읽기 권한 하나 이상(가진 범위만 결과에 넣는다) |
| 공통 | `get_weather` | `weather:read` — 날씨 기능(세션 04) 전까지는 "준비 중" 오류 |
| 일정 | `list_events`, `find_free_time` / `create_event`, `update_event`, `delete_event` | `events:read` / `events:write` |
| 할일 | `list_todos` / `create_todo`, `update_todo`, `complete_todo`, `delete_todo` | `todos:read` / `todos:write` |
| 가계부 | `list_transactions`, `get_budget_status`, `get_spending_summary` / `add_transaction`, `update_transaction`, `delete_transaction` | `tx:read` / `tx:write` |

동작 규칙
- 날짜·시각은 절대값(ISO 8601)만 받는다. `YYYY-MM-DD`는 종일, `YYYY-MM-DDTHH:mm`은 사용자 타임존 기준 시각이다. 모든 응답 첫 줄에 `now`(사용자 타임존 현재 시각)가 있어 Claude가 "내일" 같은 말을 직접 계산한다.
- 금액은 원 단위 정수다(4,500원 → `4500`).
- 분류·결제수단·카테고리·프로젝트·구글 캘린더는 이름으로 받는다. 없으면 만들지 않고 "다음 중 하나로 다시 시도: …"로 후보를 알려 준다.
- 삭제 도구는 `confirm: true`일 때만 지운다. 없으면 대상 요약만 돌려준다.
- 반복 일정은 회차별로 펼쳐 주고, 회차 id는 `<원본id>:YYYY-MM-DD`다. 수정·삭제는 `scope`(`this`/`following`/`all`)로 범위를 정한다.
- `add_transaction`으로 넣은 내역은 가계부 화면에 "· Claude"로 표시된다.
- 쓰기 작업은 설정 → MCP 연결의 사용 기록(최근 7일)에 남는다.
- 구글 캘린더 일정을 만들거나 고치면 다음 주기 동기화(최대 15분) 때 구글에 반영된다.

## 오류

| 코드 | 뜻 |
|---|---|
| `UNAUTHORIZED` | 토큰이 없거나 틀렸거나 폐기됨 |
| `FORBIDDEN_SCOPE` | 토큰에 그 도구 권한이 없음 |
| `NOT_FOUND` | 대상·이름을 찾지 못함(`candidates`에 후보) |
| `VALIDATION` | 인자 형식 오류(상대 날짜 등) |
| `CONFLICT` | 같은 항목이 이미 있음 |
| `UPSTREAM` | 서버·외부 서비스 오류, 날씨 준비 중 |

## 개발

- 도구 정의(설명·zod 입력 스키마)는 `src/tools.ts`, 실행·오류 문장화는 `src/index.ts`.
- 실제 처리는 `supabase/functions/mcp-api/`에 있다. 도구를 추가하면 두 곳을 함께 고친다.
- Edge Function을 로컬에서 띄워 시험할 때는 `LIFE_API_URL=http://localhost:8000`으로 둔다.
  ```powershell
  # 저장소 루트에서, SUPABASE_URL·SUPABASE_SERVICE_ROLE_KEY 환경변수를 넣은 뒤
  npx -y deno@2 run --no-config --allow-net --allow-env --allow-read supabase/functions/mcp-api/index.ts
  ```
