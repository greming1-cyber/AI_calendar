# PRD — 나만의 라이프 매니저

| 항목 | 내용 |
|---|---|
| 문서 버전 | v1.0 |
| 작성일 | 2026-10-14 |
| 상태 | 초안 (Draft) |
| 관련 문서 | [Sitemap.md](Sitemap.md) |

---

## 1. 개요

### 1.1 배경
일정은 구글 캘린더, 할일은 메모 앱, 가계부는 별도 앱에 흩어져 있어 하루를 파악하려면 여러 앱을 오가야 한다. 또한 Claude와 대화하면서 "내일 일정 넣어줘", "점심값 기록해줘"처럼 바로 처리하고 싶지만 연결된 개인 서비스가 없다.

### 1.2 제품 정의
일정관리 · 할일관리 · 가계부를 하나의 웹 서비스로 통합하고, **구글 캘린더 동기화**, **날씨 정보**, **Claude(MCP) 연동**을 제공하는 개인용 라이프 매니저.

### 1.3 목표
| 구분 | 목표 |
|---|---|
| G1 | 오늘의 일정·할일·지출·날씨를 홈 한 화면에서 3초 안에 파악한다 |
| G2 | 구글 캘린더와 일정을 양방향으로 동기화해 이중 입력을 없앤다 |
| G3 | Claude 대화만으로 일정·할일·가계부를 조회·등록할 수 있다 |
| G4 | 지출을 분류·예산 단위로 관리해 월 예산 초과를 미리 알 수 있다 |

### 1.4 범위 밖 (Non-goals)
- 여러 사용자 간 일정 공유·협업 (v1은 1인 사용 기준)
- 은행·카드사 계좌 자동 연동(오픈뱅킹, 마이데이터)
- 네이티브 모바일 앱 (v1은 반응형 웹 + PWA)
- 구글 외 캘린더(Outlook, iCloud, 네이버) 연동

---

## 2. 사용자

### 2.1 페르소나
| 항목 | 내용 |
|---|---|
| 사용자 | 서비스 개발자 본인 (1인 사용, 이후 소수 지인 확장 가능) |
| 환경 | PC 웹(주), 모바일 웹(보조), Claude Desktop / Claude Code |
| 특징 | 구글 캘린더를 이미 사용 중, Claude를 일상적으로 사용, 지출을 꾸준히 기록하고 싶음 |

### 2.2 핵심 사용 시나리오
| ID | 시나리오 |
|---|---|
| S1 | 아침에 홈을 열어 오늘 날씨, 일정 3개, 할일 5개, 이번 달 남은 예산을 확인한다 |
| S2 | 휴대폰 구글 캘린더에 등록한 회의가 서비스 캘린더에 자동으로 나타난다 |
| S3 | Claude에게 "점심 김밥 4,500원 카드로 기록해줘"라고 말하면 가계부에 저장된다 |
| S4 | Claude에게 "이번 주 마감 할일 알려주고, 금요일 오후 빈 시간에 정리 일정 잡아줘"라고 요청한다 |
| S5 | 토요일 등산 일정에 비 예보가 생기면 전날 알림을 받는다 |
| S6 | 월말에 통계 화면에서 분류별 지출과 전월 대비 증감을 확인한다 |

---

## 3. 기능 요구사항

우선순위: **P0** = MVP 필수, **P1** = MVP 직후, **P2** = 이후 개선

### 3.1 인증 (AUTH)
| ID | 요구사항 | 우선순위 |
|---|---|---|
| AUTH-01 | 이메일·비밀번호로 회원가입하고, 이메일 인증 후 계정이 활성화된다 | P0 |
| AUTH-02 | 구글 계정으로 로그인할 수 있다 | P0 |
| AUTH-03 | 비밀번호 재설정 링크를 이메일로 받을 수 있다 | P0 |
| AUTH-04 | 로그인 세션은 30일 유지되며, 로그아웃 시 즉시 만료된다 | P0 |
| AUTH-05 | 회원 탈퇴 시 모든 개인 데이터와 외부 연동 토큰을 삭제한다 | P1 |

### 3.2 홈 대시보드 (HOME)
| ID | 요구사항 | 우선순위 |
|---|---|---|
| HOME-01 | 오늘의 날씨 위젯: 현재 기온, 날씨 상태, 최고/최저, 강수확률, 3시간 단위 예보 | P0 |
| HOME-02 | 오늘의 일정: 오늘 일정을 시간순으로 표시(구글 캘린더 일정 포함), 종일 일정은 상단 | P0 |
| HOME-03 | 오늘 할 일: 오늘 마감 + 지난 마감 미완료 할일, 체크박스로 바로 완료 | P0 |
| HOME-04 | 이번 달 지출: 지출 합계, 예산 대비 사용률(진행 막대), 남은 금액 | P0 |
| HOME-05 | 빠른 등록: 일정 / 할일 / 지출 등록 버튼, 모달로 최소 항목만 입력 | P0 |
| HOME-06 | 예정 알림 요약: 3일 내 고정지출·결제 예정, 악천후 예보가 있는 일정 | P2 |

### 3.3 일정관리 (EVT)
| ID | 요구사항 | 우선순위 |
|---|---|---|
| EVT-01 | 캘린더를 월 / 주 / 일 보기로 전환할 수 있고, 마지막 보기를 기억한다 | P0 |
| EVT-02 | 일정 등록: 제목(필수), 시작·종료 일시, 종일 여부, 장소, 메모, 카테고리, 알림(없음/10분/30분/1시간/1일 전) | P0 |
| EVT-03 | 일정 수정·삭제. 반복 일정은 "이 일정만 / 이후 모두 / 전체" 범위를 선택한다 | P0 |
| EVT-04 | 반복 규칙: 매일 / 매주(요일 선택) / 매월 / 매년, 종료(없음/날짜/횟수) — RRULE 형식으로 저장 | P1 |
| EVT-05 | 주·일 보기에서 드래그로 일정 시간 이동, 아래쪽 끝 드래그로 길이 조정 | P1 |
| EVT-06 | 카테고리 추가·수정·삭제와 색상 지정. 기본값: 업무, 개인, 가족 | P0 |
| EVT-07 | 일정 상세에 연결된 할일·지출 목록과 해당 날짜 날씨 예보 표시 | P1 |
| EVT-08 | 마감일이 있는 할일을 캘린더에 표시(설정에서 켜기/끄기) | P1 |
| EVT-09 | 고정지출 예정일을 캘린더에 표시(설정에서 켜기/끄기) | P2 |

### 3.4 할일관리 (TODO)
| ID | 요구사항 | 우선순위 |
|---|---|---|
| TODO-01 | 할일 등록: 제목(필수), 마감일(날짜 또는 일시), 우선순위(높음/보통/낮음), 프로젝트, 메모 | P0 |
| TODO-02 | 목록 탭: 오늘 / 예정 / 전체 / 완료. 기본 정렬은 마감일 → 우선순위 | P0 |
| TODO-03 | 체크로 완료 처리, 완료 시각 기록, 완료 취소 가능 | P0 |
| TODO-04 | 지난 마감 미완료 할일은 빨간색으로 강조 | P0 |
| TODO-05 | 프로젝트 생성·수정·삭제, 프로젝트별 진행률(완료/전체) 표시 | P1 |
| TODO-06 | 하위 체크리스트(서브태스크) 추가 | P1 |
| TODO-07 | 반복 할일: 매일/매주/매월. 완료하면 다음 회차를 자동 생성 | P1 |
| TODO-08 | 할일을 일정에 연결("준비할 일") | P2 |

### 3.5 가계부 (TX)
| ID | 요구사항 | 우선순위 |
|---|---|---|
| TX-01 | 내역 등록: 구분(수입/지출), 금액(필수, 원 단위 정수), 날짜, 분류, 결제수단, 메모 | P0 |
| TX-02 | 내역 목록: 일별 그룹 표시, 월 이동, 월 수입·지출·잔액 합계 | P0 |
| TX-03 | 필터: 기간, 구분, 분류, 결제수단, 키워드 | P1 |
| TX-04 | 분류 관리: 기본 지출 분류(식비, 카페, 교통, 주거, 통신, 쇼핑, 의료, 문화, 경조사, 기타), 수입 분류(급여, 부수입, 기타) | P0 |
| TX-05 | 결제수단 관리: 현금, 카드(이름 지정), 계좌 | P0 |
| TX-06 | 월 전체 예산·분류별 예산 설정. 80% 도달 시 주의, 100% 초과 시 경고 | P1 |
| TX-07 | 고정지출(매월 n일 반복) 등록, 해당일에 내역 자동 생성 | P1 |
| TX-08 | 통계: 분류별 지출 비율(도넛 차트), 최근 6개월 수입·지출 추이(막대), 전월 대비 증감 | P1 |
| TX-09 | 지출을 일정에 연결(예: 모임 일정 → 회비 지출) | P2 |

### 3.6 통합 검색 (SRCH)
| ID | 요구사항 | 우선순위 |
|---|---|---|
| SRCH-01 | 키워드로 일정(제목·장소·메모), 할일(제목·메모), 가계부(메모·분류)를 한 번에 검색 | P1 |
| SRCH-02 | 결과를 유형별 탭으로 구분하고, 클릭 시 상세로 이동 | P1 |

### 3.7 설정 (SET)
| ID | 요구사항 | 우선순위 |
|---|---|---|
| SET-01 | 내 정보: 이름, 이메일 확인, 비밀번호 변경 | P0 |
| SET-02 | 화면: 라이트/다크/시스템 테마, 주 시작 요일(일/월), 기본 캘린더 보기 | P1 |
| SET-03 | 알림: 일정 알림, 할일 마감 알림, 예산 경고, 악천후 알림 각각 켜기/끄기 | P1 |
| SET-04 | 데이터: 전체 데이터 JSON 백업·복원, 가계부 CSV 내보내기 | P2 |
| SET-05 | 타임존: 기본 Asia/Seoul, 변경 가능 | P1 |

### 3.8 구글 캘린더 연동 (GCAL)
| ID | 요구사항 | 우선순위 |
|---|---|---|
| GCAL-01 | 설정에서 구글 계정을 연결(OAuth, `calendar.events` + `calendar.readonly` 권한)하고 해제할 수 있다 | P0 |
| GCAL-02 | 동기화할 구글 캘린더를 여러 개 선택할 수 있다 | P0 |
| GCAL-03 | 동기화 방향 선택: 가져오기만 / 내보내기만 / 양방향 (기본: 양방향) | P0 |
| GCAL-04 | 가져오기: 증분 동기화(syncToken)로 변경분만 가져온다. 주기 15분 + 수동 "지금 동기화" | P0 |
| GCAL-05 | 내보내기: 서비스에서 등록·수정·삭제한 일정을 지정한 구글 캘린더에 즉시 반영 | P0 |
| GCAL-06 | 일정 등록 시 저장 위치 선택: 내 서비스만 / 구글 캘린더(이름) | P1 |
| GCAL-07 | 구글에서 온 일정은 구글 아이콘과 캘린더 색상으로 구분 표시 | P0 |
| GCAL-08 | 충돌: 양쪽 모두 수정된 경우 `updated` 시각이 늦은 쪽 우선, 덮어쓴 버전은 이력에 보관 | P1 |
| GCAL-09 | 실시간 반영: 구글 Push 알림(watch 채널)으로 변경 즉시 가져오기 | P2 |
| GCAL-10 | 토큰 만료·권한 철회 시 설정 화면과 홈에 "다시 연결 필요" 표시 | P0 |

### 3.9 날씨 (WTH)
| ID | 요구사항 | 우선순위 |
|---|---|---|
| WTH-01 | 위치: 브라우저 현재 위치 사용 또는 기본 지역(시/군/구) 지정 | P0 |
| WTH-02 | 현재 날씨: 기온, 체감온도, 하늘 상태, 강수 형태, 습도, 풍속 | P0 |
| WTH-03 | 단기 예보: 오늘~모레 3시간(또는 1시간) 단위 | P0 |
| WTH-04 | 중기 예보: 최대 10일 일별 최고/최저·날씨 아이콘 | P1 |
| WTH-05 | 캘린더 월 보기 날짜 칸에 예보 가능 기간의 날씨 아이콘 표시 | P1 |
| WTH-06 | 일정 상세에 해당 일시(장소 좌표가 있으면 그 지역) 예보 표시 | P1 |
| WTH-07 | 일정 전날 18시에 해당 일정 시간대 강수확률 60% 이상이면 알림 | P2 |
| WTH-08 | 미세먼지(PM10/PM2.5) 등급 표시 | P2 |
| WTH-09 | 같은 격자·시간대 요청은 30분 캐시 결과를 사용한다 | P0 |

### 3.10 MCP 서버 — Claude 연동 (MCP)
| ID | 요구사항 | 우선순위 |
|---|---|---|
| MCP-01 | 설정에서 개인 액세스 토큰(PAT)을 발급·이름 지정·폐기할 수 있다. 토큰 원문은 발급 시 1회만 표시 | P0 |
| MCP-02 | 토큰별 권한 범위: 서비스(일정/할일/가계부/날씨) × 읽기/쓰기 | P0 |
| MCP-03 | 설정 화면에 Claude Desktop / Claude Code용 설정 예시를 복사 버튼과 함께 표시 | P0 |
| MCP-04 | 4.4절의 도구(Tools)를 제공한다 | P0 |
| MCP-05 | 삭제 도구는 대상 요약을 반환하고, `confirm: true` 인자가 있을 때만 실제 삭제한다 | P0 |
| MCP-06 | MCP로 실행된 쓰기 작업을 사용 기록에 남기고 설정에서 조회할 수 있다 | P1 |
| MCP-07 | 원격(HTTP) MCP 서버로 배포해 claude.ai 커스텀 커넥터에서도 사용 가능 | P2 |

### 3.11 알림 (NOTI)
| ID | 요구사항 | 우선순위 |
|---|---|---|
| NOTI-01 | 브라우저 웹 푸시(PWA)로 일정·할일·예산·날씨 알림을 보낸다 | P1 |
| NOTI-02 | 앱 내 알림 센터에 최근 30일 알림을 보관한다 | P2 |

---

## 4. 상세 설계

### 4.1 시스템 구성

```
                ┌──────────────────────────┐
[브라우저/PWA] ─>│ Next.js 웹 앱 (Vercel)   │
                └────────────┬─────────────┘
                             │ supabase-js (사용자 JWT, RLS 적용)
                             ▼
┌──────────────┐   ┌────────────────────────────────────────────┐
│ Claude       │   │ Supabase                                   │
│ Desktop/Code │   │  - Auth (이메일, Google)                   │
│      │       │   │  - PostgreSQL + RLS                        │
│      ▼       │   │  - Edge Functions                          │
│ MCP 서버     │──>│     · mcp-api   (PAT 검증 → 데이터 처리)   │
│ (stdio,      │PAT│     · gcal-sync (구글 동기화)              │
│  로컬 Node)  │   │     · weather   (날씨 조회·캐시)           │
└──────────────┘   │  - pg_cron (주기 작업)                     │
                   └───────┬───────────────────┬────────────────┘
                           ▼                   ▼
                 Google Calendar API      기상청 API허브 / 공공데이터포털
```

### 4.2 기술 스택
| 영역 | 선택 | 이유 |
|---|---|---|
| 프론트엔드 | Next.js (App Router) + TypeScript | Vercel 배포 경험, SSR/PWA 지원 |
| UI | Tailwind CSS + shadcn/ui | 빠른 개발, 다크 모드 |
| 캘린더 UI | FullCalendar | 월/주/일 보기, 드래그 지원 |
| 차트 | Recharts | 가계부 통계 |
| 상태·데이터 | TanStack Query + supabase-js | 캐시, Realtime 연동 |
| 백엔드 | Supabase (Postgres, Auth, Edge Functions, pg_cron, Realtime) | 요구사항(슈퍼베이스 DB) |
| MCP 서버 | TypeScript + `@modelcontextprotocol/sdk` | Claude 공식 SDK |
| 날씨 | 기상청 단기예보·중기예보 API (공공데이터포털) | 무료, 국내 정확도 |
| 배포 | Vercel(웹), Supabase(DB·함수), npm 패키지 또는 로컬 실행(MCP) | |

### 4.3 데이터 모델 (Supabase)
모든 테이블은 `id uuid PK`, `user_id uuid → auth.users`, `created_at`, `updated_at`을 가진다(아래 표에서 생략). 금액은 `bigint`(원), 일시는 `timestamptz`로 저장한다.

| 테이블                      | 주요 컬럼                                                                                                                                                                                                | 설명                     |
| ------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------- |
| `profiles`               | name, timezone, week_start, theme, default_view, weather_location(lat, lon, nx, ny, label)                                                                                                           | 사용자 설정                 |
| `event_categories`       | name, color, sort_order                                                                                                                                                                              | 일정 카테고리                |
| `events`                 | title, start_at, end_at, all_day, location, memo, category_id, rrule, recurrence_parent_id, reminder_minutes, source(`local`/`google`), google_calendar_id, google_event_id, google_etag, deleted_at | 일정 (구글 일정 포함)          |
| `projects`               | name, color, sort_order, archived                                                                                                                                                                    | 할일 프로젝트                |
| `todos`                  | title, memo, due_date, due_at, priority(1~3), project_id, parent_id, completed_at, rrule, event_id                                                                                                   | 할일·서브태스크               |
| `tx_categories`          | type(`income`/`expense`), name, icon, color, sort_order                                                                                                                                              | 가계부 분류                 |
| `payment_methods`        | type(`cash`/`card`/`account`), name                                                                                                                                                                  | 결제수단                   |
| `transactions`           | type, amount, occurred_on, category_id, payment_method_id, memo, recurring_id, event_id                                                                                                              | 수입·지출 내역               |
| `recurring_transactions` | type, amount, day_of_month, category_id, payment_method_id, memo, active                                                                                                                             | 고정지출·고정수입              |
| `budgets`                | month(`YYYY-MM`), category_id(null=전체), amount                                                                                                                                                       | 예산                     |
| `google_accounts`        | google_email, refresh_token(암호화), access_token_expires_at, status                                                                                                                                    | 구글 연동 계정               |
| `google_calendars`       | google_account_id, calendar_id, name, color, sync_direction, enabled, sync_token, last_synced_at                                                                                                     | 동기화 대상 캘린더             |
| `sync_conflicts`         | event_id, local_snapshot, remote_snapshot, resolved_with                                                                                                                                             | 충돌 이력                  |
| `weather_cache`          | provider, grid_key, kind(`now`/`short`/`mid`), base_time, payload jsonb, expires_at                                                                                                                  | 날씨 캐시 (user_id 없음, 공용) |
| `mcp_tokens`             | name, token_hash, token_prefix, scopes text[], last_used_at, revoked_at                                                                                                                              | MCP 액세스 토큰             |
| `mcp_audit_logs`         | token_id, tool, args jsonb, result_summary, status                                                                                                                                                   | MCP 사용 기록              |
| `notifications`          | kind, title, body, ref_type, ref_id, read_at, send_at                                                                                                                                                | 알림                     |

**보안 정책**
- 모든 사용자 테이블에 RLS: `user_id = auth.uid()`인 행만 조회·수정 가능
- `google_accounts.refresh_token`은 Supabase Vault로 암호화, 클라이언트에서 조회 불가
- `mcp_tokens`는 SHA-256 해시만 저장, 원문은 발급 시 1회만 노출
- `weather_cache`는 Edge Function(service role)만 쓰기 가능

### 4.4 MCP 도구 명세
MCP 서버는 로컬에서 stdio로 실행되며, 환경변수 `LIFE_API_URL`, `LIFE_TOKEN`(PAT)으로 Edge Function `mcp-api`를 호출한다. 날짜·시간 인자는 ISO 8601, 기본 타임존은 사용자 설정(Asia/Seoul)을 따른다.

| 도구 | 권한 | 주요 인자 | 반환 |
|---|---|---|---|
| `get_today_summary` | 읽기(전체) | `date?` | 일정, 할일, 오늘·이번 달 지출, 예산 사용률, 날씨 |
| `list_events` | events:read | `from`, `to`, `category?`, `query?` | 일정 목록 (반복 일정은 펼쳐서) |
| `create_event` | events:write | `title`, `start`, `end?`, `all_day?`, `location?`, `memo?`, `category?`, `rrule?`, `calendar?`(local/구글 캘린더명) | 생성된 일정 |
| `update_event` | events:write | `id`, 변경 필드, `scope?`(this/following/all) | 수정된 일정 |
| `delete_event` | events:write | `id`, `scope?`, `confirm` | 삭제 대상 요약 / 삭제 결과 |
| `find_free_time` | events:read | `from`, `to`, `duration_minutes`, `work_hours?`(예: 09-18) | 빈 시간대 목록 |
| `list_todos` | todos:read | `status?`(open/done/all), `due_before?`, `project?`, `priority?` | 할일 목록 |
| `create_todo` | todos:write | `title`, `due?`, `priority?`, `project?`, `memo?` | 생성된 할일 |
| `update_todo` | todos:write | `id`, 변경 필드 | 수정된 할일 |
| `complete_todo` | todos:write | `id`, `done?`(기본 true) | 완료 결과(반복이면 다음 회차) |
| `delete_todo` | todos:write | `id`, `confirm` | 삭제 대상 요약 / 결과 |
| `list_transactions` | tx:read | `from`, `to`, `type?`, `category?`, `payment_method?`, `query?` | 내역 목록 + 합계 |
| `add_transaction` | tx:write | `type`, `amount`, `date?`(기본 오늘), `category?`, `payment_method?`, `memo?` | 생성된 내역 |
| `update_transaction` | tx:write | `id`, 변경 필드 | 수정된 내역 |
| `delete_transaction` | tx:write | `id`, `confirm` | 삭제 대상 요약 / 결과 |
| `get_budget_status` | tx:read | `month?` | 전체·분류별 예산, 사용액, 남은 금액, 사용률 |
| `get_spending_summary` | tx:read | `from`, `to`, `group_by`(category/month/payment_method) | 그룹별 합계 |
| `get_weather` | weather:read | `date?`, `location?` | 현재 날씨 또는 해당일 예보 |
| `search` | 읽기(전체) | `query`, `types?` | 유형별 검색 결과 |

**동작 규칙**
- 분류·결제수단·카테고리·프로젝트는 이름으로 받아 서버에서 찾는다. 일치하는 항목이 없으면 후보 목록을 반환하고 생성하지 않는다.
- 상대 날짜("내일", "이번 주 금요일") 해석은 Claude가 하고, 도구는 절대 날짜만 받는다. 이를 위해 모든 응답에 `now`(사용자 타임존 기준 현재 시각)를 포함한다.
- 오류는 `code`(UNAUTHORIZED, FORBIDDEN_SCOPE, NOT_FOUND, VALIDATION, CONFLICT, UPSTREAM)와 사람이 읽을 수 있는 메시지로 반환한다.

**Claude Desktop 설정 예시**
```json
{
  "mcpServers": {
    "life-manager": {
      "command": "npx",
      "args": ["-y", "life-manager-mcp"],
      "env": {
        "LIFE_API_URL": "https://<project>.supabase.co/functions/v1/mcp-api",
        "LIFE_TOKEN": "lm_xxxxxxxxxxxxxxxx"
      }
    }
  }
}
```

### 4.5 구글 캘린더 동기화 흐름
1. **연결**: 설정 → "구글 계정 연결" → OAuth(오프라인 액세스) → refresh token을 Vault에 저장 → 캘린더 목록 조회 후 선택
2. **최초 가져오기**: 선택한 캘린더의 과거 3개월 ~ 미래 12개월 일정을 가져와 `events`(source=`google`)에 저장, `nextSyncToken` 저장
3. **증분 가져오기**: pg_cron이 15분마다 `gcal-sync` 호출 → syncToken으로 변경분만 반영(생성/수정/취소). 410 응답 시 전체 재동기화
4. **내보내기**: 서비스에서 일정 변경 → `gcal-sync`가 구글 API로 insert/patch/delete → 응답의 `id`, `etag`를 저장
5. **충돌**: 내보내기 시 etag 불일치(412)면 원격 일정을 다시 받아 `updated` 비교 → 늦은 쪽 적용, 다른 쪽은 `sync_conflicts`에 보관
6. **해제**: 토큰 폐기(revoke) → 구글 출처 일정 삭제 여부를 사용자에게 선택받음

※ Supabase Auth의 구글 로그인 토큰은 자동 갱신되지 않으므로, 캘린더 연동은 로그인과 별개의 OAuth 흐름으로 refresh token을 직접 관리한다.

### 4.6 날씨 처리 흐름
1. 사용자 위치(위·경도)를 기상청 격자 좌표(nx, ny)로 변환해 `profiles`에 저장
2. 웹/MCP → Edge Function `weather` 호출 → `weather_cache`에서 유효한 결과 조회
3. 캐시 없음 → 기상청 API 호출(초단기실황, 단기예보, 중기예보) → 표준 형식으로 변환 후 캐시(30분, 중기는 6시간)
4. 외부 API 오류 시 만료된 캐시라도 "업데이트 시각"과 함께 표시

---

## 5. 화면 요구사항 요약
| 화면 | 핵심 구성 | 비고 |
|---|---|---|
| 로그인 | 이메일·비밀번호, 구글 로그인 버튼 | |
| 홈 | 날씨 / 오늘 일정 / 오늘 할 일 / 이번 달 지출 위젯 + 빠른 등록 버튼 | PC 2열, 모바일 1열 |
| 캘린더 | 상단 보기 전환·오늘 버튼, 날짜 칸 날씨 아이콘, 일정 클릭 시 상세 패널 | |
| 할일 | 좌측 프로젝트 목록, 중앙 탭(오늘/예정/전체/완료) + 목록 | 모바일은 프로젝트를 드롭다운으로 |
| 가계부 | 월 이동, 합계 카드, 일별 내역, 통계·예산 탭 | |
| 설정 | 좌측 메뉴(6.1~6.7), 우측 내용 | |

- 하단 탭(모바일) / 좌측 사이드바(PC): 홈, 캘린더, 할일, 가계부, 설정
- 빈 상태 화면마다 첫 등록을 유도하는 안내 문구와 버튼 제공

---

## 6. 비기능 요구사항
| 구분 | 요구사항 |
|---|---|
| 성능 | 홈 첫 화면 표시 2초 이내(4G 기준), 화면 전환 300ms 이내, MCP 도구 응답 2초 이내(외부 API 제외) |
| 보안 | HTTPS 전용, RLS 전 테이블 적용, 외부 토큰 암호화 저장, PAT 해시 저장, 서비스 키는 서버에서만 사용 |
| 개인정보 | 수집 항목 최소화(이메일, 이름, 위치는 격자 단위로만 저장), 탈퇴 시 즉시 삭제 |
| 가용성 | 외부 API(구글·기상청) 장애 시에도 일정·할일·가계부 기본 기능은 동작 |
| 호환성 | 최신 Chrome, Edge, Safari, 모바일 Safari/Chrome. 360px 폭부터 지원 |
| 접근성 | 키보드 조작, 색상 외 아이콘·텍스트로 상태 구분, WCAG AA 대비 |
| 국제화 | v1은 한국어, 원화(KRW), Asia/Seoul 기본 |
| 데이터 | Supabase 일일 자동 백업, 사용자 JSON 내보내기 |

---

## 7. 개발 로드맵
| 단계 | 기간(예상) | 범위 | 완료 기준 |
|---|---|---|---|
| M0 준비 | 1주 | Supabase 프로젝트, 스키마·RLS, Next.js 기본 레이아웃, 인증 | 로그인 후 빈 홈 화면 표시 |
| M1 핵심 기능 | 3주 | 일정(EVT P0), 할일(TODO P0), 가계부(TX P0), 홈 대시보드 | 세 기능 등록·조회·수정·삭제 가능 |
| M2 외부 연동 | 2주 | 구글 캘린더(GCAL P0), 날씨(WTH P0) | 구글 일정 양방향 반영, 홈 날씨 표시 |
| M3 MCP | 1~2주 | `mcp-api` Edge Function, MCP 서버, 토큰 관리 화면 | Claude Desktop에서 시나리오 S3·S4 성공 |
| M4 개선 | 2주 | P1 전체(반복, 예산, 통계, 검색, 알림, 드래그) | P1 요구사항 완료 |
| M5 이후 | - | P2 항목, 원격 MCP, PWA 푸시 고도화 | |

---

## 8. 성공 지표
| 지표 | 목표 |
|---|---|
| 사용 지속 | 4주 연속 주 5일 이상 홈 접속 |
| 가계부 기록률 | 한 달 지출 기록 일수 20일 이상 |
| Claude 활용 | 전체 등록 건 중 MCP 경유 30% 이상 |
| 동기화 정확도 | 구글 캘린더 불일치 건수 월 0건 |
| 응답 속도 | MCP 도구 평균 응답 1초 이내 |

---

## 9. 리스크와 대응
| 리스크 | 영향 | 대응 |
|---|---|---|
| 구글 OAuth 앱 검증 | 민감 범위(calendar) 사용 시 미검증 앱 경고, 테스트 사용자 100명 제한 | 개인용은 "테스트" 상태로 운영, 확장 시 검증 신청 |
| 구글 refresh token 만료 | 테스트 상태 앱은 토큰이 7일 후 만료 | 만료 감지 시 재연결 안내(GCAL-10), 필요 시 앱 게시 상태로 전환 |
| 동기화 충돌·중복 | 일정 중복 또는 유실 | google_event_id 유니크 제약, etag 비교, 충돌 이력 보관 |
| 기상청 API 호출 제한·장애 | 날씨 미표시 | 캐시, 만료 캐시 폴백, 대체 API(OpenWeatherMap) 어댑터 |
| PAT 유출 | 데이터 노출·변조 | 권한 범위 최소화, 마지막 사용 시각 표시, 즉시 폐기, 삭제는 confirm 필수 |
| Edge Function 콜드 스타트 | MCP 응답 지연 | 함수 통합(`mcp-api` 하나), 가벼운 의존성 유지 |

---

## 10. 미결 사항
| 번호 | 질문 | 기본안 |
|---|---|---|
| Q1 | 서비스 이름 | "라이프 매니저"(가칭) |
| Q2 | 날씨 API 최종 선택 | 기상청(공공데이터포털), 해외 위치 필요 시 OpenWeatherMap 추가 |
| Q3 | 지인 등 다중 사용자 확장 여부 | v1은 1인, 구조는 다중 사용자 대응(RLS) |
| Q4 | MCP 서버 배포 방식 | v1 로컬 stdio, 이후 원격 HTTP(MCP-07) |
| Q5 | 구글 출처 일정에 서비스 전용 필드(카테고리 등) 허용 여부 | 허용, 구글에는 동기화하지 않음 |
| Q6 | 가계부 외화 지원 | v1 미지원(원화만) |
