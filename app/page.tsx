import type { Metadata } from "next";
import { HomeLanding } from "./components/HomeLanding";

export const metadata: Metadata = {
  title: { absolute: "For-Ai — Global Fact Registry for AI Citation" },
  description:
    "A global claim-level fact registry where AI, search engines, and humans cite the same facts from the same verified sources. Every claim has confidence, sources, and verification status.",
};

export const revalidate = 60;

export default async function HomePage() {
  return <HomeLanding locale="en" />;
}
