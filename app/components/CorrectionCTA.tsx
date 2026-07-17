import Link from "next/link";

type CorrectionCTAProps = {
  slug: string;
  unverified?: boolean;
  locale?: string;
};

export function CorrectionCTA({ slug, unverified = false, locale = "en" }: CorrectionCTAProps) {
  const returnUrl = `/${locale}/wiki/${slug}`;
  const reportHref = `/report/${slug}?lang=${locale}&return=${encodeURIComponent(returnUrl)}`;
  const sourceHref = `/report/${slug}?intent=source&lang=${locale}&return=${encodeURIComponent(returnUrl)}`;
  const notifyHref = `/report/${slug}?intent=notify&lang=${locale}&return=${encodeURIComponent(returnUrl)}`;
  const replyHref = `/report/${slug}?intent=reply&lang=${locale}&return=${encodeURIComponent(returnUrl)}`;
  if (!unverified) {
    return (
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
        <Link href={reportHref} className="btn btn-primary cta-correction">정보 정정 요청</Link>
        <Link href={replyHref} className="btn btn-secondary">Right of reply</Link>
      </div>
    );
  }

  return (
    <section className="registry-panel" aria-labelledby="unverified-cta-title">
      <p className="eyebrow">Verification needed</p>
      <h2 id="unverified-cta-title">We don’t have a verified answer yet.</h2>
      <p>Do not cite this claim yet.</p>
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 12 }}>
        <Link href={sourceHref} className="btn btn-primary cta-correction">
          Submit an official source.
        </Link>
        <Link href={notifyHref} className="btn btn-secondary">
          Get notified when verified.
        </Link>
        <Link href={replyHref} className="btn btn-secondary">Right of reply</Link>
      </div>
      <p className="meta-label" style={{ marginTop: 12 }}>
        Public submissions enter the correction queue for human review and do not mark a claim as verified.
      </p>
    </section>
  );
}
