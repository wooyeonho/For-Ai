import Link from "next/link";
import { nonLocaleFormHref } from "@/lib/i18n";

type CorrectionCTAProps = {
  slug: string;
  locale?: string;
  returnPath?: string;
  unverified?: boolean;
};

export function CorrectionCTA({ slug, locale = "ko", returnPath, unverified = false }: CorrectionCTAProps) {
  const correctionHref = (intent?: string) => nonLocaleFormHref(
    locale,
    `/report/${slug}`,
    intent ? { intent } : undefined,
    returnPath,
  );

  if (!unverified) {
    return (
      <Link href={correctionHref()} className="cta-link cta-correction">
        정보 정정 요청
      </Link>
    );
  }

  return (
    <section className="registry-panel" aria-labelledby="unverified-cta-title">
      <p className="eyebrow">Verification needed</p>
      <h2 id="unverified-cta-title">We don’t have a verified answer yet.</h2>
      <p>Do not cite this claim yet.</p>
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 12 }}>
        <Link href={correctionHref("source")} className="cta-link cta-correction">
          Submit an official source.
        </Link>
        <Link href={correctionHref("notify")} className="cta-link">
          Get notified when verified.
        </Link>
      </div>
      <p className="meta-label" style={{ marginTop: 12 }}>
        Public submissions enter the correction queue for human review and do not mark a claim as verified.
      </p>
    </section>
  );
}
