"use client";

// 구글 캘린더 연동 탭 (GCAL-01~04, 10). 연결은 /api/google/start, 동기화는 Edge Function gcal-sync.
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { CardHead, ErrorState, LoadingState, Modal, Segmented, Switch, useToast } from "@/components/ui";
import { timeAgo } from "@/lib/format";
import {
  useDisconnectGoogle,
  useGoogleCalendars,
  useGoogleStatus,
  useSyncGoogle,
  useUpdateGoogleCalendar,
} from "@/lib/hooks/use-google";
import type { GoogleAccount, GoogleCalendar, GoogleSyncDirection } from "@/lib/types";

const SYNC_MODES = [
  { value: "import", label: "가져오기만" },
  { value: "export", label: "내보내기만" },
  { value: "both", label: "양방향" },
] as const satisfies readonly { value: GoogleSyncDirection; label: string }[];

/** /api/google/callback 이 돌려준 결과(?google=) */
const CALLBACK_MESSAGES: Record<string, { tone: "success" | "error"; text: string }> = {
  connected: { tone: "success", text: "구글 계정을 연결했어요. 일정을 가져오는 중이에요." },
  denied: { tone: "error", text: "구글 연결을 취소했어요." },
  scope: { tone: "error", text: "캘린더 권한을 모두 허용해야 연결할 수 있어요. 다시 연결해 주세요." },
  refresh: { tone: "error", text: "구글이 장기 접근 권한을 주지 않았어요. 다시 연결해 주세요." },
  state: { tone: "error", text: "연결 요청이 만료됐어요. 다시 시도해 주세요." },
  config: { tone: "error", text: "서버에 구글 OAuth 설정(GOOGLE_CLIENT_ID)이 없어요." },
  failed: { tone: "error", text: "구글 연결에 실패했어요. 잠시 뒤 다시 시도해 주세요." },
};

export function GoogleTab() {
  const status = useGoogleStatus();
  const calendars = useGoogleCalendars();
  const sync = useSyncGoogle();
  const toast = useToast();
  const router = useRouter();
  const params = useSearchParams();
  const handled = useRef(false);

  // 연결 직후: 결과를 알리고 첫 동기화를 시작한다.
  const result = params.get("google");
  useEffect(() => {
    if (!result || handled.current) return;
    handled.current = true;
    const msg = CALLBACK_MESSAGES[result];
    if (msg) toast[msg.tone](msg.text);
    router.replace("/settings?tab=google", { scroll: false });
    if (result === "connected")
      sync.mutate("sync", {
        onSuccess: (r) => (r.ok ? toast.success("구글 일정을 가져왔어요.") : toast.error("일부 일정을 동기화하지 못했어요.")),
        onError: () => toast.error("동기화에 실패했어요. 잠시 뒤 다시 시도해 주세요."),
      });
  }, [result, router, sync, toast]);

  if (status.isPending) return <LoadingState />;
  if (status.isError || !status.data) return <ErrorState retry={() => status.refetch()} />;

  if (!status.data.connected) return <ConnectCard />;

  const runSync = () =>
    sync.mutate("sync", {
      onSuccess: (r) => {
        const total = (r.results ?? []).reduce((n, a) => n + (a.imported ?? 0) + (a.exported ?? 0) + (a.deleted ?? 0), 0);
        if (r.ok) toast.success(total ? `동기화했어요 (${total}건 반영).` : "이미 최신 상태예요.");
        else toast.error(r.results?.some((a) => a.reauth) ? "구글 계정을 다시 연결해 주세요." : "일부 일정을 동기화하지 못했어요.");
      },
      onError: () => toast.error("동기화에 실패했어요. 잠시 뒤 다시 시도해 주세요."),
    });

  return (
    <>
      {status.data.accounts.map((a) => (
        <AccountCard key={a.id} account={a} syncing={sync.isPending} onSync={runSync} />
      ))}

      <section className="card card-flat py-1.5">
        <div className="px-0 pt-2 pb-1">
          <CardHead title="동기화할 캘린더" meta="켜 둔 캘린더의 일정만 가져와요" />
        </div>
        {calendars.isPending && <span className="py-3 text-xs text-subtle">캘린더 목록을 불러오는 중…</span>}
        {calendars.data?.length === 0 && <span className="py-3 text-xs text-subtle">캘린더가 없어요. 지금 동기화를 눌러 목록을 받아 주세요.</span>}
        {calendars.data?.map((c) => <CalendarRow key={c.id} cal={c} />)}
      </section>

      <section className="card card-flat gap-2 p-5 text-xs text-subtle">
        <span>· 15분마다 자동으로 동기화하고, 여기서 구글 일정을 고치면 바로 구글에도 반영해요.</span>
        <span>· 양쪽에서 같은 일정을 고치면 더 늦게 고친 쪽을 남기고, 덮어쓴 내용은 기록으로 보관해요.</span>
        <span>· 구글 OAuth 앱이 &quot;테스트&quot; 상태면 7일마다 다시 연결해야 해요.</span>
      </section>
    </>
  );
}

function ConnectCard() {
  return (
    <section className="card card-warm flex-row flex-wrap items-center gap-4 p-5">
      <div className="flex size-11 items-center justify-center rounded-full bg-fg font-extrabold text-ink">G</div>
      <div className="flex flex-1 flex-col gap-[3px]">
        <span className="text-[15px] font-semibold">구글 캘린더가 연결되어 있지 않아요</span>
        <span className="text-xs text-muted">연결하면 구글 일정을 가져오고, 여기서 만든 구글 일정을 구글에도 저장해요.</span>
      </div>
      {/* OAuth는 전체 페이지 이동이 필요해 Link 대신 a로 라우트 핸들러에 보낸다. */}
      <a href="/api/google/start" className="pill pill-accent px-4 py-2">
        구글 계정 연결
      </a>
    </section>
  );
}

function AccountCard({ account, syncing, onSync }: { account: GoogleAccount; syncing: boolean; onSync: () => void }) {
  const [confirm, setConfirm] = useState(false);
  const reauth = account.status === "reauth_required";

  return (
    <section className="card card-warm flex-row flex-wrap items-center gap-4 p-5">
      <div className="flex size-11 items-center justify-center rounded-full bg-fg font-extrabold text-ink">G</div>
      <div className="flex min-w-0 flex-1 flex-col gap-[3px]">
        <span className="truncate text-[15px] font-semibold">{account.email}</span>
        <span className={`text-xs ${reauth ? "text-danger" : "text-muted"}`}>
          {reauth ? "다시 연결이 필요해요 (권한이 만료되었거나 철회됨)" : `마지막 동기화 ${timeAgo(account.lastSyncedAt)}`}
        </span>
        {!reauth && account.lastError && <span className="text-xs text-danger">최근 오류: {account.lastError}</span>}
      </div>
      {reauth ? (
        <a href="/api/google/start" className="pill pill-accent px-4 py-2">
          다시 연결
        </a>
      ) : (
        <button type="button" onClick={onSync} disabled={syncing} className="pill pill-accent px-4 py-2 disabled:opacity-50">
          {syncing ? "동기화 중…" : "지금 동기화"}
        </button>
      )}
      <button type="button" onClick={() => setConfirm(true)} className="pill px-4 py-2">
        연결 해제
      </button>
      <DisconnectModal open={confirm} onClose={() => setConfirm(false)} account={account} />
    </section>
  );
}

function DisconnectModal({ open, onClose, account }: { open: boolean; onClose: () => void; account: GoogleAccount }) {
  const disconnect = useDisconnectGoogle();
  const toast = useToast();
  const run = (keepEvents: boolean) =>
    disconnect.mutate(
      { accountId: account.id, keepEvents },
      {
        onSuccess: () => {
          toast.success("구글 연결을 해제했어요.");
          onClose();
        },
        onError: (e) => toast.error(e.message),
      },
    );

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="구글 연결 해제"
      subtitle={account.email}
      width={460}
      footer={
        <>
          <button type="button" onClick={onClose} className="pill px-4 py-2">
            취소
          </button>
          <button type="button" disabled={disconnect.isPending} onClick={() => run(false)} className="pill px-4 py-2">
            일정도 지우기
          </button>
          <button type="button" disabled={disconnect.isPending} onClick={() => run(true)} className="pill pill-accent px-4 py-2">
            일정은 남기기
          </button>
        </>
      }
    >
      <p className="text-[13px] text-muted">
        구글에서 가져온 일정을 어떻게 할까요? 남기면 &quot;내 캘린더&quot; 일정으로 바뀌고 더는 구글과 동기화하지 않아요. 구글 캘린더 쪽 일정은 그대로예요.
      </p>
    </Modal>
  );
}

function CalendarRow({ cal }: { cal: GoogleCalendar }) {
  const update = useUpdateGoogleCalendar();
  const sync = useSyncGoogle();
  const toast = useToast();
  const patch = (p: { enabled?: boolean; direction?: GoogleSyncDirection }, done: string) =>
    update.mutate(
      { id: cal.id, ...p },
      {
        onSuccess: () => {
          toast.success(done);
          // 켜거나 방향을 바꾸면 바로 받아 온다.
          if (p.enabled !== false) sync.mutate("sync");
        },
        onError: () => toast.error("설정을 저장하지 못했어요."),
      },
    );

  return (
    <div className="flex flex-wrap items-center gap-3 border-b border-line py-3.5 last:border-b-0">
      <span className="size-3 shrink-0 rounded-full" style={{ background: cal.color ?? "rgb(255 255 255 / 0.3)" }} />
      <div className="flex min-w-0 flex-1 flex-col gap-[3px]">
        <span className="truncate text-sm">
          {cal.name}
          {cal.isPrimary && <span className="ml-1.5 text-[11px] text-accent">기본</span>}
        </span>
        <span className="text-xs text-subtle">
          {cal.writable ? "읽기·쓰기" : "읽기 전용"}
          {cal.enabled && ` · 마지막 동기화 ${timeAgo(cal.lastSyncedAt)}`}
        </span>
      </div>
      {cal.enabled && (
        <Segmented
          options={SYNC_MODES}
          value={cal.direction}
          disabled={cal.writable ? [] : ["export", "both"]}
          onChange={(direction) => patch({ direction }, "동기화 방식을 바꿨어요.")}
        />
      )}
      <Switch
        label={`${cal.name} 동기화`}
        checked={cal.enabled}
        onChange={() =>
          patch({ enabled: !cal.enabled }, cal.enabled ? "동기화를 껐어요. 가져온 일정을 정리했어요." : "동기화를 켰어요. 일정을 가져오는 중이에요.")
        }
      />
    </div>
  );
}
