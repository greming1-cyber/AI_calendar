export const NAV = [
  { href: "/", label: "홈", title: "대시보드" },
  { href: "/calendar", label: "일정", title: "일정관리 · 캘린더" },
  { href: "/todos", label: "할일", title: "할일관리" },
  { href: "/money", label: "가계", title: "가계부" },
  { href: "/settings", label: "설정", title: "설정" },
] as const;

export const isActive = (pathname: string, href: string) =>
  href === "/" ? pathname === "/" : pathname === href || pathname.startsWith(`${href}/`);
