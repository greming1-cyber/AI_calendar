"use client";

// 날씨 설정 탭 (WTH-01, 04 세션 담당). 지금은 시안 예시 데이터로 보여 준다.
import { useState } from "react";
import { Segmented } from "@/components/ui";
import { PROFILE } from "@/lib/mock-data";
import { ToggleList } from "./ToggleList";

export function WeatherTab() {
  const [unit, setUnit] = useState<"c" | "f">("c");

  return (
    <>
      <section className="card card-warm flex-row flex-wrap items-center gap-4 p-5">
        <div className="flex flex-1 flex-col gap-[3px]">
          <span className="text-xs text-muted">기본 지역</span>
          <span className="text-xl font-semibold">{PROFILE.region}</span>
        </div>
        <span className="pill">현재 위치 사용</span>
        <span className="pill">지역 변경</span>
      </section>

      <ToggleList
        rows={[
          { key: "wxCalendar", label: "캘린더 날씨 아이콘", desc: "예보 가능 기간(최대 10일)에 표시", initial: true },
          { key: "wxDust", label: "미세먼지 표시", desc: "홈 날씨 위젯에 함께 표시", initial: false },
        ]}
      />

      <section className="card card-flat flex-row flex-wrap items-center gap-4 p-5">
        <div className="flex flex-1 flex-col gap-[3px]">
          <span className="text-sm">온도 단위</span>
          <span className="text-xs text-subtle">홈 위젯, 캘린더, 일정 상세에 적용</span>
        </div>
        <Segmented
          options={[
            { value: "c", label: "섭씨 °C" },
            { value: "f", label: "화씨 °F" },
          ]}
          value={unit}
          onChange={setUnit}
        />
      </section>
    </>
  );
}
