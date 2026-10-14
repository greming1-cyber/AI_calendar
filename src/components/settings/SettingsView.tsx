"use client";

// 설정 화면: 탭 목록만 둔다. 각 탭은 담당 세션의 파일이다(docs/sessions/README.md 4절).
import { useRouter, useSearchParams } from "next/navigation";
import type { ComponentType } from "react";
import { GoogleTab } from "./GoogleTab";
import { McpTab } from "./McpTab";
import { NotificationsTab } from "./NotificationsTab";
import { ProfileTab } from "./ProfileTab";
import { WeatherTab } from "./WeatherTab";

const TABS = {
  profile: { label: "내 정보", isNew: false, desc: "이름과 계정을 관리해요.", Tab: ProfileTab },
  noti: { label: "알림 설정", isNew: false, desc: "받을 알림을 선택하세요.", Tab: NotificationsTab },
  google: { label: "구글 캘린더 연동", isNew: true, desc: "구글 캘린더와 일정을 동기화해요.", Tab: GoogleTab },
  weather: { label: "날씨 설정", isNew: true, desc: "날씨 정보 표시 방식을 설정해요.", Tab: WeatherTab },
  mcp: {
    label: "MCP 연결",
    isNew: true,
    desc: "Claude Desktop / Claude Code에서 대화로 일정·할일·가계부를 다뤄요.",
    Tab: McpTab,
  },
} satisfies Record<string, { label: string; isNew: boolean; desc: string; Tab: ComponentType }>;

type TabId = keyof typeof TABS;
const isTab = (v: string | null): v is TabId => v != null && v in TABS;

export function SettingsView() {
  const router = useRouter();
  const params = useSearchParams();
  const tabParam = params.get("tab");
  // 탭은 주소(?tab=)에 남겨 새로고침·헤더 링크(/settings?tab=profile)로 바로 열 수 있게 한다.
  const tab: TabId = isTab(tabParam) ? tabParam : "profile";
  const def = TABS[tab];

  return (
    <main className="grid items-start gap-4 px-4 pb-7 md:grid-cols-[minmax(180px,240px)_minmax(0,1fr)] md:px-7">
      <nav className="card card-flat flex-row gap-0.5 overflow-x-auto p-3.5 md:flex-col">
        {(Object.keys(TABS) as TabId[]).map((id) => (
          <button
            key={id}
            type="button"
            aria-current={tab === id ? "page" : undefined}
            onClick={() => router.replace(`/settings?tab=${id}`, { scroll: false })}
            className={`flex justify-between gap-3 rounded-xl px-3.5 py-[11px] text-left text-sm whitespace-nowrap ${
              tab === id ? "bg-white/10 font-semibold text-fg" : "text-muted hover:bg-white/5"
            }`}
          >
            {TABS[id].label}
            {TABS[id].isNew && <span className="text-[10px] text-accent">신규</span>}
          </button>
        ))}
      </nav>

      <div className="flex max-w-[880px] min-w-0 flex-col gap-3">
        <div className="flex flex-col gap-1 pt-1 pb-2">
          <span className="text-2xl font-bold">{def.label}</span>
          <span className="text-[13px] text-muted">{def.desc}</span>
        </div>
        <def.Tab />
      </div>
    </main>
  );
}
