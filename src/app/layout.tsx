import type { Metadata } from "next";
import { Header } from "@/components/shell/Header";
import { Sidebar } from "@/components/shell/Sidebar";
import { StoreProvider } from "@/lib/store";
import "./globals.css";

export const metadata: Metadata = {
  title: "라이프 매니저",
  description: "일정관리 · 할일관리 · 가계부를 하나로 묶은 개인용 서비스",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="ko" className="antialiased">
      <body>
        <StoreProvider>
          <div className="grid min-h-screen grid-cols-1 md:grid-cols-[76px_minmax(0,1fr)]">
            <Sidebar />
            <div className="relative flex min-w-0 flex-col pb-20 md:pb-0">
              <Header />
              {children}
            </div>
          </div>
        </StoreProvider>
      </body>
    </html>
  );
}
