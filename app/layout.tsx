import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "GYEOL",
  description: "Local fact registry for AI, search engines, and humans.",
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
