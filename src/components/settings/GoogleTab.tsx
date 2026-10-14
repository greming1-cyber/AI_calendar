"use client";

// 구글 캘린더 연동 탭 (GCAL-01~03, 04 세션 담당). 지금은 시안 예시 데이터로 보여 준다.
import { useState } from "react";
import { Segmented } from "@/components/ui";
import { GOOGLE_SYNC, PROFILE } from "@/lib/mock-data";
import { ToggleList } from "./ToggleList";

const SYNC_MODES = [
  { value: "import", label: "가져오기만" },
  { value: "export", label: "내보내기만" },
  { value: "both", label: "양방향" },
] as const;

export function GoogleTab() {
  const [sync, setSync] = useState<(typeof SYNC_MODES)[number]["value"]>("both");

  return (
    <>
      <section className="card card-warm flex-row flex-wrap items-center gap-4 p-5">
        <div className="flex size-11 items-center justify-center rounded-full bg-fg font-extrabold text-ink">G</div>
        <div className="flex flex-1 flex-col gap-[3px]">
          <span className="text-[15px] font-semibold">{PROFILE.googleEmail}</span>
          <span className="text-xs text-muted">
            마지막 동기화 {GOOGLE_SYNC.lastSynced} · {SYNC_MODES.find((m) => m.value === sync)?.label}
          </span>
        </div>
        <span className="pill pill-accent">지금 동기화</span>
        <span className="pill">연결 해제</span>
      </section>

      <ToggleList
        rows={[
          { key: "gWork", label: "업무 캘린더", desc: PROFILE.workEmail, initial: true },
          { key: "gPersonal", label: "개인 캘린더", desc: PROFILE.googleEmail, initial: true },
          { key: "gHoliday", label: "대한민국 공휴일", desc: "읽기 전용", initial: false },
        ]}
      />

      <section className="card card-flat gap-3 p-5">
        <span className="text-[15px] font-semibold">동기화 방식</span>
        <div className="self-start">
          <Segmented options={SYNC_MODES} value={sync} onChange={setSync} />
        </div>
        <span className="text-xs text-subtle">양쪽에서 동시에 수정되면 최근 수정본을 우선하고 변경 이력을 보관해요.</span>
      </section>
    </>
  );
}
