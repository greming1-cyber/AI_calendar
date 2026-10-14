# 세션 04 — 외부 연동 (구글 캘린더 · 날씨)

> 웨이브 2. 00 병합 후 01·02·03·05와 동시에 진행한다. 공통 규칙은 [README.md](README.md)를 따른다.

## 1. 목표

구글 캘린더 양방향 동기화와 기상청 날씨 정보를 붙인다. 화면 쪽은 설정의 구글·날씨 탭만 직접 만들고, 홈·캘린더에는 **훅을 제공**한다. 그 화면에 붙이는 일은 01·06이 한다.

| 요구사항 | 내용 | 우선순위 |
|---|---|---|
| GCAL-01 | 구글 계정 연결·해제(OAuth, `calendar.events` + `calendar.readonly`) | P0 |
| GCAL-02 | 동기화할 캘린더 여러 개 선택 | P0 |
| GCAL-03 | 동기화 방향: 가져오기만 / 내보내기만 / 양방향 | P0 |
| GCAL-04 | 증분 가져오기(syncToken), 15분 주기 + "지금 동기화" | P0 |
| GCAL-05 | 서비스에서 바꾼 일정을 구글에 즉시 반영 | P0 |
| GCAL-07 | 구글 일정 구분 표시용 데이터(캘린더 색상) | P0 |
| GCAL-10 | 토큰 만료·철회 시 "다시 연결 필요" 상태 | P0 |
| GCAL-06 | 일정 저장 위치 선택용 캘린더 목록 제공 | P1 |
| GCAL-08 | 충돌: `updated`가 늦은 쪽 우선, 덮어쓴 버전 이력 보관 | P1 |
| GCAL-09 | 구글 Push 알림(watch 채널) | P2 |
| WTH-01 | 위치: 현재 위치 또는 기본 지역(시/군/구) | P0 |
| WTH-02 | 현재 날씨(기온, 체감, 하늘, 강수 형태, 습도, 풍속) | P0 |
| WTH-03 | 단기 예보(오늘~모레, 1~3시간 단위) | P0 |
| WTH-09 | 같은 격자·시간대 30분 캐시 | P0 |
| WTH-04 | 중기 예보(최대 10일 일별) | P1 |
| WTH-05·06 | 캘린더 날짜별 아이콘, 일정 상세 예보용 데이터 | P1 |
| WTH-07 | 일정 전날 18시 강수 60% 이상 알림 판단 | P2 |
| WTH-08 | 미세먼지 등급 | P2 |

## 2. 선행 조건

- 00이 main에 병합돼 있어야 한다. 필요한 것은 `google_accounts`, `google_calendars`, `sync_conflicts`, `weather_cache`, `profiles.weather_location`과 설정 탭 파일 분리다.
- 사람이 미리 준비할 것
  - **Google Cloud 콘솔**
    - Calendar API 사용 설정
    - OAuth 동의 화면에 `calendar.events`·`calendar.readonly` 범위 추가, 테스트 사용자 등록
    - 리디렉션 URI 추가: `http://localhost:3004/api/google/callback`, 배포 주소
  - **공공데이터포털(data.go.kr)**: "기상청_단기예보 조회서비스", "기상청_중기예보 조회서비스" 활용 신청 후 인증키 발급
  - 비밀값 등록(코드에 쓰지 않음)
    - `npx supabase secrets set GOOGLE_CLIENT_ID=… GOOGLE_CLIENT_SECRET=… KMA_SERVICE_KEY=…`
    - `.env.local`에도 `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`를 둔다.

## 3. 작업 환경

```powershell
git worktree add D:\ChaAI-wt\integrations -b feat/integrations
cd D:\ChaAI-wt\integrations; npm install; Copy-Item D:\ChaAI\06_calendar\.env.local .
npm run dev -- -p 3004
```
- 테스트 계정: `dev+integrations@…`. 실제 구글 계정으로 연결해 테스트하되, **테스트용 구글 캘린더**를 따로 만들어 쓴다.

## 4. 소유 파일

- `supabase/functions/gcal-sync/**`, `supabase/functions/weather/**`, `supabase/functions/_shared/google.ts`·`kma.ts`
- `src/app/api/google/**` (OAuth 시작·콜백 라우트 핸들러)
- `src/lib/data/google.ts`, `src/lib/data/weather.ts`, `src/lib/hooks/use-google.ts`, `src/lib/hooks/use-weather.ts`
- `src/lib/kma-grid.ts` (위경도 → 기상청 격자 변환), `src/lib/regions.json` (시/군/구 좌표)
- `src/components/settings/GoogleTab.tsx`, `src/components/settings/WeatherTab.tsx`
- 마이그레이션(README 5절 절차): 동기화 대기열, pg_cron 등록

**읽기만 한다**
- `components/calendar/**`(01), `components/home/**`(06), `lib/data/events.ts`(01)

## 5. 작업 상세

### 5.1 구글 계정 연결 (GCAL-01, 02, 10)
- [ ] `/api/google/start`: state(CSRF) 쿠키를 만들고 Google OAuth로 리디렉트한다(`access_type=offline`, `prompt=consent`).
- [ ] `/api/google/callback`
  - code를 토큰으로 교환한다.
  - refresh token을 **Vault**(또는 service role 전용 컬럼)에 저장한다.
  - 캘린더 목록을 조회해 `google_calendars`에 넣는다.
- [ ] 해제: 토큰 revoke → 계정·캘린더 행 삭제 → 구글 출처 일정 삭제 여부를 사용자에게 묻는다(PRD 4.5-6).
- [ ] 토큰 갱신 실패(invalid_grant)는 `google_accounts.status='reauth_required'`로 둔다. 설정 탭과 `useGoogleStatus()`에서 "다시 연결 필요"로 노출한다.
- [ ] 참고: 동의 화면이 "테스트" 상태면 refresh token이 7일 후 만료된다(PRD 9장 리스크). 설정 탭에 안내 문구를 둔다.

### 5.2 동기화 — Edge Function `gcal-sync` (GCAL-03~05, 08)
- [ ] **가져오기**
  - 최초: 과거 3개월 ~ 미래 12개월 전체를 가져와 `events(source='google')`에 넣는다. `nextSyncToken`을 저장한다.
  - 증분: syncToken으로 변경분만 반영한다(생성·수정·취소). 410 응답이면 전체를 다시 동기화한다.
  - 종일 일정(`date`)과 시간 일정(`dateTime`)을 구분하고, 반복 일정은 `singleEvents=true`로 회차를 받는다.
- [ ] **내보내기**: 01은 동기화를 몰라도 되게 DB 쪽에서 처리한다.
  - `events` insert/update/delete 트리거로 `source='google'`인 변경을 대기열 테이블(`gcal_outbox`)에 쌓는다.
  - `gcal-sync`가 대기열을 처리한다(insert/patch/delete, `If-Match: etag`).
  - 처리 결과로 받은 `google_event_id`, `google_etag`를 저장한다.
- [ ] **충돌**(GCAL-08): 412(etag 불일치)면 원격을 다시 받아 `updated`를 비교한다. 늦은 쪽을 적용하고, 진 쪽은 `sync_conflicts`에 스냅샷으로 남긴다.
- [ ] 동기화 방향 설정을 존중한다: 가져오기만이면 대기열을 처리하지 않고, 내보내기만이면 가져오기를 건너뛴다.
- [ ] **주기 실행**: pg_cron + pg_net으로 15분마다 `gcal-sync`를 호출하고, 대기열은 1분마다 처리한다.
- [ ] "지금 동기화": 설정 탭에서 사용자 JWT로 `gcal-sync`를 직접 호출한다.
- [ ] (P2) watch 채널 등록·갱신, 웹훅 수신
- [ ] `npx supabase functions deploy gcal-sync`

### 5.3 날씨 — Edge Function `weather` (WTH-01~09)
- [ ] 입력은 `{ lat, lon }` 또는 `{ nx, ny }`다. `kma-grid`로 격자로 바꾼다(기상청 LCC 변환 공식).
- [ ] 기상청 API 호출
  - 초단기실황(현재)
  - 단기예보(오늘~모레, 발표시각 02·05·08…시 규칙 처리)
  - 중기 기온·육상예보(3~10일, 지역 코드 매핑)
- [ ] 표준 응답 형식을 정하고 `src/lib/types/weather.ts`에 둔다.
  ```ts
  { updatedAt, current: { temp, feelsLike, sky, precipType, humidity, wind },
    hourly: { time, temp, sky, rainChance }[], daily: { date, high, low, sky, rainChance }[] }
  ```
- [ ] `weather_cache` 캐시: 현재·단기 30분, 중기 6시간. API가 실패하면 **만료된 캐시라도** `stale: true`와 함께 반환한다.
- [ ] (P2) 미세먼지: 에어코리아 API, 별도 인증키
- [ ] `npx supabase functions deploy weather`

### 5.4 훅과 설정 화면
- [ ] `useWeather({ date? })`: 사용자 기본 위치 기준. 01·06이 쓴다.
  - 날짜를 주면 그날의 일별·시간별 예보를, 없으면 현재와 오늘을 반환한다.
- [ ] `useGoogleStatus()`: 홈의 "Google 동기화 · n분 전"용. 연결 여부, 마지막 동기화 시각, 재연결 필요 여부를 준다.
- [ ] `useGoogleCalendars()`: 일정 저장 위치 선택용(GCAL-06).
- [ ] `GoogleTab`
  - 연결 버튼, 계정 이메일, 마지막 동기화, 지금 동기화, 연결 해제
  - 캘린더별 동기화 스위치, 동기화 방향
- [ ] `WeatherTab`
  - 현재 위치 사용(브라우저 위치 → 격자로 저장, 위경도 원본은 저장하지 않음)
  - 지역 검색·변경(`regions.json`), 온도 단위, 캘린더 날씨 아이콘·미세먼지 표시 설정
- [ ] (WTH-07 판단 로직) `rainAlertsFor(date)` 함수를 제공한다. 실제 알림 발송은 06이 한다.

## 6. 다른 세션과의 계약

| 제공 | 대상 |
|---|---|
| `useWeather`, 표준 날씨 타입 | 01 캘린더·일정 상세, 06 홈 위젯 |
| `useGoogleStatus`, `useGoogleCalendars` | 06 홈, 01 등록 모달 저장 위치 |
| `events(source='google')` 데이터와 동기화 | 01 (01은 `source`만 지정) |
| `get_weather`용 서버 함수(Edge Function 직접 호출 가능) | 05 MCP |
| `rainAlertsFor(date)` | 06 알림 |

- 01이 구글 일정을 수정하면 트리거가 동기화를 처리한다. 01에게 추가 작업을 요구하지 않는 것이 원칙이다.

## 7. 완료 기준

- [ ] 구글 계정을 연결하고 캘린더 2개를 고르면 일정이 서비스 캘린더에 `G`로 나타난다.
- [ ] 구글에서 만든 일정이 "지금 동기화" 또는 15분 내에 반영되고, 서비스에서 만든 구글 일정이 구글 캘린더에 나타난다.
- [ ] 양쪽에서 같은 일정을 고치면 늦은 쪽이 남고 `sync_conflicts`에 이력이 생긴다.
- [ ] 구글 권한을 철회하면 설정·홈에 "다시 연결 필요"가 표시되고, 일정·할일·가계부는 정상 동작한다.
- [ ] 마포구 기준 현재 날씨·시간별·10일 예보가 나오고, 30분 내 재요청은 캐시를 쓴다.
- [ ] 기상청 API 키를 잘못 넣어도 앱이 깨지지 않고 마지막 캐시를 보여준다.
- [ ] `npm run build`, `npm run lint`를 통과한다.

## 8. 세션 시작 프롬프트

```
docs/sessions/README.md 와 docs/sessions/04-integrations.md 를 읽고 세션 04(구글 캘린더·날씨 연동) 작업을 진행해.
지금 폴더는 feat/integrations worktree 야. 소유 파일 밖은 수정하지 말고, 마이그레이션은 README 5절 절차를 따라.
Google·기상청 키는 내가 준비해서 알려줄게. 날씨(5.3)부터 시작하고, 그다음 구글(5.1→5.2), 마지막에 설정 화면을 해.
```

## 9. 요청 사항
(다른 세션에 요청할 내용이나 받은 요청을 여기에 적는다)
