import Link from "next/link";

export function HallucinationCTA({ slug }: { slug: string }) {
  return (
    <Link href={`/hallucination/${slug}`} className="btn btn-secondary cta-hallucination">
      AI 오답 신고
    </Link>
  );
}
