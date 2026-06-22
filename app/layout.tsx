import type { Metadata } from "next";
import { SITE_ORIGIN } from "../lib/urls";
import "./globals.css";

export const metadata: Metadata = {
  metadataBase: new URL(SITE_ORIGIN),
  title: "GYEOL",
  description: "Local fact registry for AI, search engines, and humans.",
  alternates: { canonical: "/" },
  openGraph: {
    title: "GYEOL",
    description: "Local fact registry for AI, search engines, and humans.",
    url: "/",
    siteName: "GYEOL",
    type: "website",
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
