import type { Metadata } from "next";
import Link from "next/link";
import HomePageContent from "./components/HomePageContent";

export const metadata: Metadata = {
  title: { absolute: "For-Ai — Global Fact Registry for AI Citation" },
  description:
    "A global claim-level fact registry where AI, search engines, and humans cite the same facts from the same verified sources. Every claim has confidence, sources, and verification status.",
};

export const revalidate = 60;

export default async function HomePage() {
  return (
    <>
      <nav
        aria-label="Trust and verification"
        style={{
          maxWidth: 1120,
          margin: "0 auto",
          padding: "12px 24px 0",
          fontSize: 14,
          lineHeight: 1.5,
        }}
      >
        <Link href="/methodology">How For-Ai verifies claims</Link>
      </nav>
      <HomePageContent locale="en" />
    </>
  );
}
