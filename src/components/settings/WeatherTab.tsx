"use client";

// 날씨 설정 탭(WTH-01): 기본 지역 — 현재 위치(격자만 저장) 또는 시/군/구 검색. profiles.weather_location에 저장한다.
import { useState } from "react";
import { Segmented, useToast } from "@/components/ui";
import { useProfile } from "@/lib/hooks/use-profile";
import { useSaveWeatherLocation, useWeather } from "@/lib/hooks/use-weather";
import { fromGrid, toGrid } from "@/lib/kma-grid";
import regionList from "@/lib/regions.json";
import type { WeatherLocation } from "@/lib/types";
import { ToggleList } from "./ToggleList";

interface Region {
  name: string;
  short: string;
  lat: number;
  lon: number;
  nx: number;
  ny: number;
  midTa: string;
  midLand: string;
}
const REGIONS = regionList as Region[];

const toLocation = (r: Region): WeatherLocation => ({
  lat: r.lat,
  lon: r.lon,
  nx: r.nx,
  ny: r.ny,
  label: r.name,
  midTa: r.midTa,
  midLand: r.midLand,
});

/** 위경도에서 가장 가까운 시/군/구(중기예보 구역과 표시 이름에 쓴다) */
function nearestRegion(lat: number, lon: number): Region {
  const k = Math.cos((lat * Math.PI) / 180);
  const dist = (r: Region) => (r.lat - lat) ** 2 + ((r.lon - lon) * k) ** 2;
  return REGIONS.reduce((a, b) => (dist(b) < dist(a) ? b : a));
}

export function WeatherTab() {
  const toast = useToast();
  const profile = useProfile();
  const save = useSaveWeatherLocation();
  const { report, query } = useWeather();
  const [unit, setUnit] = useState<"c" | "f">("c");
  const [searching, setSearching] = useState(false);
  const [keyword, setKeyword] = useState("");
  const [locating, setLocating] = useState(false);

  const saved = profile.data?.weatherLocation ?? null;
  const q = keyword.trim().replace(/\s+/g, " ");
  const results = q ? REGIONS.filter((r) => r.name.includes(q) || r.name.replace(/\s/g, "").includes(q.replace(/\s/g, ""))).slice(0, 8) : [];

  const apply = (location: WeatherLocation | null, message: string) =>
    save.mutate(location, {
      onSuccess: () => {
        toast.success(message);
        setSearching(false);
        setKeyword("");
      },
      onError: () => toast.error("기본 지역을 저장하지 못했어요."),
    });

  // 브라우저 위치는 격자로만 바꿔 저장한다. 위경도는 격자 중심 좌표로 바꿔 원본을 남기지 않는다.
  const locateMe = () => {
    if (!("geolocation" in navigator)) return toast.error("이 브라우저는 위치 정보를 지원하지 않아요.");
    setLocating(true);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setLocating(false);
        const { nx, ny } = toGrid(pos.coords.latitude, pos.coords.longitude);
        if (nx < 1 || nx > 149 || ny < 1 || ny > 253) return toast.error("기상청 예보 범위 밖의 위치예요.");
        const center = fromGrid(nx, ny);
        const near = nearestRegion(center.lat, center.lon);
        apply({ ...center, nx, ny, label: `현재 위치(${near.short} 부근)`, midTa: near.midTa, midLand: near.midLand }, "현재 위치로 저장했어요.");
      },
      (err) => {
        setLocating(false);
        toast.error(err.code === err.PERMISSION_DENIED ? "위치 권한을 허용해 주세요." : "현재 위치를 확인하지 못했어요.");
      },
      { enableHighAccuracy: false, timeout: 10_000, maximumAge: 10 * 60_000 },
    );
  };

  return (
    <>
      <section className="card card-warm flex-col gap-4 p-5">
        <div className="flex flex-row flex-wrap items-center gap-4">
          <div className="flex min-w-0 flex-1 flex-col gap-[3px]">
            <span className="text-xs text-muted">기본 지역</span>
            <span className="text-xl font-semibold">{saved?.label ?? "서울특별시 (기본값)"}</span>
            <span className="text-xs text-subtle">
              {query.isError
                ? "날씨를 불러오지 못했어요."
                : report?.current
                  ? `지금 ${Math.round(report.current.temp)}° · ${report.current.sky}${report.stale ? " · 최근 받은 자료" : ""}`
                  : query.isPending
                    ? "날씨 불러오는 중…"
                    : "현재 날씨 자료가 없어요."}
            </span>
          </div>
          <button type="button" onClick={locateMe} disabled={locating || save.isPending} className="pill disabled:opacity-50">
            {locating ? "위치 확인 중…" : "현재 위치 사용"}
          </button>
          <button type="button" onClick={() => setSearching((s) => !s)} aria-expanded={searching} className="pill">
            지역 변경
          </button>
        </div>

        {searching && (
          <div className="flex flex-col gap-2">
            <input
              autoFocus
              value={keyword}
              onChange={(e) => setKeyword(e.target.value)}
              placeholder="시/군/구 이름 (예: 마포구, 수원시, 제주)"
              aria-label="지역 검색"
              className="field"
            />
            {q && !results.length && <span className="text-xs text-subtle">찾는 지역이 없어요.</span>}
            {results.map((r) => (
              <button
                key={r.name}
                type="button"
                disabled={save.isPending}
                onClick={() => apply(toLocation(r), `${r.name}(으)로 저장했어요.`)}
                className="rounded-[10px] px-3 py-2 text-left text-[13px] hover:bg-white/[.06]"
              >
                {r.name}
              </button>
            ))}
            {saved && (
              <button
                type="button"
                disabled={save.isPending}
                onClick={() => apply(null, "기본값(서울)으로 되돌렸어요.")}
                className="self-start text-xs text-subtle underline"
              >
                기본값(서울)으로 되돌리기
              </button>
            )}
          </div>
        )}
        <span className="text-xs text-subtle">현재 위치는 기상청 격자(약 5km)로만 저장하고 정확한 좌표는 남기지 않아요.</span>
      </section>

      <ToggleList
        rows={[
          { key: "wxCalendar", label: "캘린더 날씨 아이콘", desc: "예보 가능 기간(최대 10일)에 표시", initial: true },
          { key: "wxDust", label: "미세먼지 표시", desc: "홈 날씨 위젯에 함께 표시", initial: false },
        ]}
      />

      <section className="card card-flat flex-row flex-wrap items-center gap-4 p-5">
        <div className="flex flex-1 flex-col gap-[3px]">
          <span className="text-sm">온도 단위</span>
          <span className="text-xs text-subtle">홈 위젯, 캘린더, 일정 상세에 적용</span>
        </div>
        <Segmented
          options={[
            { value: "c", label: "섭씨 °C" },
            { value: "f", label: "화씨 °F" },
          ]}
          value={unit}
          onChange={setUnit}
        />
      </section>
    </>
  );
}
