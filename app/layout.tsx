import type { Metadata } from "next";
import { siteUrl } from "../lib/urls";
import "./globals.css";

export const metadata: Metadata = {
  title: {
    default: "GYEOL",
    template: "%s â GYEOL",
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
        <main className="page-shell">{children}</main>
      </body>
    </html>
  );
}
