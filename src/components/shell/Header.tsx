"use client";

import { useQueryClient } from "@tanstack/react-query";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { useToast } from "@/components/ui";
import { useProfile } from "@/lib/hooks/use-profile";
import { createClient } from "@/lib/supabase/client";
import { hasSupabaseEnv } from "@/lib/supabase/env";
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
        {hasSupabaseEnv() && <ProfileMenu />}
      </div>
    </header>
  );
}

/** 헤더 프로필: 누르면 메뉴(설정·로그아웃)가 열린다. */
function ProfileMenu() {
  const router = useRouter();
  const qc = useQueryClient();
  const toast = useToast();
  const { data: profile } = useProfile();
  const [open, setOpen] = useState(false);
  const box = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => !box.current?.contains(e.target as Node) && setOpen(false);
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  // AUTH-04: 로그아웃하면 서버에서 refresh token이 폐기돼 세션이 즉시 끝난다.
  const signOut = async () => {
    setOpen(false);
    const { error } = await createClient().auth.signOut();
    if (error) return toast.error("로그아웃하지 못했어요. 다시 시도해 주세요.");
    qc.clear();
    router.replace("/login");
    router.refresh();
  };

  const name = profile?.name || profile?.email.split("@")[0] || "";

  return (
    <div ref={box} className="relative">
      <button
        type="button"
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
        className="flex items-center gap-2.5 rounded-full text-left"
      >
        <span className="flex size-9 items-center justify-center rounded-full bg-[#5a524a] text-sm font-semibold">
          {name.slice(0, 1)}
        </span>
        <span className="hidden flex-col sm:flex">
          <span className="text-[13px] font-semibold">{name || " "}</span>
          <span className="max-w-[160px] truncate text-[11px] text-muted">{profile?.email ?? " "}</span>
        </span>
      </button>
      {open && (
        <div role="menu" className="card card-glass absolute top-12 right-0 z-30 w-[200px] gap-0.5 p-1.5 shadow-[0_20px_60px_rgb(0_0_0/.45)]">
          <Link
            role="menuitem"
            href="/settings?tab=profile"
            onClick={() => setOpen(false)}
            className="rounded-xl px-3 py-2.5 text-[13px] hover:bg-white/[.08]"
          >
            내 정보
          </Link>
          <button role="menuitem" type="button" onClick={signOut} className="rounded-xl px-3 py-2.5 text-left text-[13px] hover:bg-white/[.08]">
            로그아웃
          </button>
        </div>
      )}
    </div>
  );
}
