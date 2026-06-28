import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getRegistryBundleBySlug } from "../../../lib/data";
import { getRegistryDocumentPaths } from "../../../lib/seo";
import { getRegistryBundleFromSupabase } from "../../../lib/supabase-documents";

export const metadata: Metadata = {
  title: "AI-readiness 진단",
  description: "문서의 정적 라우트·구조화 데이터·인용 준비 상태를 점검합니다.",
};

export default async function DiagnosticsPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const bundle = getRegistryBundleBySlug(slug) ?? await getRegistryBundleFromSupabase(slug);

  if (!bundle) {
    notFound();
  }

  const { document, entity, claims } = bundle;
  const paths = getRegistryDocumentPaths(bundle);
  const lowConfidenceClaims = claims.filter((claim) => claim.confidence === "low").length;
  const claimsWithUnknownValues = claims.filter((claim) => claim.claim_value === "확인 필요").length;
  const verifiedClaims = claims.filter((claim) => claim.status === "verified").length;
  const needsReviewClaims = claims.filter((claim) => claim.status === "needs_review").length;
  const sourceCount = claims.reduce((total, claim) => total + claim.sources.length, 0);
  const unknownFactsCheck = (() => {
    if (document.status === "verified") {
      return {
        detail: `verified 문서: ${claimsWithUnknownValues} unknowns · ${sourceCount} sources · ${verifiedClaims} verified claims`,
        pass: claimsWithUnknownValues === 0 && sourceCount > 0 && verifiedClaims > 0,
      };
    }

    if (document.status === "needs_review" || needsReviewClaims > 0) {
      return {
        detail: `needs_review 문서: ${claimsWithUnknownValues}개 확인 필요 표시`,
        pass: claimsWithUnknownValues > 0,
      };
    }

    return {
      detail: `${claimsWithUnknownValues}개 확인 필요 표시`,
      pass: claimsWithUnknownValues >= 0,
    };
  })();

  const checklist = [
    { label: "Static document route", detail: `/${document.lang ?? "en"}/wiki/${document.slug}`, pass: true },
    { label: "JSON API route", detail: paths.apiPath, pass: true },
    { label: "Raw Markdown route", detail: paths.rawMarkdownPath, pass: true },
    { label: "Canonical entity_id", detail: entity.id, pass: Boolean(document.entity_id) },
    { label: "Claim coverage", detail: `${claims.length} claims`, pass: claims.length > 0 },
    { label: "verified_claims", detail: `${verifiedClaims} verified claims`, pass: document.status !== "verified" || verifiedClaims > 0 },
    { label: "needs_review_claims", detail: `${needsReviewClaims} needs_review claims`, pass: document.status === "verified" ? needsReviewClaims === 0 : true },
    { label: "source_count", detail: `${sourceCount} sources attached`, pass: document.status !== "verified" || sourceCount > 0 },
    { label: "Unknown facts visible", detail: unknownFactsCheck.detail, pass: unknownFactsCheck.pass },
    { label: "Low-confidence unknowns", detail: `${lowConfidenceClaims} low confidence claims`, pass: document.status === "verified" ? lowConfidenceClaims === 0 : lowConfidenceClaims === claimsWithUnknownValues },
    { label: "Source transparency", detail: `${sourceCount} sources attached`, pass: document.status !== "verified" || sourceCount > 0 },
    { label: "Correction URL", detail: `/report/${document.slug}`, pass: true },
    { label: "Hallucination URL", detail: `/hallucination/${document.slug}`, pass: true },
  ];

  return (
    <article>
      <header className="registry-panel">
        <p className="eyebrow">Goal 7 · AI-readiness diagnostics</p>
        <h1>{document.title}</h1>
        <div className="meta-grid">
          <div><span className="meta-label">entity_id</span><br />{entity.id}</div>
          <div><span className="meta-label">slug</span><br />{document.slug}</div>
          <div><span className="meta-label">status</span><br />{document.status}</div>
          <div><span className="meta-label">confidence</span><br />{document.confidence}</div>
          <div><span className="meta-label">verified_claims</span><br />{verifiedClaims}</div>
          <div><span className="meta-label">needs_review_claims</span><br />{needsReviewClaims}</div>
          <div><span className="meta-label">source_count</span><br />{sourceCount}</div>
        </div>
      </header>

      <section className="registry-panel" aria-labelledby="diagnostics-checklist">
        <h2 id="diagnostics-checklist">Diagnostics checklist</h2>
        <ul className="diagnostics-list">
          {checklist.map((item) => (
            <li key={item.label}>
              <span className={item.pass ? "badge badge-pass" : "badge badge-review"}>{item.pass ? "pass" : "review"}</span>{" "}
              <strong>{item.label}</strong><br />
              <span className="meta-label">{item.detail}</span>
            </li>
          ))}
        </ul>
      </section>

      <section className="registry-panel" aria-labelledby="machine-readable-panel">
        <h2 id="machine-readable-panel">Machine-readable outputs</h2>
        <ul className="link-list">
          <li><Link href={paths.canonicalPath}>Canonical page</Link></li>
          <li><Link href={paths.apiPath}>JSON API ({paths.apiPath})</Link></li>
          <li><Link href={paths.rawMarkdownPath}>Raw Markdown ({paths.rawMarkdownPath})</Link></li>
          <li><Link href="/sitemap.xml">Sitemap</Link></li>
          <li><Link href="/robots.txt">Robots</Link></li>
        </ul>
      </section>
    </article>
  );
          }
