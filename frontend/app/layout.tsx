import type { Metadata } from "next";
import { AppShell } from "@/components/layout/app-shell";
import "./globals.css";

export const metadata: Metadata = {
  title: "标证通 BidEvidence",
  description: "招投标合规与交付工作台",
};

// Local projects are loaded only after the desktop runtime has started its loopback API.
// Static prerendering would otherwise try to read a non-existent developer/demo service at build time.
export const dynamic = "force-dynamic";

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="zh-CN">
      <body>
        <AppShell>{children}</AppShell>
      </body>
    </html>
  );
}
