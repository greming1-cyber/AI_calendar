"use client";

import { createContext, useCallback, useContext, useMemo, useRef, useState, type ReactNode } from "react";

type Tone = "info" | "success" | "error";
interface ToastItem {
  id: number;
  tone: Tone;
  message: string;
}

interface ToastApi {
  show: (message: string, tone?: Tone) => void;
  success: (message: string) => void;
  error: (message: string) => void;
}

const ToastContext = createContext<ToastApi | null>(null);

const DURATION = 3000;

/** 저장·삭제·오류 알림. providers.tsx에서 감싼다. */
export function ToastProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<ToastItem[]>([]);
  const seq = useRef(0);

  const show = useCallback((message: string, tone: Tone = "info") => {
    const id = ++seq.current;
    setItems((list) => [...list.slice(-2), { id, tone, message }]);
    setTimeout(() => setItems((list) => list.filter((t) => t.id !== id)), DURATION);
  }, []);

  const api = useMemo<ToastApi>(
    () => ({ show, success: (m) => show(m, "success"), error: (m) => show(m, "error") }),
    [show],
  );

  return (
    <ToastContext.Provider value={api}>
      {children}
      <div aria-live="polite" className="pointer-events-none fixed inset-x-0 bottom-24 z-[60] flex flex-col items-center gap-2 px-4 md:bottom-6">
        {items.map((t) => (
          <div
            key={t.id}
            role={t.tone === "error" ? "alert" : "status"}
            className={`card-glass pointer-events-auto flex max-w-[420px] items-center gap-2.5 rounded-full border px-4 py-2.5 text-[13px] shadow-[0_12px_40px_rgb(0_0_0/.4)] ${
              t.tone === "error" ? "border-danger-line text-danger" : "border-white/10 text-fg"
            }`}
          >
            {t.tone === "success" && <span className="text-ok">✓</span>}
            {t.message}
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

/** const toast = useToast(); toast.success("저장했어요") */
export function useToast() {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error("useToast는 ToastProvider 안에서만 사용할 수 있습니다.");
  return ctx;
}
