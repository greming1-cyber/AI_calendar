# 세션 03 — 가계부

> 웨이브 2. 00 병합 후 01·02·04·05와 동시에 진행한다. 공통 규칙은 [README.md](README.md)를 따른다.

## 1. 목표

가계부 화면(Sitemap 4.1~4.5)을 실데이터 기반의 완성된 기능으로 만든다.

| 요구사항 | 내용 | 우선순위 |
|---|---|---|
| TX-01 | 내역 등록(구분, 금액, 날짜, 분류, 결제수단, 메모) | P0 |
| TX-02 | 일별 그룹 목록, 월 이동, 월 수입·지출·잔액 | P0 |
| TX-04 | 분류 관리(기본 지출·수입 분류) | P0 |
| TX-05 | 결제수단 관리(현금, 카드 이름, 계좌) | P0 |
| TX-03 | 필터: 기간, 구분, 분류, 결제수단, 키워드 | P1 |
| TX-06 | 월 전체·분류별 예산, 80% 주의 / 100% 경고 | P1 |
| TX-07 | 고정지출(매월 n일) 등록, 해당일 내역 자동 생성 | P1 |
| TX-08 | 통계: 분류별 도넛, 최근 6개월 추이, 전월 대비 | P1 |
| TX-09 | 지출을 일정에 연결 | P2 |
| SET-04 일부 | 가계부 CSV 내보내기 | P2 |

## 2. 선행 조건

- 00이 main에 병합돼 있어야 한다. 필요한 것은 가계부 테이블, `listTransactions`, `useTransactions`, `Modal`, `useToast`, `useToday`다.

## 3. 작업 환경

```powershell
git worktree add D:\ChaAI-wt\money -b feat/money
cd D:\ChaAI-wt\money; npm install; Copy-Item D:\ChaAI\06_calendar\.env.local .
npm run dev -- -p 3003
```
- 테스트 계정: `dev+money@…`. 가입 후 `seed_demo`를 실행한다.

## 4. 소유 파일

- `src/components/money/**`, `src/app/money/**`
- `src/lib/data/transactions.ts`, `src/lib/data/budgets.ts`, `src/lib/hooks/use-transactions.ts`, `src/lib/types/money.ts`
- `src/lib/money.ts` (집계 헬퍼)
- `supabase/functions/recurring-tx/**` (고정지출을 Edge Function으로 처리할 경우)

**읽기만 한다**
- `lib/data/events.ts`(01), `components/ui/**`, `globals.css`
- `components/home/**`(06): 홈의 예산·지출 위젯이 `lib/money.ts`를 쓰므로 기존 함수 시그니처를 유지한다.

## 5. 작업 상세

### 5.1 데이터 계층
- [ ] 내역: `createTransaction`, `updateTransaction`, `deleteTransaction`
  - 금액은 원 단위 양의 정수로 검증한다. 화면 입력은 쉼표 자동 포맷.
- [ ] 분류·결제수단: 생성·수정·삭제·정렬 순서. 사용 중인 분류를 지우면 옮길 분류를 고르게 한다.
- [ ] 예산: `upsertBudget(month, categoryId | null, amount)`, `listBudgets(month)`. 지난달 예산 복사 기능을 넣는다.
- [ ] 고정지출(TX-07)
  - `recurring_transactions` CRUD
  - 생성 방식은 둘 중 하나로 정하고 이 문서에 기록한다.
    - pg_cron이 매일 00:10에 그날 해당 건을 `transactions`에 넣는다(마이그레이션 필요, README 5절).
    - 화면을 열 때 이번 달 미생성 건을 만드는 함수를 호출한다.
  - 같은 건을 두 번 만들지 않도록 `recurring_id + occurred_on` 유니크를 건다.
- [ ] `lib/money.ts`
  - `monthTotals`, `budgetStatus`, `recentDays`, `groupByDate`는 시그니처를 유지한다.
  - 예산 기준값을 `MONTHLY_BUDGET`·`BUDGETS` 상수 대신 인자로 받도록 선택 인자를 추가한다.
  - 전월 같은 기간 비교 함수 `compareToPrevMonth`를 추가한다. 현재 쓰는 `PREV_MONTH_SAME_PERIOD_EXPENSE` 상수를 대체한다.

### 5.2 화면
- [ ] `MoneyView`
  - `TODAY` 대신 `useToday()`를 쓴다.
  - 월을 이동하면 그 달 범위로 조회한다.
- [ ] 내역 등록·수정 모달 `TransactionModal`(00의 `Modal` 셸)
  - 수입·지출 전환, 금액(숫자 키패드 친화), 날짜, 분류(아이콘 칩), 결제수단, 메모
  - 연결 일정(TX-09: 그날의 일정 목록에서 선택)
- [ ] 내역 행을 누르면 수정, 길게 누르거나 메뉴로 삭제한다. `via_mcp`인 내역은 "· Claude"를 표시한다.
- [ ] 필터(TX-03): "필터" 알약을 누르면 패널이 열린다. 기간·구분·분류(복수)·결제수단·키워드, 적용 중인 필터는 알약으로 표시한다.
- [ ] 일별 / 월별(TX-08): 월별 보기를 활성화한다. 월별 합계 표와 최근 6개월 추이를 **실데이터로** 계산한다. 현재 `PAST_MONTHS` 상수를 제거한다.
- [ ] 분류별 예산 카드: 예산 미설정 분류는 "예산 설정" 링크를 보여주고, 80%·100% 색상을 구분한다.
- [ ] 예산 설정 화면(Sitemap 4.3): 월 전체·분류별 금액 입력
- [ ] 분류·결제수단 관리 화면(Sitemap 4.5)
- [ ] CSV 내보내기: "CSV 내보내기"를 누르면 현재 필터 결과를 UTF-8 BOM CSV로 다운로드한다(엑셀 한글 호환).
- [ ] 빈 상태, 로딩, 오류 상태를 넣는다.

## 6. 다른 세션과의 계약

| 제공 | 대상 |
|---|---|
| `TransactionModal` (open/onClose/initial) | 06 빠른 등록·홈 "+ 지출", 01 일정 상세 "지출 추가" |
| `listTransactions(from, to, filter?)`, `budgetStatus`, `monthTotals`, `recentDays` | 05 `list_transactions`·`get_budget_status`·`get_spending_summary`, 06 홈 |
| 분류·결제수단을 **이름으로 찾는 함수** `findCategoryByName`, `findPaymentMethodByName` | 05 (없으면 후보 반환 규칙) |
| `recurring_transactions` 조회 | 01 EVT-09 |

## 7. 완료 기준

- [ ] 내역 등록·수정·삭제 후 월 합계·잔액·예산 사용률이 즉시 갱신된다.
- [ ] 필터를 적용하면 목록과 합계가 함께 바뀐다.
- [ ] 고정지출을 등록하면 해당일에 내역이 한 번만 생긴다.
- [ ] 월별 보기와 6개월 추이가 실데이터로 그려진다.
- [ ] 다운로드한 CSV가 엑셀에서 한글이 깨지지 않고 열린다.
- [ ] `npm run build`, `npm run lint`를 통과한다.

## 8. 세션 시작 프롬프트

```
docs/sessions/README.md 와 docs/sessions/03-money.md 를 읽고 세션 03(가계부) 작업을 진행해.
지금 폴더는 feat/money worktree 야. 소유 파일 밖은 수정하지 말고, 필요하면 문서의 요청 사항에 적고 알려줘.
P0 → P1 → P2 순서로 진행하고, 단계마다 완료 기준을 확인해.
```

## 9. 요청 사항
(다른 세션에 요청할 내용이나 받은 요청을 여기에 적는다)
