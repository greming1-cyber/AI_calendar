"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { getProfile, seedDemo, updateProfileName } from "@/lib/data/profile";
import { DEFAULT_TZ } from "@/lib/date";

export const profileKey = ["profile"] as const;

export function useProfile() {
  return useQuery({ queryKey: profileKey, queryFn: getProfile, staleTime: 5 * 60_000 });
}

/** 사용자 타임존. 프로필을 읽기 전에는 기본값(Asia/Seoul) */
export function useTimezone() {
  return useProfile().data?.timezone ?? DEFAULT_TZ;
}

export function useUpdateProfileName() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: updateProfileName,
    onSuccess: () => qc.invalidateQueries({ queryKey: profileKey }),
  });
}

/** 데모 데이터 채우기. 끝나면 모든 쿼리를 다시 읽는다. */
export function useSeedDemo() {
  const qc = useQueryClient();
  return useMutation({ mutationFn: seedDemo, onSuccess: () => qc.invalidateQueries() });
}
