# 세션 01 — 일정관리

> 웨이브 2. 00 병합 후 02·03·04·05와 동시에 진행한다. 공통 규칙은 [README.md](README.md)를 따른다.

## 1. 목표

캘린더 화면(Sitemap 2.1~2.4)을 실데이터 기반의 완성된 일정관리 기능으로 만든다.

| 요구사항 | 내용 | 우선순위 |
|---|---|---|
| EVT-01 | 월/주/일 보기 전환, 마지막 보기 기억 | P0 |
| EVT-02 | 일정 등록(제목, 시작·종료, 종일, 장소, 메모, 카테고리, 알림) | P0 |
| EVT-03 | 수정·삭제, 반복 일정은 "이 일정만 / 이후 모두 / 전체" | P0 |
| EVT-06 | 카테고리 추가·수정·삭제, 색상 | P0 |
| EVT-04 | 반복 규칙(매일/매주 요일/매월/매년, 종료 조건), RRULE 저장 | P1 |
| EVT-05 | 주·일 보기 드래그 이동, 길이 조정 | P1 |
| EVT-07 | 일정 상세에 연결된 할일·지출과 날씨 | P1 |
| EVT-08 | 마감 있는 할일을 캘린더에 표시(켜기/끄기) | P1 |
| EVT-09 | 고정지출 예정일을 캘린더에 표시(켜기/끄기) | P2 |

## 2. 선행 조건

- 00이 main에 병합돼 있어야 한다. 필요한 것은 스키마, `listEvents`, `useEvents`, `Modal`, `useToast`, `useToday`다.
- EVT-07의 날씨는 04의 `useWeather()`를 쓴다. 04가 아직 병합되지 않았으면 그 부분은 자리만 두고 넘어간다.

## 3. 작업 환경

```powershell
git worktree add D:\ChaAI-wt\calendar -b feat/calendar
cd D:\ChaAI-wt\calendar; npm install; Copy-Item D:\ChaAI\06_calendar\.env.local .
npm run dev -- -p 3001
```
- 테스트 계정: `dev+calendar@…`. 가입 후 `seed_demo`로 예시 데이터를 넣는다.

## 4. 소유 파일

- `src/components/calendar/**`, `src/app/calendar/**`
- `src/lib/data/events.ts`, `src/lib/hooks/use-events.ts`, `src/lib/types/events.ts`
- `src/lib/rrule.ts` (새로 만듦)
- 카테고리 관리 화면: `src/app/calendar/categories/` 또는 캘린더 화면 안의 패널

**읽기만 한다**
- `lib/data/todos.ts`(02), `lib/data/transactions.ts`(03), `lib/data/weather.ts`(04), `components/ui/**`, `globals.css`

## 5. 작업 상세

### 5.1 데이터 계층 (`lib/data/events.ts`)
- [x] 일정 쓰기 함수
  - `createEvent(input)`, `updateEvent(id, patch, scope?)`, `deleteEvent(id, scope?)`
  - 삭제는 `deleted_at` 소프트 삭제다. → 00 구현을 따라 구글 출처만 소프트 삭제(예외 일정 포함), 내 일정은 바로 삭제(예외 일정은 cascade)한다.
- [x] 카테고리 함수: `createCategory`, `updateCategory`, `deleteCategory`
  - 사용 중인 카테고리를 지우면 "개인"으로 옮길지 확인한다.
- [x] `use-events.ts`에 뮤테이션 훅을 추가한다. 낙관적 업데이트와 실패 시 롤백·토스트를 넣는다.
- [x] 00이 만든 `listEvents(from, to)`의 시그니처는 유지한다. 반복 일정 펼치기는 선택 인자 `expand?: boolean`으로 추가한다. → `listEvents(from, to, tz?, { expand = true })`

### 5.2 반복 일정 (EVT-03, EVT-04)
- [x] RRULE 처리: `rrule` 라이브러리를 쓸지 직접 구현할지 판단한다. 필요한 범위는 FREQ, INTERVAL, BYDAY, UNTIL, COUNT다.
- [x] `listEvents`의 범위 안에서 반복 일정을 개별 회차로 펼친다. 회차 id는 `"<원본id>:<날짜>"`로 한다.
- [x] 수정·삭제 범위
  - **이 일정만**: `recurrence_parent_id`를 가진 예외 일정을 만들고 원본 규칙에 EXDATE를 추가한다.
  - **이후 모두**: 원본에 UNTIL을 걸고 새 시리즈를 만든다.
  - **전체**: 원본을 수정한다.
- [x] 등록 모달의 반복 선택을 확장한다: 매주 요일 선택, 종료(없음/날짜/횟수).

### 5.3 화면
- [x] `CalendarView`
  - `TODAY` 대신 `useToday()`를 쓴다.
  - 달을 이동하면 그 달 범위로 다시 조회한다.
- [x] 월/주/일 보기를 구현하고 마지막 보기를 `localStorage`에 기억한다(EVT-01).
  - 주·일 보기는 시간 축(0~24시) 위에 일정을 블록으로, 종일 일정은 상단 띠로 보여준다.
  - FullCalendar 도입 여부는 판단해서 정한다. 쓰는 경우 기존 디자인 토큰으로 테마를 맞춘다.
- [x] 드래그로 시간 이동, 아래쪽 끝 드래그로 길이 조정(EVT-05). 반복 일정이면 수정 범위를 묻는다.
- [x] `EventModal`
  - 00의 `Modal` 셸로 바꾼다.
  - 종료 날짜 입력을 추가한다(여러 날 일정).
  - 저장 위치에서 "구글 캘린더"를 고르면 `source='google'`로 저장한다. 실제 구글 반영은 04가 처리한다.
  - 06이 재사용할 수 있게 내보낸다: `export function EventModal({ open, onClose, initial })` 형태(README 공유 계약).
- [x] 카테고리 관리(EVT-06): 오른쪽 "카테고리 · 관리"를 누르면 패널이 열린다. 이름·색상 추가·수정·삭제, 색상은 팔레트에서 고른다.
- [x] 일정 상세(EVT-07) — 수정 모달 아래 "연결된 항목"
  - 연결된 할일: `todos.event_id`
  - 연결된 지출: `transactions.event_id`
  - 해당 날짜 날씨: `useWeather()` → 04 병합 전이라 `mock-data`의 예시 예보를 쓴다(`TODO(04)`).
- [x] 할일 표시(EVT-08)
  - 02의 `listTodos` 조회 함수로 마감 할일을 가져와 날짜 칸에 체크 아이콘 칩으로 표시한다.
  - 켜기/끄기는 캘린더 상단 보기 옵션에 둔다.
- [x] 고정지출 표시(EVT-09): `recurring_transactions`를 읽어 결제 예정일에 표시한다. 읽기 전용 쿼리를 `events.ts` 안에 둔다.
- [x] 빈 상태, 로딩(스켈레톤), 오류 상태를 넣는다.

## 6. 다른 세션과의 계약

| 제공 | 대상 |
|---|---|
| `EventModal` (open/onClose/initial, 수정은 `event`) | 06 빠른 등록 |
| `listEvents(from, to, tz?, { expand = true })`, `useEvents(range, { expand })` 반복 펼침 결과. 회차 id `"<원본id>:<날짜>"`, 여러 날 일정은 범위에 걸치면 포함 | 05 `list_events`, 06 홈·검색 |
| `events.source='google'` 일정 생성·수정 시 `google_event_id` 유지 | 04 동기화 |

| 사용 | 제공 세션 |
|---|---|
| `listTodos`, `listTransactions` 조회 | 02, 03 (00 기본 구현) |
| `useWeather(date)` | 04 |

- 구글 출처 일정의 `google_event_id`·`google_etag`는 01이 수정하지 않는다. 04가 관리한다.

### 6.1 `src/lib/rrule.ts` (02·05 재사용)

외부 import가 없는 순수 TS다. 웹 앱과 Edge Function(Deno)이 같은 파일을 쓴다. 날짜는 사용자 타임존 기준 `YYYY-MM-DD`이고, `rrule`은 DB `events.rrule`처럼 `RRULE:` 접두어가 없는 본문이다(접두어가 있어도 받는다).

| 함수 | 용도 |
|---|---|
| `expandRRule(rrule, dtstart, exdates, from, to, opts?)` → `ISODate[]` | `[from, to]`(양 끝 포함) 범위의 회차. `exdates`(= `events.exdates`)는 결과에서 빼지만 COUNT에는 센다 |
| `nextOccurrence(rrule, dtstart, from, exdates = [], opts?)` → `ISODate \| null` | `from`(포함) 이후 첫 회차 |
| `todoNextDue(rrule, after)` → `ISODate \| null` | 할일 다음 회차. DB `todo_next_due(rrule, after)`(02)와 같은 결과. 해석할 수 없으면 `null` |
| `isOccurrence(rrule, dtstart, date, exdates?, opts?)` → `boolean` | 그 날짜가 회차인지 |
| `splitRRule(rrule, dtstart, splitDate, { tz?, allDay? })` → `{ before, after }` | "이후 모두" 수정용. COUNT는 나눠 갖고, 그 밖에는 `before`에 `UNTIL=전날`을 건다. `before=null`이면 이전 회차가 없고, `after=null`이면 남은 회차가 없다 |
| `describeRRule(rrule, dtstart?, { tz? })` → `string` | 화면용 설명. 예: "매주 화·목", "2주마다 월요일 · 10회", "매월 마지막 금요일 · 2026년 12월 31일까지" |
| `parseRRule(s)` → `RRule`, `buildRRule(rule)` → `string` | 파싱·직렬화 |
| `untilValue(date, { tz?, allDay? })` → `string` | 그날까지 포함하는 UNTIL 값. 종일은 `YYYYMMDD`, 시간 일정은 그날 23:59:59의 UTC 일시 |
| `RRuleError` | 형식 오류나 지원하지 않는 규칙 |

`opts`(`ExpandOptions`): `tz`(기본 `Asia/Seoul`), `time`(`HH:mm`, UNTIL 당일 포함 판단), `spanDays`(여러 날 일정이 범위에 걸치는 회차 포함), `monthEnd`(`'skip'` | `'clamp'`), `ignoreCount`, `untilDateOnly`. 할일용 프리셋은 `TODO_RULE_OPTIONS = { monthEnd: 'clamp', ignoreCount: true, untilDateOnly: true }`이다.

지원 범위: FREQ(DAILY/WEEKLY/MONTHLY/YEARLY), INTERVAL, COUNT, UNTIL, BYDAY(MONTHLY와 BYMONTH가 있는 YEARLY에서는 서수 허용), BYMONTHDAY, BYMONTH, WKST(기본 MO). DTSTART는 규칙과 맞지 않아도 첫 회차로 센다.

DB `todo_next_due`와 다른 점(cal-main 승인):
1. 일정의 기본 `monthEnd`는 `'skip'`이다. RFC 5545와 구글 캘린더처럼 31일·2월 29일이 없는 달은 건너뛴다. 말일 보정(`'clamp'`)은 할일에만 쓴다.
2. 할일 모드에서도 서수 BYDAY(`2TU`)와 BYMONTH를 해석한다. DB는 서수를 떼고 BYMONTH를 무시한다. 그래서 02의 할일 등록 화면은 DB가 지원하는 규칙만 만든다.
3. 지원하지 않는 규칙(BYSETPOS, HOURLY 등)이 오면 `RRuleError`를 던진다. `todoNextDue`만 DB처럼 `null`을 돌려준다.

### 6.2 PRD와 달라지는 점

- 캘린더 UI: PRD 4.2 기술 스택의 FullCalendar 대신 월·주·일 보기를 직접 구현한다. 다크 테마 토큰과 360px 폭에 맞추고 의존성을 줄이기 위해서다(cal-main 승인).
- RRULE: 라이브러리 없이 `src/lib/rrule.ts`로 직접 처리한다. EXDATE는 rrule 문자열에 넣지 않고 `events.exdates date[]`에 저장한다. 예외 일정은 `recurrence_parent_id`와 `original_date`(대체하는 원래 회차 날짜)를 가진다.

## 7. 완료 기준

- [ ] 일정 등록·수정·삭제가 새로고침 후에도 유지되고, 다른 계정에는 보이지 않는다.
- [ ] 매주 화·목 반복 일정을 만들고 "이 일정만", "이후 모두", "전체" 수정이 각각 의도대로 동작한다.
- [ ] 월·주·일 보기가 전환되고, 새로고침하면 마지막 보기로 열린다.
- [ ] 주 보기에서 드래그로 시간을 옮기면 저장된다.
- [ ] 카테고리를 추가하면 색상이 캘린더 칩에 반영된다.
- [ ] 360px 폭에서 가로 스크롤이 생기지 않는다.
- [x] `npm run build`, `npm run lint`를 통과한다.

## 8. 세션 시작 프롬프트

```
docs/sessions/README.md 와 docs/sessions/01-calendar.md 를 읽고 세션 01(일정관리) 작업을 진행해.
지금 폴더는 feat/calendar worktree 야. 소유 파일 밖은 수정하지 말고, 필요하면 문서의 요청 사항에 적고 알려줘.
P0 → P1 → P2 순서로 진행하고, 단계마다 완료 기준을 확인해.
```

## 9. 요청 사항
(다른 세션에 요청할 내용이나 받은 요청을 여기에 적는다)
