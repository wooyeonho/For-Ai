import Link from "next/link";

export function CorrectionCTA({ slug }: { slug: string }) {
  return (
    <Link href={`/report/${slug}`} className="cta-link cta-correction">
      정보 정정 요청
    </Link>
  );
}
