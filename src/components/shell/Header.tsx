"use client";

import { usePathname } from "next/navigation";
import { PROFILE } from "@/lib/mock-data";
import { NAV, isActive } from "./nav";

export function Header() {
  const pathname = usePathname();
  const title = NAV.find((n) => isActive(pathname, n.href))?.title ?? "";

  return (
    <header className="relative z-10 grid grid-cols-[auto_auto] items-center justify-between gap-4 px-4 py-[22px] md:px-7 lg:grid-cols-[auto_minmax(0,520px)_auto]">
      <div className="flex flex-col gap-0.5">
        <span className="text-sm font-bold">라이프 매니저</span>
        <span className="text-xs text-muted">{title}</span>
      </div>
      {/* 통합 검색(SRCH-01)은 P1. 지금은 입력 자리만 보여준다. */}
      <div className="card-glass hidden items-center gap-2.5 rounded-full border border-white/10 px-[18px] py-[11px] text-[13px] text-subtle lg:flex">
        검색 · 일정, 할일, 가계부
        <span className="ml-auto font-mono text-[11px]">⌘K</span>
      </div>
      <div className="flex items-center justify-end gap-2.5">
        <span className="pill pill-accent hidden px-4 py-[9px] text-[13px] sm:inline-flex">+ 빠른 등록</span>
        <div className="size-9 rounded-full bg-[#5a524a]" />
        <div className="flex flex-col">
          <span className="text-[13px] font-semibold">{PROFILE.name}</span>
          <span className="text-[11px] text-muted">Claude 연결됨</span>
        </div>
      </div>
    </header>
  );
}
