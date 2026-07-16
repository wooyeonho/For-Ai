import type { Metadata } from "next";
import { DEFAULT_LOCALE } from "../lib/i18n";
import { siteUrl } from "../lib/urls";
import { SiteHeader } from "./components/SiteHeader";
import { SiteFooter } from "./components/SiteFooter";
import "./globals.css";

export const metadata: Metadata = {
  title: {
    default: "For-Ai",
    template: "%s — For-Ai",
  },
  description: "Global claim-level fact registry for AI citation, search engines, and humans.",
  metadataBase: new URL(siteUrl("/")),
  openGraph: {
    siteName: "For-Ai",
    type: "website",
    locale: "en_US",
  },
  alternates: {
    types: {
      "application/rss+xml": [
        { url: siteUrl("/feed.xml"), title: "For-Ai verified claims" },
        { url: siteUrl("/changelog.xml"), title: "For-Ai claim changelog" },
      ],
    },
  },
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang={DEFAULT_LOCALE}>
      <body>
        <SiteHeader />
        <main className="page-shell">{children}</main>
        <SiteFooter />
      </body>
    </html>
  );
}
