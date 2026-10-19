"use client";

// MCP 연결 탭 (MCP-01~03·06·07). 연결된 앱(OAuth), 액세스 토큰 발급·폐기, 연결 가이드, 쓰기 작업 사용 기록.
import { useState, type ReactNode } from "react";
import { CardHead, ErrorState, LoadingState, Modal, Segmented, Switch, useToast } from "@/components/ui";
import { MCP_API_URL, MCP_REMOTE_URL, MCP_SERVICES, scopesFor, type McpGrant, type McpScope, type McpToken } from "@/lib/data/mcp-tokens";
import { zonedParts } from "@/lib/date";
import { timeAgo } from "@/lib/format";
import {
  useCreateMcpToken,
  useMcpAuditLogs,
  useMcpGrants,
  useMcpTokens,
  useRevokeMcpGrant,
  useRevokeMcpToken,
} from "@/lib/hooks/use-mcp-tokens";
import { useTimezone } from "@/lib/hooks/use-profile";

const TOKEN_PLACEHOLDER = "<발급한 토큰>";
const SERVER_PATH = "<저장소 경로>/mcp/dist/index.js";

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
      <GuideCard />
      <GrantsCard />
      <TokensCard onIssue={() => setIssuing(true)} />
      <LogsCard />
      <IssueModal open={issuing} onClose={() => setIssuing(false)} />
    </>
  );
}

// ── 권한 고르기(토큰 발급 모달과 동의 화면 공용) ───────────

const ALL_SERVICES = MCP_SERVICES.map((s) => s.key);

/** 서비스별 접근 + 쓰기 권한 스위치. 결과 범위는 scopesFor(services, write) */
export function useScopePicker() {
  const [services, setServices] = useState<string[]>(ALL_SERVICES);
  const [write, setWrite] = useState(true);
  return {
    services,
    write,
    scopes: scopesFor(services, write),
    toggle: (key: string) => setServices((v) => (v.includes(key) ? v.filter((k) => k !== key) : [...v, key])),
    toggleWrite: () => setWrite((v) => !v),
    reset: () => {
      setServices(ALL_SERVICES);
      setWrite(true);
    },
  };
}

export function ScopePicker({ picker }: { picker: ReturnType<typeof useScopePicker> }) {
  return (
    <div className="flex flex-col">
      {MCP_SERVICES.map((s) => (
        <div key={s.key} className="flex items-center gap-4 border-b border-line py-3">
          <span className="flex-1 text-sm">{s.label} 접근 허용</span>
          <Switch label={`${s.label} 접근 허용`} checked={picker.services.includes(s.key)} onChange={() => picker.toggle(s.key)} />
        </div>
      ))}
      <div className="flex items-center gap-4 py-3">
        <div className="flex flex-1 flex-col gap-[3px]">
          <span className="text-sm">쓰기 권한</span>
          <span className="text-xs text-subtle">끄면 조회만 가능해요(등록·수정·삭제 불가).</span>
        </div>
        <Switch label="쓰기 권한" checked={picker.write} onChange={picker.toggleWrite} />
      </div>
      {!picker.scopes.length && <span className="text-xs text-danger">접근을 하나 이상 허용해 주세요.</span>}
    </div>
  );
}

function ScopeChips({ scopes }: { scopes: McpScope[] }) {
  return (
    <span className="flex flex-wrap gap-1">
      {scopes.map((s) => (
        <span key={s} className="rounded-full bg-white/[.06] px-2 py-0.5 text-[11px] text-muted">
          {SCOPE_LABEL[s]}
        </span>
      ))}
    </span>
  );
}

// ── 연결 가이드 ──────────────────────────────────────────

type GuideKey = "claudeai" | "chatgpt" | "code" | "desktop";

const GUIDE_TABS: { value: GuideKey; label: string }[] = [
  { value: "claudeai", label: "claude.ai" },
  { value: "chatgpt", label: "ChatGPT" },
  { value: "code", label: "Claude Code" },
  { value: "desktop", label: "Claude Desktop" },
];

const CLAUDE_CODE_OAUTH = `claude mcp add --transport http life-manager ${MCP_REMOTE_URL}`;
const CLAUDE_CODE_TOKEN = `claude mcp add --transport http life-manager ${MCP_REMOTE_URL} --header "Authorization: Bearer ${TOKEN_PLACEHOLDER}"`;
const DESKTOP_JSON = JSON.stringify(
  { mcpServers: { "life-manager": { command: "node", args: [SERVER_PATH], env: { LIFE_API_URL: MCP_API_URL, LIFE_TOKEN: TOKEN_PLACEHOLDER } } } },
  null,
  2,
);

function CopyBlock({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <div className="relative">
      <pre className="m-0 overflow-x-auto rounded-[10px] bg-black/30 p-3 pr-16 font-mono text-[11px] leading-relaxed whitespace-pre-wrap break-all text-soft">
        {text}
      </pre>
      <button
        type="button"
        onClick={async () => {
          if (await copyText(text)) {
            setCopied(true);
            setTimeout(() => setCopied(false), 1500);
          }
        }}
        className="absolute top-2 right-2 rounded-md bg-white/[.08] px-2 py-1 text-[11px] text-accent"
      >
        {copied ? "복사됨" : "복사"}
      </button>
    </div>
  );
}

function Steps({ items }: { items: ReactNode[] }) {
  return (
    <ol className="m-0 flex list-decimal flex-col gap-1.5 pl-5 text-[13px] leading-relaxed text-soft">
      {items.map((it, i) => (
        <li key={i}>{it}</li>
      ))}
    </ol>
  );
}

function Notes({ items }: { items: ReactNode[] }) {
  return (
    <div className="flex flex-col gap-1 rounded-[10px] bg-white/[.04] p-3 text-xs leading-relaxed text-muted">
      {items.map((it, i) => (
        <span key={i}>· {it}</span>
      ))}
    </div>
  );
}

/** 원격 연결(OAuth) 공통 주의사항 */
const OAUTH_NOTES: ReactNode[] = [
  <>
    <b className="text-fg">처음 연결할 때는 이 PC에서 앱(localhost:3000)이 켜져 있어야 해요.</b> 로그인·권한 선택 화면이 이 PC의 앱에서 열리기 때문에,
    다른 기기(휴대폰 등)에서는 연결을 시작할 수 없어요. 연결이 끝나면 앱을 꺼도 계속 쓸 수 있어요.
  </>,
  "권한(일정·할일·가계부·날씨 × 읽기/쓰기)은 연결할 때 나오는 화면에서 골라요. 바꾸려면 아래 '연결된 앱'에서 해제한 뒤 다시 연결하세요.",
  "연결을 끊으려면 아래 '연결된 앱'에서 연결 해제를 누르세요. 바로 접근이 막혀요.",
];

function GuideCard() {
  const [tab, setTab] = useState<GuideKey>("claudeai");
  return (
    <section className="card card-flat gap-3 p-5">
      <CardHead title="연결 가이드" meta="Claude·ChatGPT에서 라이프 매니저 쓰기" />
      <Segmented options={GUIDE_TABS} value={tab} onChange={setTab} />
      <span className="text-xs text-muted">원격 MCP 서버 주소</span>
      <CopyBlock text={MCP_REMOTE_URL} />

      {tab === "claudeai" && (
        <>
          <Steps
            items={[
              "claude.ai에서 Customize(맞춤 설정) → Connectors → Add custom connector를 눌러요.",
              "이름은 '라이프 매니저', URL에는 위 원격 MCP 서버 주소를 넣어요. OAuth Client ID·Secret은 비워 둬요(자동 등록).",
              "추가한 커넥터에서 Connect를 누르면 이 PC의 앱 로그인·권한 선택 화면이 열려요. 권한을 고르고 '연결 허용'을 눌러요.",
              "대화창의 + → Connectors에서 라이프 매니저를 켜고 \"오늘 일정 알려줘\"처럼 물어보세요.",
            ]}
          />
          <Notes
            items={[
              ...OAUTH_NOTES,
              "claude.ai에서 추가한 커넥터는 같은 계정의 Claude Desktop·모바일 앱에서도 함께 쓸 수 있어요. Free 요금제는 커스텀 커넥터를 1개만 추가할 수 있어요.",
              "Team·Enterprise는 조직 Owner가 Organization settings → Connectors에서 추가한 뒤, 각자 Connect로 연결해요.",
            ]}
          />
        </>
      )}

      {tab === "chatgpt" && (
        <>
          <Steps
            items={[
              "chatgpt.com(웹)에서 Settings → Apps & Connectors(앱) → Advanced settings에서 Developer mode를 켜요.",
              "Create(앱 만들기)를 눌러 이름 '라이프 매니저', MCP 서버 URL에 위 주소를 넣고 인증은 OAuth를 골라요. Client ID·Secret은 비워 둬요.",
              "만들면 이 PC의 앱 로그인·권한 선택 화면이 열려요. 권한을 고르고 '연결 허용'을 눌러요.",
              "새 대화에서 + → 개발자 모드(또는 앱 목록)로 라이프 매니저를 켜고 물어보세요. 쓰기 작업은 실행 전에 확인창이 떠요.",
            ]}
          />
          <Notes
            items={[
              ...OAUTH_NOTES,
              <>
                <b className="text-fg">요금제 제약:</b> 쓰기(등록·수정·삭제)까지 되는 MCP 연결은 Business·Enterprise·Edu에서 제공돼요(beta). Plus·Pro 같은 개인
                요금제에서는 읽기 전용일 수 있고, 메뉴 이름·위치가 다를 수 있어요.
              </>,
              "ChatGPT의 MCP 연결은 웹에서만 돼요(모바일 앱 불가).",
            ]}
          />
        </>
      )}

      {tab === "code" && (
        <>
          <span className="text-[13px] text-soft">방법 1 — 계정 로그인(권장): 등록한 뒤 Claude Code에서 /mcp를 열고 life-manager를 골라 인증하면 브라우저에 로그인·권한 화면이 떠요.</span>
          <CopyBlock text={CLAUDE_CODE_OAUTH} />
          <span className="text-[13px] text-soft">방법 2 — 액세스 토큰: 아래 “액세스 토큰”에서 발급한 토큰을 헤더로 넣어요. 토큰의 권한이 그대로 적용돼요.</span>
          <CopyBlock text={CLAUDE_CODE_TOKEN} />
          <Notes
            items={[
              "방법 1은 처음 인증할 때 이 PC에서 앱(localhost:3000)이 켜져 있어야 해요.",
              `방법 2의 ${TOKEN_PLACEHOLDER} 자리에 토큰 원문(lm_mcp_…)을 넣으세요. 토큰은 발급할 때 한 번만 보여요.`,
              "등록 범위를 바꾸려면 --scope user(모든 프로젝트) 또는 --scope project(.mcp.json 공유)를 붙여요.",
            ]}
          />
        </>
      )}

      {tab === "desktop" && (
        <>
          <span className="text-[13px] text-soft">방법 1 — 커스텀 커넥터(권장): claude.ai 탭의 방법으로 추가하면 Claude Desktop에도 그대로 나타나요.</span>
          <span className="text-[13px] text-soft">
            방법 2 — 로컬 서버: 저장소의 mcp 폴더에서 <code className="font-mono">npm install</code>, <code className="font-mono">npm run build</code> 후
            claude_desktop_config.json의 mcpServers에 붙여넣고 Claude Desktop을 다시 시작해요.
          </span>
          <CopyBlock text={DESKTOP_JSON} />
          <Notes
            items={[
              `방법 2는 ${TOKEN_PLACEHOLDER}에 발급한 토큰을, <저장소 경로>에 실제 폴더 경로를 넣으세요. 토큰은 발급할 때 한 번만 보여요.`,
              "방법 2는 이 PC에서만 동작하고, 토큰을 폐기하면 바로 끊겨요.",
            ]}
          />
        </>
      )}
    </section>
  );
}

// ── 연결된 앱(OAuth) ─────────────────────────────────────

function GrantsCard() {
  const grants = useMcpGrants();
  const [revoking, setRevoking] = useState<McpGrant | null>(null);
  return (
    <section className="card card-warm gap-3 p-5">
      <CardHead title="연결된 앱" meta="claude.ai · ChatGPT · Claude Code(계정 로그인)" />
      {grants.isPending && <LoadingState />}
      {grants.isError && <ErrorState retry={() => grants.refetch()} />}
      {grants.data?.length === 0 && <span className="py-2 text-[13px] text-subtle">아직 계정 로그인으로 연결한 앱이 없어요. 위 연결 가이드를 따라 연결해 보세요.</span>}
      {grants.data?.map((g) => (
        <GrantRow key={g.id} grant={g} onRevoke={() => setRevoking(g)} />
      ))}
      {revoking && <RevokeGrantModal grant={revoking} onClose={() => setRevoking(null)} />}
    </section>
  );
}

function GrantRow({ grant, onRevoke }: { grant: McpGrant; onRevoke: () => void }) {
  const tz = useTimezone();
  const revoked = grant.revokedAt != null;
  return (
    <div className={`flex flex-wrap items-center gap-3 border-t border-line pt-3 ${revoked ? "opacity-50" : ""}`}>
      <div className="flex min-w-0 flex-1 flex-col gap-1">
        <span className="flex flex-wrap items-center gap-2 text-sm">
          <span className="font-semibold">{grant.clientName || "이름 없는 앱"}</span>
          {grant.redirectHost && <span className="text-xs text-soft">{grant.redirectHost}</span>}
          <span className={`text-xs ${revoked ? "text-danger" : "text-ok"}`}>{revoked ? "● 해제됨" : "● 연결됨"}</span>
        </span>
        <ScopeChips scopes={grant.scopes} />
        <span className="text-xs text-subtle">
          {shortDateTime(grant.createdAt, tz)} 연결 · 마지막 사용 {timeAgo(grant.lastUsedAt)}
          {revoked && ` · ${shortDateTime(grant.revokedAt!, tz)} 해제`}
        </span>
      </div>
      {!revoked && (
        <button type="button" onClick={onRevoke} className="pill pill-danger px-3 py-[7px]">
          연결 해제
        </button>
      )}
    </div>
  );
}

function RevokeGrantModal({ grant, onClose }: { grant: McpGrant; onClose: () => void }) {
  const revoke = useRevokeMcpGrant();
  const toast = useToast();
  return (
    <Modal
      open
      onClose={onClose}
      title="연결 해제"
      subtitle={grant.clientName || grant.redirectHost}
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
              revoke.mutate(grant.clientId, {
                onSuccess: () => {
                  toast.success("연결을 해제했어요.");
                  onClose();
                },
                onError: () => toast.error("연결을 해제하지 못했어요."),
              })
            }
            className="pill pill-danger ml-auto px-4 py-2 disabled:opacity-50"
          >
            연결 해제
          </button>
        </>
      }
    >
      <p className="text-[13px] text-muted">해제하면 이 앱에서 라이프 매니저에 바로 접근할 수 없어요. 다시 쓰려면 앱에서 다시 연결(로그인·권한 선택)하면 돼요.</p>
    </Modal>
  );
}

// ── 액세스 토큰(PAT) ─────────────────────────────────────

function TokensCard({ onIssue }: { onIssue: () => void }) {
  const tokens = useMcpTokens();
  const [revoking, setRevoking] = useState<McpToken | null>(null);

  return (
    <section className="card card-flat gap-3 p-5">
      <CardHead
        title="액세스 토큰"
        meta={
          <button type="button" onClick={onIssue} className="pill pill-accent px-3 py-[7px]">
            새 토큰 발급
          </button>
        }
      />
      <span className="text-xs text-muted">
        Claude Code(헤더)와 Claude Desktop 로컬 서버용이에요. 토큰 원문은 발급할 때 한 번만 보이니 바로 복사하고, 기기나 용도마다 따로 발급해 쓰지 않으면 폐기하세요.
      </span>
      {tokens.isPending && <LoadingState />}
      {tokens.isError && <ErrorState retry={() => tokens.refetch()} />}
      {tokens.data?.length === 0 && <span className="py-2 text-[13px] text-subtle">아직 발급한 토큰이 없어요.</span>}
      {tokens.data?.map((t) => (
        <TokenRow key={t.id} token={t} onRevoke={() => setRevoking(t)} />
      ))}
      {revoking && <RevokeTokenModal token={revoking} onClose={() => setRevoking(null)} />}
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
        <ScopeChips scopes={token.scopes} />
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

function RevokeTokenModal({ token, onClose }: { token: McpToken; onClose: () => void }) {
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
            className="pill pill-danger ml-auto px-4 py-2 disabled:opacity-50"
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

function IssueModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const create = useCreateMcpToken();
  const toast = useToast();
  const picker = useScopePicker();
  const [name, setName] = useState("Claude Code");
  const [issued, setIssued] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const close = () => {
    onClose();
    // 원문은 닫으면 다시 볼 수 없다.
    setIssued(null);
    setCopied(false);
    setName("Claude Code");
    picker.reset();
  };

  const submit = () =>
    create.mutate({ name: name.trim(), scopes: picker.scopes }, { onSuccess: (r) => setIssued(r.token), onError: (e) => toast.error(e.message) });

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
          <button type="button" onClick={async () => setCopied(await copyText(issued))} className="pill shrink-0 px-3 py-[7px]">
            {copied ? "복사됨" : "복사"}
          </button>
        </div>
        <span className="text-xs text-muted">연결 가이드의 {TOKEN_PLACEHOLDER} 자리에 넣으세요.</span>
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
            disabled={!name.trim() || !picker.scopes.length || create.isPending}
            className="pill pill-accent ml-auto px-4 py-2 disabled:opacity-50"
          >
            {create.isPending ? "발급 중…" : "발급"}
          </button>
        </>
      }
    >
      <label className="flex flex-col gap-1.5 text-[13px]">
        이름
        <input className="field" value={name} maxLength={50} onChange={(e) => setName(e.target.value)} placeholder="예: 집 노트북 Claude Code" autoFocus />
      </label>
      <ScopePicker picker={picker} />
    </Modal>
  );
}

// ── 사용 기록 ────────────────────────────────────────────

function LogsCard() {
  const logs = useMcpAuditLogs(7);
  const tz = useTimezone();
  return (
    <section className="card card-flat gap-2 p-5">
      <CardHead title="사용 기록" meta="최근 7일 · 쓰기 작업" />
      {logs.isPending && <LoadingState />}
      {logs.isError && <ErrorState retry={() => logs.refetch()} />}
      {logs.data?.length === 0 && <span className="py-2 text-[13px] text-subtle">최근 7일 동안 Claude·ChatGPT가 바꾼 내용이 없어요.</span>}
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
