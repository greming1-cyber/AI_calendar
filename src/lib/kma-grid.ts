// 위경도 ↔ 기상청 동네예보 격자(nx, ny) 변환. 기상청 LCC(Lambert Conformal Conic) 공식.
// supabase/functions/_shared/kma.ts에 같은 계산이 있다. 한쪽을 바꾸면 다른 쪽도 고친다.

const RE = 6371.00877; // 지구 반경(km)
const GRID = 5.0; // 격자 간격(km)
const SLAT1 = 30.0; // 표준위도 1
const SLAT2 = 60.0; // 표준위도 2
const OLON = 126.0; // 기준점 경도
const OLAT = 38.0; // 기준점 위도
const XO = 43; // 기준점 X 격자
const YO = 136; // 기준점 Y 격자

const DEG = Math.PI / 180;
const re = RE / GRID;
const slat1 = SLAT1 * DEG;
const slat2 = SLAT2 * DEG;
const olon = OLON * DEG;
const olat = OLAT * DEG;
const sn = Math.log(Math.cos(slat1) / Math.cos(slat2)) / Math.log(Math.tan(Math.PI * 0.25 + slat2 * 0.5) / Math.tan(Math.PI * 0.25 + slat1 * 0.5));
const sf = (Math.pow(Math.tan(Math.PI * 0.25 + slat1 * 0.5), sn) * Math.cos(slat1)) / sn;
const ro = (re * sf) / Math.pow(Math.tan(Math.PI * 0.25 + olat * 0.5), sn);

export interface Grid {
  nx: number;
  ny: number;
}

/** 위경도 → 격자 */
export function toGrid(lat: number, lon: number): Grid {
  const ra = (re * sf) / Math.pow(Math.tan(Math.PI * 0.25 + lat * DEG * 0.5), sn);
  let theta = lon * DEG - olon;
  if (theta > Math.PI) theta -= 2 * Math.PI;
  if (theta < -Math.PI) theta += 2 * Math.PI;
  theta *= sn;
  return { nx: Math.floor(ra * Math.sin(theta) + XO + 0.5), ny: Math.floor(ro - ra * Math.cos(theta) + YO + 0.5) };
}

/** 격자 → 격자 중심 위경도(소수 4자리) */
export function fromGrid(nx: number, ny: number): { lat: number; lon: number } {
  const xn = nx - XO;
  const yn = ro - ny + YO;
  let ra = Math.sqrt(xn * xn + yn * yn);
  if (sn < 0) ra = -ra;
  const alat = 2 * Math.atan(Math.pow((re * sf) / ra, 1 / sn)) - Math.PI * 0.5;
  let theta: number;
  if (Math.abs(xn) <= 0) theta = 0;
  else if (Math.abs(yn) <= 0) theta = (Math.PI * 0.5) * (xn < 0 ? -1 : 1);
  else theta = Math.atan2(xn, yn);
  const alon = theta / sn + olon;
  const round = (v: number) => Math.round(v * 10_000) / 10_000;
  return { lat: round(alat / DEG), lon: round(alon / DEG) };
}

/** 대한민국 격자 범위 안인지(기상청 격자 1~149, 1~253) */
export const isValidGrid = (g: Grid) => Number.isInteger(g.nx) && Number.isInteger(g.ny) && g.nx >= 1 && g.nx <= 149 && g.ny >= 1 && g.ny <= 253;
