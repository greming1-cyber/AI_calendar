# 세션 06 — 홈 · 검색 · 설정 · 알림 통합

> 웨이브 3. **01·02·03이 main에 병합된 뒤** 시작한다. 04·05는 병합 전이어도 시작할 수 있지만, 해당 위젯은 그 세션이 병합된 뒤 마무리한다. 공통 규칙은 [README.md](README.md)를 따른다.

## 1. 목표

각 세션이 만든 기능을 홈 대시보드, 빠른 등록, 통합 검색, 설정, 알림으로 엮는다. 남은 예시 데이터를 모두 걷어 내 앱 전체를 실데이터로 만든다.

| 요구사항 | 내용 | 우선순위 |
|---|---|---|
| HOME-01 | 오늘의 날씨 위젯(04 `useWeather`) | P0 |
| HOME-02 | 오늘의 일정(구글 포함, 종일 상단) | P0 |
| HOME-03 | 오늘 할 일, 바로 완료 | P0 |
| HOME-04 | 이번 달 지출·예산 사용률 | P0 |
| HOME-05 | 빠른 등록(일정/할일/지출 모달) | P0 |
| HOME-06 | 3일 내 고정지출·악천후 일정 요약 | P2 |
| SRCH-01 | 일정·할일·가계부 통합 키워드 검색 | P1 |
| SRCH-02 | 결과 유형별 탭, 클릭 시 상세 이동 | P1 |
| SET-02 | 화면 설정: 테마(라이트/다크/시스템), 주 시작 요일, 기본 캘린더 보기 | P1 |
| SET-03 | 알림 설정(일정·마감·예산·악천후) 저장 | P1 |
| SET-05 | 타임존(기본 Asia/Seoul) | P1 |
| SET-04 | 전체 데이터 JSON 백업·복원 (CSV는 03) | P2 |
| NOTI-01 | 브라우저 웹 푸시(PWA) | P1 |
| NOTI-02 | 앱 내 알림 센터(최근 30일) | P2 |

## 2. 선행 조건

- 00·01·02·03이 main에 병합돼 있어야 한다. 이 세션이 쓰는 것은 다음과 같다.
  - `EventModal`, `TodoModal`, `TransactionModal`
  - `useEvents`, `useTodos`, `useTransactions`, `lib/money.ts`
- 04 병합 후: `useWeather`, `useGoogleStatus`, `rainAlertsFor`
- 05 병합 후: `useMcpStatus`

## 3. 작업 환경

```powershell
git worktree add D:\ChaAI-wt\home -b feat/home
cd D:\ChaAI-wt\home; npm install; Copy-Item D:\ChaAI\06_calendar\.env.local .
npm run dev -- -p 3006
```
- 테스트 계정: `dev+home@…`. 가입 후 `seed_demo`를 실행한다.

## 4. 소유 파일

- `src/components/home/**`, `src/app/page.tsx`
- `src/components/shell/**` (헤더 검색·빠른 등록·프로필·알림 아이콘), `src/app/layout.tsx`, `src/app/globals.css`, `src/components/ui/**` — 웨이브 3부터 00에게서 넘겨받는다
- `src/components/search/**`, `src/app/search/**`, `src/lib/data/search.ts`
- `src/components/settings/NotificationsTab.tsx`, `DisplayTab.tsx`, `DataTab.tsx`, `SettingsView.tsx`(탭 목록)
- `src/lib/data/notifications.ts`, `public/manifest.webmanifest`, 서비스 워커, `supabase/functions/notify/**`
- `src/lib/mock-data.ts`, `src/lib/store.tsx` — **삭제 담당**

**읽기만 한다**
- 각 도메인 세션의 모달·훅·데이터 함수. 수정이 필요하면 README 4절 절차로 요청한다.

## 5. 작업 상세

### 5.1 홈 대시보드 (HOME-01~06)
- [ ] `HomeDashboard`의 모든 값을 실데이터 훅으로 바꾼다.
  - 날씨: `useWeather()`. 캐시가 오래됐으면 "n분 전 기준"으로 표시한다.
  - 오늘 일정: `useEvents(today)`. 동기화 문구는 `useGoogleStatus()`, 연결 안 됐으면 숨긴다.
  - 오늘 할 일: `useTodos({ dueTo: today, status: 'open' })`. 처음 연 목록을 고정하는 현재 동작을 유지한다.
  - 7일 지출·예산: `useTransactions` + `lib/money.ts` + 예산 조회
- [ ] 빠른 등록(HOME-05)
  - 홈의 "+ 일정 / + 할일 / + 지출"과 헤더의 "+ 빠른 등록" 메뉴에서 각 세션의 모달을 연다. 페이지 이동이 아니다.
  - 날짜 선택 알약("10월 14일 (수) ▾")으로 기준 날짜를 바꾸면 위젯 전체가 그 날짜로 바뀐다.
- [ ] 인사말: 시간대별(아침/오후/저녁) 문구, 예시 문장 순환
- [ ] (P2) 다가오는 일: 3일 내 고정지출, 악천후가 예보된 야외 일정
- [ ] 위젯마다 로딩 스켈레톤과 오류 상태를 넣는다. 위젯 하나가 실패해도 나머지는 표시돼야 한다.

### 5.2 통합 검색 (SRCH-01, 02)
- [ ] 검색 범위
  - 일정: 제목·장소·메모
  - 할일: 제목·메모
  - 가계부: 메모·분류명
  - Postgres `ilike` 또는 `pg_trgm`으로 구현한다. 인덱스가 필요하면 README 5절 절차로 추가한다.
- [ ] 헤더 검색창
  - ⌘K / Ctrl+K로 명령 팔레트를 연다. 입력 중 300ms 지연 후 검색한다.
  - 결과는 유형별 그룹, 키보드로 이동, Enter로 상세(해당 날짜 캘린더, 할일 수정 모달, 가계부 해당 월)로 간다.
- [ ] `/search?q=` 결과 페이지(유형별 탭). `cacheComponents` 환경에서 `searchParams`를 쓰는 방식은 문서를 확인한다.

### 5.3 설정 (SET-02, 03, 04, 05)
- [ ] 화면 탭(SET-02)
  - 테마: 현재 다크 전용이다. 라이트 토큰을 `globals.css`에 추가하고 `data-theme`로 전환한다. 시스템 설정을 따르는 옵션도 둔다.
  - 주 시작 요일: `lib/date.ts`의 `monthGrid`에 선택 인자로 추가한다. 01과 협의한다.
  - 기본 캘린더 보기
  - 값은 `profiles`에 저장한다.
- [ ] 타임존(SET-05): `profiles.timezone`. `useToday()`와 날짜 계산이 이 값을 따르는지 확인한다.
- [ ] 알림 탭(SET-03): 스위치 값을 `profiles`(또는 별도 설정 컬럼)에 저장한다.
- [ ] 데이터 탭(SET-04)
  - 전체 데이터 JSON 내보내기·가져오기(가져오기 전 미리보기와 확인)
  - 가계부 CSV는 03의 기능으로 연결한다.

### 5.4 알림 (NOTI-01, 02)
- [ ] PWA: `manifest.webmanifest`, 아이콘, 서비스 워커(푸시 수신·클릭 시 앱 열기)
- [ ] 웹 푸시 구독
  - VAPID 키는 `npx supabase secrets set`으로 관리한다.
  - 구독 정보는 테이블에 저장한다(마이그레이션 필요, README 5절).
- [ ] Edge Function `notify` + pg_cron이 매분 발송 대상을 찾는다. 각 항목은 알림 설정이 켜진 것만 보낸다.
  - 일정 알림(`reminder_minutes`)
  - 할일 마감(당일 09시)
  - 예산 80%·100% 도달
  - 악천후(04 `rainAlertsFor`, 전날 18시)
- [ ] 알림 센터(NOTI-02): 헤더 종 아이콘 → 최근 30일 `notifications`, 읽음 처리

### 5.5 정리
- [ ] `src/lib/mock-data.ts`, `src/lib/store.tsx`를 삭제한다. 남은 import가 없어야 한다.
- [ ] 헤더 "Claude 연결됨"은 05의 `useMcpStatus()`로, 이름·아바타는 프로필로 바꾼다.
- [ ] 모바일 하단 탭, 360px 폭, 키보드 조작, 색 대비(WCAG AA)를 점검한다(PRD 6장).
- [ ] `CLAUDE.md`·`AGENTS.md`의 "현재 상태"를 최종 구조로 갱신한다.

## 6. 다른 세션과의 계약

| 사용 | 제공 세션 |
|---|---|
| `EventModal`, `useEvents` | 01 |
| `TodoModal`, `useTodos`, `projectProgress` | 02 |
| `TransactionModal`, `useTransactions`, `lib/money.ts`, CSV 내보내기 | 03 |
| `useWeather`, `useGoogleStatus`, `rainAlertsFor` | 04 |
| `useMcpStatus` | 05 |

## 7. 완료 기준

- [ ] 새 계정에 `seed_demo`를 실행하면 홈의 모든 위젯이 실데이터로 표시되고, `mock-data.ts`·`store.tsx`가 저장소에 없다.
- [ ] 홈에서 빠른 등록한 일정·할일·지출이 즉시 해당 위젯과 각 화면에 반영된다.
- [ ] Ctrl+K로 "치과"를 검색하면 일정·할일 결과가 나오고 Enter로 이동한다.
- [ ] 라이트 테마와 월요일 시작 설정이 새로고침 후에도 유지된다.
- [ ] 알림을 허용하면 10분 전 일정 알림이 브라우저 푸시로 온다.
- [ ] 360px 폭의 모든 화면에서 가로 스크롤이 없다.
- [ ] `npm run build`, `npm run lint`를 통과한다.

## 8. 세션 시작 프롬프트

```
docs/sessions/README.md 와 docs/sessions/06-home-integration.md 를 읽고 세션 06(홈·검색·설정·알림 통합) 작업을 진행해.
지금 폴더는 feat/home worktree 이고, 01·02·03은 main에 병합돼 있어. 먼저 git merge main 으로 최신 상태를 받고,
홈(5.1) → 검색(5.2) → 설정(5.3) → 알림(5.4) → 정리(5.5) 순서로 진행해.
```

## 9. 요청 사항
(다른 세션에 요청할 내용이나 받은 요청을 여기에 적는다)
