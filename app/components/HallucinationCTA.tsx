import Link from "next/link";
import { nonLocaleFormHref } from "@/lib/i18n";

export function HallucinationCTA({ slug, locale = "ko", returnPath }: { slug: string; locale?: string; returnPath?: string }) {
  return (
    <Link href={nonLocaleFormHref(locale, `/hallucination/${slug}`, undefined, returnPath)} className="cta-link cta-hallucination">
      AI 오답 신고
    </Link>
  );
}
