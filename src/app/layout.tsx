import type { Metadata } from "next";
import { AppShell } from "@/components/shell/AppShell";
import { Providers } from "./providers";
import "./globals.css";

export const metadata: Metadata = {
  title: "라이프 매니저",
  description: "일정관리 · 할일관리 · 가계부를 하나로 묶은 개인용 서비스",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="ko" className="antialiased">
      <body>
        <Providers>
          <AppShell>{children}</AppShell>
        </Providers>
      </body>
    </html>
  );
}
