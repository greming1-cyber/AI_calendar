import type { ReactNode } from "react";

/** 데이터를 불러오는 동안 화면 자리에 보여 준다. */
export function LoadingState({ label = "불러오는 중…" }: { label?: string }) {
  return (
    <main className="px-4 pb-7 md:px-7">
      <div role="status" className="card card-flat items-center justify-center py-16 text-[13px] text-subtle">
        {label}
      </div>
    </main>
  );
}

/** 조회 실패. retry를 넘기면 다시 시도 버튼을 보여 준다. */
export function ErrorState({ message, retry }: { message?: ReactNode; retry?: () => void }) {
  return (
    <main className="px-4 pb-7 md:px-7">
      <div role="alert" className="card card-flat items-center justify-center gap-3 py-16 text-center text-[13px] text-muted">
        {message ?? "데이터를 불러오지 못했어요."}
        {retry && (
          <button type="button" onClick={retry} className="pill px-4 py-2">
            다시 시도
          </button>
        )}
      </div>
    </main>
  );
}
