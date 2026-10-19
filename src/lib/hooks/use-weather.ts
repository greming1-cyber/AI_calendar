"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { getWeather, saveWeatherLocation } from "@/lib/data/weather";
import type { ISODate, WeatherLocation } from "@/lib/types";
import { profileKey, useProfile } from "./use-profile";
import { useToday } from "./use-today";

export const weatherKeys = {
  all: ["weather"] as const,
  report: (location: string) => ["weather", location] as const,
};

/**
 * 사용자 기본 위치의 날씨(WTH-02~06). 01 캘린더·일정 상세, 06 홈이 쓴다.
 * - date를 주면 그날의 일별(day)·시간별(hourly) 예보, 없으면 오늘 것. current는 항상 현재 날씨.
 * - 기상청이 실패해도 서버가 캐시를 주면 report.stale=true. 서버도 실패하면 query.isError.
 */
export function useWeather({ date }: { date?: ISODate } = {}) {
  const today = useToday();
  const profile = useProfile();
  const loc = profile.data?.weatherLocation;
  const query = useQuery({
    queryKey: weatherKeys.report(loc ? `${loc.nx}:${loc.ny}` : "default"),
    queryFn: getWeather,
    enabled: profile.isSuccess,
    staleTime: 10 * 60_000,
    refetchInterval: 30 * 60_000,
    retry: 1,
  });
  const report = query.data ?? null;
  const target = date ?? today;
  return {
    query,
    report,
    current: report?.current ?? null,
    daily: report?.daily ?? [],
    day: report?.daily.find((d) => d.date === target) ?? null,
    hourly: report?.hourly.filter((h) => h.date === target) ?? [],
    label: report?.location.label ?? loc?.label ?? "",
  };
}

/** 날씨 기본 위치 저장. 저장 후 프로필과 날씨를 다시 읽는다 */
export function useSaveWeatherLocation() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (location: WeatherLocation | null) => saveWeatherLocation(location),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: profileKey });
      qc.invalidateQueries({ queryKey: weatherKeys.all });
    },
  });
}
