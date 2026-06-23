import type { Metadata } from "next";
import Link from "next/link";
import { siteUrl } from "../lib/urls";
import "./globals.css";

export const metadata: Metadata = {
  title: {
    default: "GYEOL",
    template: "%s — GYEOL",
  },
  description: "Local fact registry for AI, search engines, and humans.",
  metadataBase: new URL(siteUrl("/")),
  openGraph: {
    siteName: "GYEOL",
    type: "website",
    locale: "ko_KR",
  },
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="ko">
      <body>
        <header className="site-header" aria-label="GYEOL primary navigation">
          <Link href="/" className="site-logo">GYEOL</Link>
          <nav className="site-nav" aria-label="Primary">
            <Link href="/ko/wiki/myungdong-laluce-parking">MVP page</Link>
            <Link href="/llms.txt">llms.txt</Link>
            <Link href="/diagnostics/myungdong-laluce-parking">Diagnostics</Link>
          </nav>
        </header>
        <main className="page-shell">{children}</main>
        <footer className="site-footer">
          <p>GYEOL is a local fact registry for AI, search engines, and humans — not an AI wiki.</p>
          <p>Unknown facts remain <strong>확인 필요</strong> with low confidence until explicit sources support verification.</p>
        </footer>
      </body>
    </html>
  );
}
