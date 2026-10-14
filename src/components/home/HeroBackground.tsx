"use client";

import type { ChangeEvent } from "react";
import { useLocalStorage } from "@/lib/use-local-storage";

const KEY = "lm_hero";

export function useHero() {
  return useLocalStorage(KEY);
}

/** 홈 상단 배경 사진. 헤더 뒤까지 깔리도록 콘텐츠 열 기준으로 절대 위치를 잡는다. */
export function HeroBackground() {
  const [hero] = useHero();
  return (
    <>
      <div className="absolute inset-x-0 top-0 h-[520px] overflow-hidden bg-[#2a2622]">
        {hero && <div className="size-full bg-cover bg-center" style={{ backgroundImage: `url(${hero})` }} />}
      </div>
      <div className="pointer-events-none absolute inset-x-0 top-0 h-[520px] bg-[linear-gradient(180deg,rgb(20_18_16/.55)_0%,rgb(20_18_16/.15)_40%,rgb(20_18_16)_100%)]" />
    </>
  );
}

/** 사진을 최대 1920px로 줄여 JPEG로 저장한다. */
export function HeroControls() {
  const [hero, setHero] = useHero();

  const onFile = (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      const scale = Math.min(1, 1920 / img.width);
      const canvas = document.createElement("canvas");
      canvas.width = img.width * scale;
      canvas.height = img.height * scale;
      canvas.getContext("2d")?.drawImage(img, 0, 0, canvas.width, canvas.height);
      setHero(canvas.toDataURL("image/jpeg", 0.85));
      URL.revokeObjectURL(url);
    };
    img.src = url;
  };

  return (
    <>
      <label className="pill pill-glass border-white/20 px-3.5 py-[9px]">
        {hero ? "사진 변경" : "+ 배경 사진 첨부"}
        <input type="file" accept="image/*" onChange={onFile} className="hidden" />
      </label>
      {hero && (
        <button type="button" onClick={() => setHero("")} className="pill pill-glass px-3.5 py-[9px]">
          사진 삭제
        </button>
      )}
    </>
  );
}
