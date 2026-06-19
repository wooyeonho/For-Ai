import Link from "next/link";

export function HallucinationCTA({ slug }: { slug: string }) {
  return (
    <Link href={`/hallucination/${slug}`} className="cta-link cta-hallucination">
      AI 오답 신고
    </Link>
  );
}
