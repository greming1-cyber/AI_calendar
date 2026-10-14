"use client";

// 알림 설정 탭 (SET-03, 06 세션 담당). 지금은 시안 그대로 화면 상태만 바뀐다.
import { ToggleList } from "./ToggleList";

export function NotificationsTab() {
  return (
    <ToggleList
      rows={[
        { key: "evAlert", label: "일정 알림", desc: "일정 시작 전 설정한 시간에 알림", initial: true },
        { key: "dueAlert", label: "할일 마감 알림", desc: "마감 당일 오전 9시", initial: true },
        { key: "budgetAlert", label: "예산 초과 알림", desc: "분류별 예산의 80%, 100% 도달 시", initial: true },
        { key: "weatherAlert", label: "악천후 예보 알림", desc: "야외 일정 날짜에 비·눈 예보가 있을 때", initial: true },
      ]}
    />
  );
}
