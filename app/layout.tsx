import type { Metadata } from "next";
import { siteUrl } from "../lib/urls";
import { SiteHeader } from "./components/SiteHeader";
import { SiteFooter } from "./components/SiteFooter";
import "./globals.css";

export const metadata: Metadata = {
  title: {
    default: "For-Ai",
    template: "%s — For-Ai",
  },
  description: "A global claim-level fact registry for AI citation, search engines, and humans.",
  metadataBase: new URL(siteUrl("/")),
  openGraph: {
    siteName: "For-Ai",
    type: "website",
    locale: "ko_KR",
  },
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="ko">
      <body>
        <SiteHeader />
        <main className="page-shell">{children}</main>
        <SiteFooter />
      </body>
    </html>
  );
}
