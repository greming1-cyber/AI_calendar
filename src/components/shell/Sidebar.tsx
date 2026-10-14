"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { NAV, isActive } from "./nav";

// PC는 좌측 세로 메뉴, 모바일(md 미만)은 하단 탭으로 보여준다.
export function Sidebar() {
  const pathname = usePathname();

  return (
    <aside className="fixed inset-x-0 bottom-0 z-40 flex justify-around border-t border-white/[.06] bg-bg/90 px-2 py-2 backdrop-blur-lg md:sticky md:top-0 md:h-screen md:flex-col md:items-center md:justify-start md:gap-2.5 md:border-t-0 md:border-r md:bg-transparent md:px-0 md:py-[22px] md:backdrop-blur-none">
      <div className="mb-[18px] hidden size-10 items-center justify-center rounded-full bg-accent font-extrabold text-ink md:flex">
        L
      </div>
      {NAV.map((n) => {
        const active = isActive(pathname, n.href);
        return (
          <Link
            key={n.href}
            href={n.href}
            aria-current={active ? "page" : undefined}
            className={`flex size-11 items-center justify-center rounded-full text-[11px] whitespace-nowrap ${
              active ? "bg-fg font-bold text-ink" : "border border-white/[.18] text-soft hover:bg-white/[.08]"
            }`}
          >
            {n.label}
          </Link>
        );
      })}
    </aside>
  );
}
