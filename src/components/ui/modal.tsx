"use client";

import { useEffect, useId, useRef, type ReactNode } from "react";

/**
 * 공용 모달 셸: 배경, Esc·배경 클릭으로 닫기, 열릴 때 포커스 이동·닫힐 때 복귀, 제목.
 * 등록 모달(01·02·03)은 이 셸 안에 폼만 넣는다. 공유 계약: { open, onClose, initial? }
 */
export function Modal({
  open,
  onClose,
  title,
  subtitle,
  children,
  footer,
  width = 560,
}: {
  open: boolean;
  onClose: () => void;
  title: ReactNode;
  subtitle?: ReactNode;
  children: ReactNode;
  /** 하단 버튼 줄 */
  footer?: ReactNode;
  width?: number;
}) {
  const titleId = useId();
  const panel = useRef<HTMLDivElement>(null);
  // onClose가 렌더마다 새 함수여도 포커스 처리가 다시 돌지 않도록 ref로 들고 있는다.
  const closeRef = useRef(onClose);
  useEffect(() => {
    closeRef.current = onClose;
  });

  useEffect(() => {
    if (!open) return;
    const prev = document.activeElement as HTMLElement | null;
    // autoFocus가 있는 입력이 없으면 패널에 포커스를 둔다.
    if (!panel.current?.contains(document.activeElement)) panel.current?.focus();
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && closeRef.current();
    window.addEventListener("keydown", onKey);
    const { overflow } = document.body.style;
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = overflow;
      prev?.focus?.();
    };
  }, [open]);

  if (!open) return null;

  return (
    <div onClick={onClose} className="fixed inset-0 z-50 flex items-center justify-center bg-[rgb(10_9_8/.6)] p-6 backdrop-blur-sm">
      <div
        ref={panel}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
        onClick={(e) => e.stopPropagation()}
        style={{ width: `min(${width}px, 100%)` }}
        className="flex max-h-[calc(100vh-48px)] flex-col gap-4 overflow-auto rounded-3xl border border-white/10 bg-surface p-6 shadow-[0_30px_80px_rgb(0_0_0/.5)] outline-none"
      >
        <div className="flex items-start gap-3">
          <div className="flex flex-1 flex-col gap-1">
            <span id={titleId} className="text-xl font-bold">
              {title}
            </span>
            {subtitle && <span className="text-[13px] text-muted">{subtitle}</span>}
          </div>
          <button type="button" onClick={onClose} aria-label="닫기" className="pill size-8 justify-center p-0 text-sm">
            ✕
          </button>
        </div>
        {children}
        {footer && <div className="flex items-center gap-2 pt-1">{footer}</div>}
      </div>
    </div>
  );
}
