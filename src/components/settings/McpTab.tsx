"use client";

// MCP 연결 탭 (MCP-01~03·06). 토큰 발급·폐기, 연결 가이드, 쓰기 작업 사용 기록.
import { useState } from "react";
import { CardHead, ErrorState, LoadingState, Modal, Segmented, Switch, useToast } from "@/components/ui";
import { MCP_API_URL, MCP_SERVICES, type McpScope, type McpToken } from "@/lib/data/mcp-tokens";
import { zonedParts } from "@/lib/date";
import { timeAgo } from "@/lib/format";
import { useCreateMcpToken, useMcpAuditLogs, useMcpTokens, useRevokeMcpToken } from "@/lib/hooks/use-mcp-tokens";
import { useTimezone } from "@/lib/hooks/use-profile";

const TOKEN_PLACEHOLDER = "<발급한 토큰>";
const SERVER_PATH = "<저장소 경로>/mcp/dist/index.js";

const GUIDES = {
  desktop: {
    label: "Claude Desktop",
    hint: "claude_desktop_config.json의 mcpServers에 붙여넣고 Claude Desktop을 다시 시작하세요.",
    text: JSON.stringify(
      {
        mcpServers: {
          "life-manager": {
            command: "node",
            args: [SERVER_PATH],
            env: { LIFE_API_URL: MCP_API_URL, LIFE_TOKEN: TOKEN_PLACEHOLDER },
          },
        },
      },
      null,
      2,
    ),
  },
  code: {
    label: "Claude Code",
    hint: "터미널에서 실행하세요. 등록 뒤 /mcp 로 연결 상태를 볼 수 있어요.",
    text: `claude mcp add life-manager -e LIFE_API_URL=${MCP_API_URL} -e LIFE_TOKEN=${TOKEN_PLACEHOLDER} -- node ${SERVER_PATH}`,
  },
} as const;
type GuideKey = keyof typeof GUIDES;

const SCOPE_LABEL: Record<McpScope, string> = {
  "events:read": "일정 읽기",
  "events:write": "일정 쓰기",
  "todos:read": "할일 읽기",
  "todos:write": "할일 쓰기",
  "tx:read": "가계부 읽기",
  "tx:write": "가계부 쓰기",
  "weather:read": "날씨",
};

async function copyText(text: string) {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}

/** 사용자 타임존 기준 "10/19 14:03" */
const shortDateTime = (iso: string, tz: string) => {
  const z = zonedParts(iso, tz);
  const [, m, d] = z.date.split("-").map(Number);
  return `${m}/${d} ${z.time}`;
};

export function McpTab() {
  const [issuing, setIssuing] = useState(false);
  return (
    <>
      <TokensCard onIssue={() => setIssuing(true)} />
      <GuideCard />
      <LogsCard />
      <IssueModal open={issuing} onClose={() => setIssuing(false)} />
    </>
  );
}

function TokensCard({ onIssue }: { onIssue: () => void }) {
  const tokens = useMcpTokens();
  const [revoking, setRevoking] = useState<McpToken | null>(null);

  return (
    <section className="card card-warm gap-3 p-5">
      <CardHead
        title="액세스 토큰"
        meta={
          <button type="button" onClick={onIssue} className="pill pill-accent px-3 py-[7px]">
            새 토큰 발급
          </button>
        }
      />
      <span className="text-xs text-muted">Claude가 이 토큰으로 내 일정·할일·가계부에 접근해요. 기기나 용도마다 따로 발급하고, 쓰지 않으면 폐기하세요.</span>
      {tokens.isPending && <LoadingState />}
      {tokens.isError && <ErrorState retry={() => tokens.refetch()} />}
      {tokens.data?.length === 0 && <span className="py-2 text-[13px] text-subtle">아직 발급한 토큰이 없어요.</span>}
      {tokens.data?.map((t) => (
        <TokenRow key={t.id} token={t} onRevoke={() => setRevoking(t)} />
      ))}
      {revoking && <RevokeModal token={revoking} onClose={() => setRevoking(null)} />}
    </section>
  );
}

function TokenRow({ token, onRevoke }: { token: McpToken; onRevoke: () => void }) {
  const tz = useTimezone();
  const revoked = token.revokedAt != null;
  return (
    <div className={`flex flex-wrap items-center gap-3 border-t border-line pt-3 ${revoked ? "opacity-50" : ""}`}>
      <div className="flex min-w-0 flex-1 flex-col gap-1">
        <span className="flex flex-wrap items-center gap-2 text-sm">
          <span className="font-semibold">{token.name}</span>
          <span className="font-mono text-xs text-soft">{token.prefix}</span>
          <span className={`text-xs ${revoked ? "text-danger" : "text-ok"}`}>{revoked ? "● 폐기됨" : "● 활성"}</span>
        </span>
        <span className="flex flex-wrap gap-1">
          {token.scopes.map((s) => (
            <span key={s} className="rounded-full bg-white/[.06] px-2 py-0.5 text-[11px] text-muted">
              {SCOPE_LABEL[s]}
            </span>
          ))}
        </span>
        <span className="text-xs text-subtle">
          {shortDateTime(token.createdAt, tz)} 발급 · 마지막 사용 {timeAgo(token.lastUsedAt)}
          {revoked && ` · ${shortDateTime(token.revokedAt!, tz)} 폐기`}
        </span>
      </div>
      {!revoked && (
        <button type="button" onClick={onRevoke} className="pill pill-danger px-3 py-[7px]">
          폐기
        </button>
      )}
    </div>
  );
}

function RevokeModal({ token, onClose }: { token: McpToken; onClose: () => void }) {
  const revoke = useRevokeMcpToken();
  const toast = useToast();
  return (
    <Modal
      open
      onClose={onClose}
      title="토큰 폐기"
      subtitle={`${token.name} · ${token.prefix}`}
      width={440}
      footer={
        <>
          <button type="button" onClick={onClose} className="pill px-4 py-2">
            취소
          </button>
          <button
            type="button"
            disabled={revoke.isPending}
            onClick={() =>
              revoke.mutate(token.id, {
                onSuccess: () => {
                  toast.success("토큰을 폐기했어요.");
                  onClose();
                },
                onError: () => toast.error("토큰을 폐기하지 못했어요."),
              })
            }
            className="pill pill-danger px-4 py-2 disabled:opacity-50"
          >
            폐기
          </button>
        </>
      }
    >
      <p className="text-[13px] text-muted">폐기하면 이 토큰을 쓰는 Claude 연결이 바로 끊기고 되돌릴 수 없어요.</p>
    </Modal>
  );
}

const ALL_SERVICES = MCP_SERVICES.map((s) => s.key);

function IssueModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const create = useCreateMcpToken();
  const toast = useToast();
  const [name, setName] = useState("Claude Desktop");
  const [services, setServices] = useState<string[]>(ALL_SERVICES);
  const [write, setWrite] = useState(true);
  const [issued, setIssued] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const scopes: McpScope[] = MCP_SERVICES.filter((s) => services.includes(s.key)).flatMap((s) =>
    write && s.write ? [s.read, s.write] : [s.read],
  );

  const close = () => {
    onClose();
    // 원문은 닫으면 다시 볼 수 없다.
    setIssued(null);
    setCopied(false);
    setName("Claude Desktop");
    setServices(ALL_SERVICES);
    setWrite(true);
  };

  const submit = () =>
    create.mutate(
      { name: name.trim(), scopes },
      { onSuccess: (r) => setIssued(r.token), onError: (e) => toast.error(e.message) },
    );

  if (issued) {
    return (
      <Modal
        open={open}
        onClose={close}
        title="토큰을 발급했어요"
        subtitle="지금 복사해 두세요. 이 창을 닫으면 다시 볼 수 없습니다."
        width={520}
        footer={
          <button type="button" onClick={close} className="pill pill-accent ml-auto px-4 py-2">
            복사했어요, 닫기
          </button>
        }
      >
        <div className="flex items-center gap-2">
          <code className="min-w-0 flex-1 rounded-[10px] bg-black/30 p-3 font-mono text-[12px] break-all">{issued}</code>
          <button
            type="button"
            onClick={async () => setCopied(await copyText(issued))}
            className="pill shrink-0 px-3 py-[7px]"
          >
            {copied ? "복사됨" : "복사"}
          </button>
        </div>
        <span className="text-xs text-muted">아래 연결 가이드의 {TOKEN_PLACEHOLDER} 자리에 넣으세요.</span>
      </Modal>
    );
  }

  return (
    <Modal
      open={open}
      onClose={close}
      title="새 토큰 발급"
      subtitle="Claude가 쓸 수 있는 범위를 정해요."
      width={480}
      footer={
        <>
          <button type="button" onClick={close} className="pill px-4 py-2">
            취소
          </button>
          <button
            type="button"
            onClick={submit}
            disabled={!name.trim() || !scopes.length || create.isPending}
            className="pill pill-accent ml-auto px-4 py-2 disabled:opacity-50"
          >
            {create.isPending ? "발급 중…" : "발급"}
          </button>
        </>
      }
    >
      <label className="flex flex-col gap-1.5 text-[13px]">
        이름
        <input className="field" value={name} maxLength={50} onChange={(e) => setName(e.target.value)} placeholder="예: 집 노트북 Claude Desktop" autoFocus />
      </label>
      <div className="flex flex-col">
        {MCP_SERVICES.map((s) => (
          <div key={s.key} className="flex items-center gap-4 border-b border-line py-3">
            <span className="flex-1 text-sm">{s.label} 접근 허용</span>
            <Switch
              label={`${s.label} 접근 허용`}
              checked={services.includes(s.key)}
              onChange={() => setServices((v) => (v.includes(s.key) ? v.filter((k) => k !== s.key) : [...v, s.key]))}
            />
          </div>
        ))}
        <div className="flex items-center gap-4 py-3">
          <div className="flex flex-1 flex-col gap-[3px]">
            <span className="text-sm">쓰기 권한</span>
            <span className="text-xs text-subtle">끄면 조회만 가능해요(등록·수정·삭제 불가).</span>
          </div>
          <Switch label="쓰기 권한" checked={write} onChange={() => setWrite((v) => !v)} />
        </div>
      </div>
      {!scopes.length && <span className="text-xs text-danger">접근을 하나 이상 허용해 주세요.</span>}
    </Modal>
  );
}

function GuideCard() {
  const [tab, setTab] = useState<GuideKey>("desktop");
  const [copied, setCopied] = useState(false);
  const guide = GUIDES[tab];
  return (
    <section className="card card-flat gap-3 p-5">
      <CardHead
        title="연결 가이드"
        meta={
          <button
            type="button"
            onClick={async () => {
              if (await copyText(guide.text)) {
                setCopied(true);
                setTimeout(() => setCopied(false), 1500);
              }
            }}
            className="text-xs text-accent"
          >
            {copied ? "복사됨" : "복사"}
          </button>
        }
      />
      <Segmented
        options={(Object.keys(GUIDES) as GuideKey[]).map((k) => ({ value: k, label: GUIDES[k].label }))}
        value={tab}
        onChange={setTab}
      />
      <span className="text-xs text-muted">{guide.hint}</span>
      <pre className="m-0 overflow-x-auto rounded-[10px] bg-black/30 p-3 font-mono text-[11px] leading-relaxed text-soft">{guide.text}</pre>
      <span className="text-xs text-subtle">
        MCP 서버는 저장소의 mcp 폴더에서 <code className="font-mono">npm install</code>, <code className="font-mono">npm run build</code>로 먼저 빌드해요.{" "}
        {TOKEN_PLACEHOLDER}에는 발급한 토큰을, &lt;저장소 경로&gt;에는 실제 폴더 경로를 넣으세요.
      </span>
    </section>
  );
}

function LogsCard() {
  const logs = useMcpAuditLogs(7);
  const tz = useTimezone();
  return (
    <section className="card card-flat gap-2 p-5">
      <CardHead title="사용 기록" meta="최근 7일 · 쓰기 작업" />
      {logs.isPending && <LoadingState />}
      {logs.isError && <ErrorState retry={() => logs.refetch()} />}
      {logs.data?.length === 0 && <span className="py-2 text-[13px] text-subtle">최근 7일 동안 Claude가 바꾼 내용이 없어요.</span>}
      {logs.data?.map((l) => (
        <div
          key={l.id}
          className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-3.5 gap-y-1 border-b border-white/[.06] py-2 text-[13px] sm:grid-cols-[170px_minmax(0,1fr)_110px]"
        >
          <span className={`font-mono text-xs ${l.status === "error" ? "text-danger" : "text-accent"}`}>{l.tool}</span>
          <span className="order-3 col-span-2 sm:order-none sm:col-span-1">
            {l.status === "error" && <span className="mr-1 text-danger">실패</span>}
            {l.summary}
            {l.tokenName && <span className="ml-1.5 text-[11px] text-subtle">· {l.tokenName}</span>}
          </span>
          <span className="text-right text-[11px] text-subtle">{shortDateTime(l.at, tz)}</span>
        </div>
      ))}
    </section>
  );
}
