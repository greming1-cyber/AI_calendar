// 기상청 날씨(WTH-01~05, 09) — 호출·해석·weather_cache 캐시. weather 함수와 mcp-api가 함께 쓴다.
//
// - 초단기실황(getUltraSrtNcst): 매시 정시 관측, 40분 뒤부터 제공 → 현재 날씨
// - 단기예보(getVilageFcst): 02·05·08·11·14·17·20·23시 발표, 10분 뒤부터 제공 → 시간별·가까운 날 일별
// - 중기예보(getMidTa 기온, getMidLandFcst 육상): 06·18시 발표 → 단기예보 뒤 ~10일 일별
// - 캐시: 현재·단기 30분, 중기 6시간. 호출이 실패하면 만료된 캐시라도 쓰고 stale=true.
// - 시각은 모두 한국 시각(KST) 기준. 서버는 UTC이므로 +9시간 해서 계산한다.
// deno-lint-ignore-file no-explicit-any
import type { SupabaseClient } from "npm:@supabase/supabase-js@2";
import { MID_TA } from "./kma-regions.ts";

// ── 표준 응답 타입 (src/lib/types/weather.ts와 같다. 한쪽을 바꾸면 다른 쪽도 고친다) ──
export type Sky = "맑음" | "구름많음" | "흐림";
export type PrecipType = "없음" | "비" | "비/눈" | "눈" | "소나기";
export interface WeatherCurrent {
  temp: number;
  feelsLike: number;
  sky: Sky;
  precipType: PrecipType;
  humidity: number;
  wind: number;
  rain1h: number;
  observedAt: string;
}
export interface WeatherHour {
  time: string;
  date: string;
  hour: string;
  temp: number;
  sky: Sky;
  precipType: PrecipType;
  rainChance: number;
}
export interface WeatherDay {
  date: string;
  high: number | null;
  low: number | null;
  sky: Sky;
  precipType: PrecipType;
  rainChance: number;
  summary: string;
  source: "short" | "mid";
}
export interface WeatherReport {
  updatedAt: string | null;
  location: { nx: number; ny: number; label: string; isDefault: boolean };
  current: WeatherCurrent | null;
  hourly: WeatherHour[];
  daily: WeatherDay[];
  stale: boolean;
  missing: ("now" | "short" | "mid")[];
}

export interface WeatherLocationInput {
  nx: number;
  ny: number;
  label: string;
  isDefault: boolean;
  /** 중기 기온·육상 구역 코드. 없으면 격자에서 가장 가까운 구역을 고른다 */
  midTa?: string;
  midLand?: string;
}

/** 위치를 정하지 않은 사용자의 기본 위치(서울시청 격자) */
export const DEFAULT_LOCATION: WeatherLocationInput = { nx: 60, ny: 127, label: "서울특별시", isDefault: true };

const BASE = "https://apis.data.go.kr/1360000";
const PROVIDER = "kma";
const SHORT_TTL = 30 * 60_000;
const MID_TTL = 6 * 3600_000;

// ── 격자 변환 (src/lib/kma-grid.ts와 같다) ──────────────────
const DEG = Math.PI / 180;
const RE = 6371.00877 / 5.0;
const SLAT1 = 30 * DEG;
const SLAT2 = 60 * DEG;
const OLON = 126 * DEG;
const OLAT = 38 * DEG;
const SN = Math.log(Math.cos(SLAT1) / Math.cos(SLAT2)) / Math.log(Math.tan(Math.PI / 4 + SLAT2 / 2) / Math.tan(Math.PI / 4 + SLAT1 / 2));
const SF = (Math.pow(Math.tan(Math.PI / 4 + SLAT1 / 2), SN) * Math.cos(SLAT1)) / SN;
const RO = (RE * SF) / Math.pow(Math.tan(Math.PI / 4 + OLAT / 2), SN);

export function toGrid(lat: number, lon: number) {
  const ra = (RE * SF) / Math.pow(Math.tan(Math.PI / 4 + (lat * DEG) / 2), SN);
  let theta = lon * DEG - OLON;
  if (theta > Math.PI) theta -= 2 * Math.PI;
  if (theta < -Math.PI) theta += 2 * Math.PI;
  theta *= SN;
  return { nx: Math.floor(ra * Math.sin(theta) + 43 + 0.5), ny: Math.floor(RO - ra * Math.cos(theta) + 136 + 0.5) };
}

export function fromGrid(nx: number, ny: number) {
  const xn = nx - 43;
  const yn = RO - ny + 136;
  const ra = Math.sqrt(xn * xn + yn * yn) * (SN < 0 ? -1 : 1);
  const lat = 2 * Math.atan(Math.pow((RE * SF) / ra, 1 / SN)) - Math.PI / 2;
  const theta = xn === 0 ? 0 : yn === 0 ? (Math.PI / 2) * Math.sign(xn) : Math.atan2(xn, yn);
  return { lat: lat / DEG, lon: (theta / SN + OLON) / DEG };
}

export const isValidGrid = (nx: unknown, ny: unknown): boolean =>
  Number.isInteger(nx) && Number.isInteger(ny) && (nx as number) >= 1 && (nx as number) <= 149 && (ny as number) >= 1 && (ny as number) <= 253;

/** 격자에서 가장 가까운 중기 기온 구역(과 그 육상 구역) */
export function nearestMidRegion(nx: number, ny: number): { midTa: string; midLand: string } {
  const { lat, lon } = fromGrid(nx, ny);
  const k = Math.cos(lat * DEG);
  let best = MID_TA[0];
  let bestD = Infinity;
  for (const r of MID_TA) {
    const d = (r.lat - lat) ** 2 + ((r.lon - lon) * k) ** 2;
    if (d < bestD) [best, bestD] = [r, d];
  }
  return { midTa: best.regId, midLand: best.land };
}

// ── 한국 시각 도우미 ────────────────────────────────────────
const KST = 9 * 3600_000;
/** UTC 시각 → KST 기준 { ymd: "YYYYMMDD", iso: "YYYY-MM-DD", h, m } */
function kst(ms: number) {
  const d = new Date(ms + KST);
  const iso = d.toISOString().slice(0, 10);
  return { iso, ymd: iso.replaceAll("-", ""), h: d.getUTCHours(), m: d.getUTCMinutes() };
}
const ymdToIso = (ymd: string) => `${ymd.slice(0, 4)}-${ymd.slice(4, 6)}-${ymd.slice(6, 8)}`;
/** KST "YYYYMMDD" + "HHmm" → ISO 8601(UTC) */
const kstToIso = (ymd: string, hm: string) => new Date(`${ymdToIso(ymd)}T${hm.slice(0, 2)}:${hm.slice(2, 4)}:00+09:00`).toISOString();
const addDaysIso = (iso: string, n: number) => new Date(Date.parse(`${iso}T00:00:00Z`) + n * 86400_000).toISOString().slice(0, 10);

// ── 기상청 호출 ─────────────────────────────────────────────
export class KmaError extends Error {
  code: string;
  constructor(message: string, code: string) {
    super(message);
    this.code = code;
  }
}

async function call(path: string, params: Record<string, string | number>, key: string): Promise<any[]> {
  const qs = new URLSearchParams({ pageNo: "1", dataType: "JSON", ...Object.fromEntries(Object.entries(params).map(([k, v]) => [k, String(v)])) });
  // 인증키는 이미 URL 인코딩된 형태일 수 있어 그대로 붙인다(hex 키는 인코딩이 필요 없다).
  const res = await fetch(`${BASE}/${path}?${qs}&serviceKey=${key}`, { signal: AbortSignal.timeout(8000) });
  const text = await res.text();
  let body: any;
  try {
    body = JSON.parse(text);
  } catch {
    // 인증 오류 등은 XML이나 일반 텍스트로 온다.
    const msg = text.match(/<returnAuthMsg>([^<]+)/)?.[1] ?? text.match(/<resultMsg>([^<]+)/)?.[1] ?? text.slice(0, 80);
    throw new KmaError(`기상청 응답 오류(${res.status}): ${msg}`, res.status === 403 ? "FORBIDDEN" : "BAD_RESPONSE");
  }
  // 인증 오류는 JSON으로 와도 OpenAPI_ServiceResponse.cmmMsgHeader 형태다(예: 403 SERVICE_KEY_IS_NOT_REGISTERED_ERROR).
  const auth = body?.OpenAPI_ServiceResponse?.cmmMsgHeader;
  if (auth) throw new KmaError(`기상청 인증 오류(${res.status}): ${auth.errMsg ?? auth.returnAuthMsg}`, res.status === 403 ? "FORBIDDEN" : "AUTH");
  const code = body?.response?.header?.resultCode;
  if (code === "03") throw new KmaError("기상청 자료 없음(NO_DATA)", "NO_DATA");
  if (code !== "00") throw new KmaError(`기상청 오류 ${code}: ${body?.response?.header?.resultMsg}`, `KMA_${code}`);
  return body.response.body?.items?.item ?? [];
}

/** 자료가 아직 없으면(NO_DATA) 이전 발표 시각으로 한 번 더 */
async function withFallback<T>(bases: { ymd: string; hm: string }[], run: (b: { ymd: string; hm: string }) => Promise<T>): Promise<T> {
  for (let i = 0; ; i++) {
    try {
      return await run(bases[i]);
    } catch (e) {
      if (!(e instanceof KmaError && e.code === "NO_DATA") || i === bases.length - 1) throw e;
    }
  }
}

// ── 코드 해석 ───────────────────────────────────────────────
const SKY: Record<string, Sky> = { "1": "맑음", "3": "구름많음", "4": "흐림" };
/** PTY: 단기 0없음 1비 2비/눈 3눈 4소나기, 초단기 5빗방울 6빗방울눈날림 7눈날림 */
const PTY: Record<string, PrecipType> = { "0": "없음", "1": "비", "2": "비/눈", "3": "눈", "4": "소나기", "5": "비", "6": "비/눈", "7": "눈" };
const num = (v: unknown) => {
  const n = Number(v);
  return Number.isFinite(n) && n > -900 ? n : null;
};
/** "1mm 미만"·"강수없음"·"30.0~50.0mm" 같은 강수량 문자열 → mm */
const mm = (v: unknown) => (typeof v === "string" ? (v.includes("미만") ? 0.5 : (num(v.match(/[\d.]+/)?.[0]) ?? 0)) : (num(v) ?? 0));

/** 체감온도: 겨울(10°C 이하·풍속 1.3m/s 이상)은 기상청 체감온도식, 여름(27°C 이상)은 습구온도 기반 식, 그 밖에는 기온 */
export function feelsLike(t: number, windMs: number, humidity: number): number {
  let f = t;
  if (t <= 10 && windMs >= 1.3) {
    const v = Math.pow(windMs * 3.6, 0.16);
    f = 13.12 + 0.6215 * t - 11.37 * v + 0.3965 * v * t;
  } else if (t >= 27) {
    const rh = humidity;
    const tw =
      t * Math.atan(0.151977 * Math.sqrt(rh + 8.313659)) +
      Math.atan(t + rh) -
      Math.atan(rh - 1.67633) +
      0.00391838 * Math.pow(rh, 1.5) * Math.atan(0.023101 * rh) -
      4.686035;
    f = -0.2442 + 0.55399 * tw + 0.45535 * t - 0.0022 * tw * tw + 0.00278 * tw * t + 3.0;
  }
  return Math.round(f * 10) / 10;
}

// ── 원자료 → 캐시 payload ───────────────────────────────────
interface NowPayload {
  temp: number;
  humidity: number;
  wind: number;
  rain1h: number;
  precipType: PrecipType;
  observedAt: string;
}
interface ShortHour {
  date: string;
  hour: string;
  temp: number;
  sky: Sky;
  precipType: PrecipType;
  rainChance: number;
}
interface ShortPayload {
  hours: ShortHour[];
  tmx: Record<string, number>;
  tmn: Record<string, number>;
}
interface MidDayRaw {
  date: string;
  high: number | null;
  low: number | null;
  wfAm: string | null;
  wfPm: string | null;
  rnAm: number | null;
  rnPm: number | null;
}

async function fetchNow(nx: number, ny: number, key: string, now: number) {
  // 정시 관측은 40분 뒤부터 나온다.
  const bases = [0, 1].map((back) => {
    const t = kst(now - 40 * 60_000 - back * 3600_000);
    return { ymd: t.ymd, hm: `${String(t.h).padStart(2, "0")}00` };
  });
  return withFallback(bases, async (b) => {
    const items = await call("VilageFcstInfoService_2.0/getUltraSrtNcst", { numOfRows: 100, base_date: b.ymd, base_time: b.hm, nx, ny }, key);
    const v = Object.fromEntries(items.map((i: any) => [i.category, i.obsrValue]));
    const temp = num(v.T1H);
    if (temp == null) throw new KmaError("초단기실황에 기온이 없습니다.", "BAD_RESPONSE");
    const data: NowPayload = {
      temp,
      humidity: num(v.REH) ?? 0,
      wind: num(v.WSD) ?? 0,
      rain1h: mm(v.RN1),
      precipType: PTY[String(v.PTY)] ?? "없음",
      observedAt: kstToIso(b.ymd, b.hm),
    };
    return { base: data.observedAt, data };
  });
}

const SHORT_HOURS = [2, 5, 8, 11, 14, 17, 20, 23];

async function fetchShort(nx: number, ny: number, key: string, now: number) {
  // 발표 10분 뒤부터 나온다. 가장 최근 발표와 그 이전 발표를 차례로 시도한다.
  const t = kst(now - 10 * 60_000);
  const bases: { ymd: string; hm: string }[] = [];
  let day = t;
  let hours = SHORT_HOURS.filter((h) => h <= t.h).reverse();
  for (let guard = 0; bases.length < 2 && guard < 3; guard++) {
    for (const h of hours) if (bases.length < 2) bases.push({ ymd: day.ymd, hm: `${String(h).padStart(2, "0")}00` });
    day = kst(Date.parse(`${day.iso}T00:00:00+09:00`) - 3600_000);
    hours = [...SHORT_HOURS].reverse();
  }
  return withFallback(bases, async (b) => {
    const items = await call("VilageFcstInfoService_2.0/getVilageFcst", { numOfRows: 2000, base_date: b.ymd, base_time: b.hm, nx, ny }, key);
    const slots = new Map<string, Record<string, string>>();
    const tmx: Record<string, number> = {};
    const tmn: Record<string, number> = {};
    for (const it of items) {
      const date = ymdToIso(it.fcstDate);
      if (it.category === "TMX" && num(it.fcstValue) != null) tmx[date] = num(it.fcstValue)!;
      if (it.category === "TMN" && num(it.fcstValue) != null) tmn[date] = num(it.fcstValue)!;
      const k = `${date}T${it.fcstTime}`;
      if (!slots.has(k)) slots.set(k, {});
      slots.get(k)![it.category] = it.fcstValue;
    }
    const hours: ShortHour[] = [...slots.entries()]
      .filter(([, v]) => num(v.TMP) != null)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([k, v]) => ({
        date: k.slice(0, 10),
        hour: k.slice(11, 13),
        temp: num(v.TMP)!,
        sky: SKY[v.SKY] ?? "맑음",
        precipType: PTY[v.PTY] ?? "없음",
        rainChance: num(v.POP) ?? 0,
      }));
    if (!hours.length) throw new KmaError("단기예보에 기온이 없습니다.", "BAD_RESPONSE");
    const data: ShortPayload = { hours, tmx, tmn };
    return { base: kstToIso(b.ymd, b.hm), data };
  });
}

async function fetchMid(midTa: string, midLand: string, key: string, now: number) {
  // 06·18시 발표. 발표 직후 몇 분은 자료가 없을 수 있어 이전 발표도 시도한다.
  const t = kst(now - 10 * 60_000);
  const today = { ymd: t.ymd, hm: t.h >= 18 ? "1800" : "0600" };
  const prevDay = kst(now - 10 * 60_000 - 86400_000);
  const bases =
    t.h >= 18
      ? [today, { ymd: t.ymd, hm: "0600" }]
      : t.h >= 6
        ? [today, { ymd: prevDay.ymd, hm: "1800" }]
        : [{ ymd: prevDay.ymd, hm: "1800" }, { ymd: prevDay.ymd, hm: "0600" }];
  return withFallback(bases, async (b) => {
    const tmFc = `${b.ymd}${b.hm}`;
    const [ta, land] = await Promise.all([
      call("MidFcstInfoService/getMidTa", { numOfRows: 10, regId: midTa, tmFc }, key),
      call("MidFcstInfoService/getMidLandFcst", { numOfRows: 10, regId: midLand, tmFc }, key),
    ]);
    const a = ta[0] ?? {};
    const l = land[0] ?? {};
    const days: MidDayRaw[] = [];
    // 제공 일수는 기상청 개편에 따라 바뀌므로(3~10일, 4~10일 등) 있는 필드만 읽는다.
    for (let n = 3; n <= 10; n++) {
      const high = num(a[`taMax${n}`]);
      const low = num(a[`taMin${n}`]);
      const wfAm = l[`wf${n}Am`] ?? l[`wf${n}`] ?? null;
      const wfPm = l[`wf${n}Pm`] ?? l[`wf${n}`] ?? null;
      const rnAm = num(l[`rnSt${n}Am`] ?? l[`rnSt${n}`]);
      const rnPm = num(l[`rnSt${n}Pm`] ?? l[`rnSt${n}`]);
      if (high == null && low == null && !wfAm && !wfPm) continue;
      days.push({ date: addDaysIso(ymdToIso(b.ymd), n), high, low, wfAm, wfPm, rnAm, rnPm });
    }
    if (!days.length) throw new KmaError("중기예보 자료가 비어 있습니다.", "NO_DATA");
    return { base: kstToIso(b.ymd, b.hm), data: { days } };
  });
}

// ── 캐시 ────────────────────────────────────────────────────
type Part<T> = { data: T | null; base: string | null; stale: boolean; error?: string };

async function cached<T>(
  admin: SupabaseClient,
  gridKey: string,
  kind: "now" | "short" | "mid",
  ttl: number,
  fetcher: () => Promise<{ base: string; data: T }>,
): Promise<Part<T>> {
  const { data: row } = await admin
    .from("weather_cache")
    .select("payload, base_time, expires_at")
    .eq("provider", PROVIDER)
    .eq("grid_key", gridKey)
    .eq("kind", kind)
    .maybeSingle();
  if (row && Date.parse(row.expires_at) > Date.now()) return { data: row.payload as T, base: row.base_time, stale: false };
  try {
    const fresh = await fetcher();
    const { error } = await admin.from("weather_cache").upsert(
      {
        provider: PROVIDER,
        grid_key: gridKey,
        kind,
        base_time: fresh.base,
        payload: fresh.data,
        expires_at: new Date(Date.now() + ttl).toISOString(),
        updated_at: new Date().toISOString(),
      },
      { onConflict: "provider,grid_key,kind" },
    );
    if (error) console.error("weather_cache upsert", error.message);
    return { data: fresh.data, base: fresh.base, stale: false };
  } catch (e) {
    const message = (e as Error).message;
    console.error(`weather ${kind} ${gridKey}`, message);
    // 실패하면 만료된 캐시라도 쓴다.
    if (row) return { data: row.payload as T, base: row.base_time, stale: true, error: message };
    return { data: null, base: null, stale: false, error: message };
  }
}

// ── 조립 ────────────────────────────────────────────────────
const SKY_RANK: Record<Sky, number> = { 맑음: 0, 구름많음: 1, 흐림: 2 };
const PRECIP_RANK: Record<PrecipType, number> = { 없음: 0, 소나기: 1, 비: 2, "비/눈": 3, 눈: 4 };

export function summaryOf(sky: Sky, precip: PrecipType): string {
  if (precip === "없음") return sky;
  if (sky === "맑음") return precip;
  return `${sky === "흐림" ? "흐리고" : "구름많고"} ${precip}`;
}

/** 중기예보 날씨 문구("구름많고 비" 등) → 하늘·강수 */
function parseWf(wf: string | null): { sky: Sky; precip: PrecipType } {
  const s = wf ?? "";
  const sky: Sky = s.startsWith("흐") ? "흐림" : s.startsWith("구름") ? "구름많음" : "맑음";
  const precip: PrecipType = s.includes("비/눈") || s.includes("눈/비")
    ? "비/눈"
    : s.includes("소나기")
      ? "소나기"
      : s.includes("눈")
        ? "눈"
        : s.includes("비")
          ? "비"
          : "없음";
  return { sky, precip };
}

function shortDays(p: ShortPayload, today: string): WeatherDay[] {
  const byDate = new Map<string, ShortHour[]>();
  for (const h of p.hours) byDate.set(h.date, [...(byDate.get(h.date) ?? []), h]);
  // 마지막 날처럼 시간 자료가 몇 개뿐인 날은 대표값이 틀릴 수 있어 빼고 중기예보로 채운다(오늘은 늦은 밤에도 남긴다).
  const usable = [...byDate.entries()].filter(([date, hours]) => date >= today && (date === today || hours.length >= 6 || p.tmx[date] != null));
  return usable.map(([date, hours]) => {
    // 하늘은 낮(06~18시) 중 가장 흔한 상태, 강수는 가장 심한 형태.
    const day = hours.filter((h) => h.hour >= "06" && h.hour <= "18");
    const pool = day.length ? day : hours;
    const counts = new Map<Sky, number>();
    for (const h of pool) counts.set(h.sky, (counts.get(h.sky) ?? 0) + 1);
    const sky = [...counts.entries()].sort((a, b) => b[1] - a[1] || SKY_RANK[b[0]] - SKY_RANK[a[0]])[0][0];
    const precipType = hours.reduce<PrecipType>((acc, h) => (PRECIP_RANK[h.precipType] > PRECIP_RANK[acc] ? h.precipType : acc), "없음");
    const temps = hours.map((h) => h.temp);
    // 오늘 이른 발표가 지난 뒤에는 TMN이 빠지므로, 시간별 기온의 최저·최고로 대신한다.
    return {
      date,
      high: p.tmx[date] ?? (hours.length >= 6 ? Math.max(...temps) : null),
      low: p.tmn[date] ?? (hours.length >= 6 ? Math.min(...temps) : null),
      sky,
      precipType,
      rainChance: Math.max(...hours.map((h) => h.rainChance)),
      summary: summaryOf(sky, precipType),
      source: "short" as const,
    };
  });
}

function midDays(days: MidDayRaw[]): WeatherDay[] {
  return days.map((d) => {
    const am = parseWf(d.wfAm);
    const pm = parseWf(d.wfPm);
    // 오전·오후 중 나쁜 쪽을 대표로 쓴다.
    const sky = SKY_RANK[am.sky] > SKY_RANK[pm.sky] ? am.sky : pm.sky;
    const precipType = PRECIP_RANK[am.precip] > PRECIP_RANK[pm.precip] ? am.precip : pm.precip;
    return {
      date: d.date,
      high: d.high,
      low: d.low,
      sky,
      precipType,
      rainChance: Math.max(d.rnAm ?? 0, d.rnPm ?? 0),
      summary: summaryOf(sky, precipType),
      source: "mid" as const,
    };
  });
}

/**
 * 위치 하나의 날씨 보고서. 부분별로 캐시를 보고, 없거나 만료됐으면 기상청을 부른다.
 * 어떤 부분이 실패해도 나머지로 보고서를 만든다(missing에 표시).
 */
export async function getWeatherReport(admin: SupabaseClient, loc: WeatherLocationInput, key: string): Promise<WeatherReport> {
  const now = Date.now();
  const gridKey = `${loc.nx}:${loc.ny}`;
  const mid = loc.midTa && loc.midLand ? { midTa: loc.midTa, midLand: loc.midLand } : nearestMidRegion(loc.nx, loc.ny);

  const [nowPart, shortPart, midPart] = await Promise.all([
    cached(admin, gridKey, "now", SHORT_TTL, () => fetchNow(loc.nx, loc.ny, key, now)),
    cached(admin, gridKey, "short", SHORT_TTL, () => fetchShort(loc.nx, loc.ny, key, now)),
    cached(admin, `${mid.midTa}:${mid.midLand}`, "mid", MID_TTL, () => fetchMid(mid.midTa, mid.midLand, key, now)),
  ]);

  const t = kst(now);
  const today = t.iso;
  const hourNow = String(t.h).padStart(2, "0");
  const short = shortPart.data;

  const hourly: WeatherHour[] = (short?.hours ?? [])
    .filter((h) => h.date > today || (h.date === today && h.hour >= hourNow))
    .map((h) => ({ ...h, time: `${h.date}T${h.hour}:00` }));

  let current: WeatherCurrent | null = null;
  const n = nowPart.data;
  if (n) {
    const slot = short?.hours.find((h) => h.date === today && h.hour === hourNow) ?? hourly[0];
    current = {
      temp: n.temp,
      feelsLike: feelsLike(n.temp, n.wind, n.humidity),
      sky: slot?.sky ?? "맑음",
      precipType: n.precipType,
      humidity: n.humidity,
      wind: n.wind,
      rain1h: n.rain1h,
      observedAt: n.observedAt,
    };
  }

  const fromShort = short ? shortDays(short, today) : [];
  const covered = new Set(fromShort.map((d) => d.date));
  const fromMid = midPart.data ? midDays(midPart.data.days).filter((d) => d.date >= today && !covered.has(d.date)) : [];
  const daily = [...fromShort, ...fromMid].sort((a, b) => a.date.localeCompare(b.date)).slice(0, 11);

  const parts = { now: nowPart, short: shortPart, mid: midPart };
  const bases = [nowPart.base, shortPart.base, midPart.base].filter((b): b is string => Boolean(b)).sort();
  return {
    updatedAt: bases.at(-1) ?? null,
    location: { nx: loc.nx, ny: loc.ny, label: loc.label, isDefault: loc.isDefault },
    current,
    hourly,
    daily,
    stale: Object.values(parts).some((p) => p.stale),
    missing: (Object.keys(parts) as (keyof typeof parts)[]).filter((k) => !parts[k].data),
  };
}

/** profiles.weather_location → 위치 입력. 없거나 잘못됐으면 기본 위치 */
export function locationFromProfile(raw: any): WeatherLocationInput {
  if (raw && isValidGrid(raw.nx, raw.ny)) {
    return {
      nx: raw.nx,
      ny: raw.ny,
      label: typeof raw.label === "string" && raw.label ? raw.label : `격자 ${raw.nx},${raw.ny}`,
      isDefault: false,
      midTa: typeof raw.midTa === "string" ? raw.midTa : undefined,
      midLand: typeof raw.midLand === "string" ? raw.midLand : undefined,
    };
  }
  return DEFAULT_LOCATION;
}
