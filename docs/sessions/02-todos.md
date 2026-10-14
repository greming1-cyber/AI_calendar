# 세션 02 — 할일관리

> 웨이브 2. 00 병합 후 01·03·04·05와 동시에 진행한다. 공통 규칙은 [README.md](README.md)를 따른다.

## 1. 목표

할일 화면(Sitemap 3.1~3.4)을 실데이터 기반의 완성된 할일관리 기능으로 만든다.

| 요구사항 | 내용 | 우선순위 |
|---|---|---|
| TODO-01 | 할일 등록(제목, 마감일·일시, 우선순위, 프로젝트, 메모) | P0 |
| TODO-02 | 탭: 오늘 / 예정 / 전체 / 완료, 기본 정렬 마감일 → 우선순위 | P0 |
| TODO-03 | 체크로 완료, 완료 시각 기록, 완료 취소 | P0 |
| TODO-04 | 지난 마감 미완료 강조 | P0 |
| TODO-05 | 프로젝트 생성·수정·삭제, 진행률 | P1 |
| TODO-06 | 하위 체크리스트(서브태스크) | P1 |
| TODO-07 | 반복 할일(매일/매주/매월), 완료하면 다음 회차 자동 생성 | P1 |
| TODO-08 | 할일을 일정에 연결 | P2 |

## 2. 선행 조건

- 00이 main에 병합돼 있어야 한다. 필요한 것은 `todos`·`projects` 테이블, `listTodos`, `useTodos`, `Modal`, `useToast`, `useToday`다.

## 3. 작업 환경

```powershell
git worktree add D:\ChaAI-wt\todos -b feat/todos
cd D:\ChaAI-wt\todos; npm install; Copy-Item D:\ChaAI\06_calendar\.env.local .
npm run dev -- -p 3002
```
- 테스트 계정: `dev+todos@…`. 가입 후 `seed_demo`를 실행한다.

## 4. 소유 파일

- `src/components/todos/**`, `src/app/todos/**`
- `src/lib/data/todos.ts`, `src/lib/data/projects.ts`, `src/lib/hooks/use-todos.ts`, `src/lib/types/todos.ts`
- `src/lib/todo.ts` (탭·정렬·진행률 헬퍼)

**읽기만 한다**
- `lib/data/events.ts`(01), `components/ui/**`, `globals.css`
- `components/home/**`(06): 홈의 "오늘 할 일"은 02의 훅을 그대로 쓰므로 훅 시그니처만 지킨다.

## 5. 작업 상세

### 5.1 데이터 계층
- [x] 할일 쓰기: `createTodo`, `updateTodo`, `deleteTodo`
  - `setTodoDone(id, done)`은 `completed_at`을 기록하거나 비운다. → `completeTodo`(DB 함수 `complete_todo`)를 거친다.
- [x] 프로젝트: `createProject`, `updateProject`, `archiveProject`, `deleteProject`
  - 프로젝트에 할일이 있으면 옮길 프로젝트를 고르게 한다.
  - 파일은 `lib/data/projects.ts`로 나누지 않고 `lib/data/todos.ts`에 둔다(00의 `listProjects`가 이미 여기 있다).
- [x] 서브태스크: 같은 `todos` 테이블의 `parent_id`를 쓴다. `listTodos`는 기본적으로 최상위만 반환하고 `subtaskCount/subtaskDone`을 함께 준다. 화면 메모의 "체크리스트 2/4"를 실제 값으로 바꾼다.
- [x] 반복 할일(TODO-07): `rrule`이 있는 할일을 완료하면 같은 트랜잭션에서 다음 회차를 만든다.
  - DB 함수 `complete_todo(p_id, p_done)` — `supabase/migrations/20261014150000_todos_complete_todo.sql`. 05의 MCP `complete_todo`도 같은 로직을 쓴다.
  - 반환 `{ todo, next }`. 완료본의 `rrule`은 비우고 새 회차로 옮긴다(완료 취소 후 다시 완료해도 중복 생성 없음).
  - 서브태스크는 **전부 미완료 상태로** 새 회차에 복사한다. 반복 체크리스트는 매 회차 처음부터 다시 하기 때문이다(계획의 "미완료만 복사"에서 변경, cal-main 승인).
  - 그 달에 없는 날짜는 말일로 옮긴다. `BYMONTHDAY`가 없는 월 반복은 다음 회차 rrule에 기준일을 적어 31일이 유지된다.
- [x] 뮤테이션 훅: 낙관적 업데이트, 실패 시 롤백·토스트 (등록·서브태스크 추가는 저장 후 다시 읽는다)

### 5.2 화면
- [x] `TodoView`
  - `TODAY` 대신 `useToday()`를 쓴다.
  - 정렬 드롭다운: 마감일 / 우선순위 / 생성순.
- [x] 할일 등록·수정 모달 `TodoModal`(00의 `Modal` 셸 사용)
  - 제목(Enter로 저장), 마감(날짜 또는 날짜+시간), 우선순위 3단계, 프로젝트, 메모
  - 서브태스크 목록, 반복 규칙, 연결 일정(TODO-08: 01의 `listEvents`로 마감일 ±7일 일정 검색)
  - 반복은 DB가 지원하는 규칙만 만든다: 매일/매주(요일)/매월(날짜·말일)/매년, 간격, 종료일
- [x] 목록 행을 누르면 수정 모달이 열린다. 완료 체크는 체크박스 영역만 반응하게 한다.
- [x] 완료 탭: 최근 완료순, "완료 취소" 가능
- [x] 프로젝트 패널(TODO-05)
  - "+ 추가"로 생성, ✎ 버튼으로 수정·삭제(이름 영역은 필터 선택에 쓴다)
  - 프로젝트를 고르면 목록이 그 프로젝트로 필터된다. 모바일은 드롭다운으로 보여준다.
- [x] 반복 할일 패널: `rrule`이 있는 할일을 실제 데이터로 보여주고, 다음 회차 날짜를 계산해 표시한다.
  - TODO(02): 01 병합 후 `lib/todo.ts`의 임시 `nextDue`·`rruleLabel`·`buildRule`을 `rrule.ts`로 교체
- [x] 빈 상태, 로딩, 오류 상태를 넣는다.

## 6. 다른 세션과의 계약

| 제공 | 대상 |
|---|---|
| `TodoModal` (open/onClose/initial, 수정 시 todo) — `components/todos/TodoModal.tsx` | 06 빠른 등록, 01 일정 상세의 "할일 추가" |
| `listTodos({ status?, parentId?, dueFrom?, dueTo?, projectId? })` | 01 캘린더 표시(EVT-08), 05 `list_todos`, 06 홈·검색 |
| `complete_todo(p_id, p_done)` 동작(반복 다음 회차 생성), `useToggleTodo` 결과 `{ todo, next }` | 05 `complete_todo` |
| `projectProgress()` (`lib/todo.ts`) | 06 홈 위젯 |

- 00의 `listTodos` 기본 시그니처에 선택 인자만 추가한다.

## 7. 완료 기준

- [ ] 할일 등록·수정·삭제·완료·완료 취소가 새로고침 후에도 유지된다.
- [ ] 탭 개수(오늘 n, 예정 n …)가 실제 데이터와 일치하고, 지난 마감은 빨간색이다.
- [ ] 매주 반복 할일을 완료하면 다음 주 회차가 생긴다.
- [ ] 서브태스크를 체크하면 상위 할일의 "n/m"이 갱신된다.
- [ ] 프로젝트 진행률이 할일 완료에 따라 바뀐다.
- [x] `npm run build`, `npm run lint`를 통과한다.

## 8. 세션 시작 프롬프트

```
docs/sessions/README.md 와 docs/sessions/02-todos.md 를 읽고 세션 02(할일관리) 작업을 진행해.
지금 폴더는 feat/todos worktree 야. 소유 파일 밖은 수정하지 말고, 필요하면 문서의 요청 사항에 적고 알려줘.
P0 → P1 → P2 순서로 진행하고, 단계마다 완료 기준을 확인해.
```

## 9. 요청 사항
(다른 세션에 요청할 내용이나 받은 요청을 여기에 적는다)

- **main(마이그레이션 적용 후)**: `complete_todo`·`todo_next_due`를 포함하도록 `database.types.ts`를 다시 만든다. 그 뒤 `lib/data/todos.ts`의 `completeTodo` 캐스팅을 지운다.
- **01**: `rrule.ts` 병합 후 02가 `lib/todo.ts`의 임시 반복 함수를 교체한다. DB `todo_next_due`와 TS `nextDue`는 4,806개 경우에서 결과가 같다(PGlite 대조).
