import Link from "next/link";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getAllRegistryBundles, getRegistryBundleBySlug } from "../../../../lib/data";
import { getClaimCitationStatus, getDocumentCitationStatus, UNKNOWN_FACT_TEXT } from "../../../../lib/citation-status";
import { DEFAULT_LOCALE, isValidLocale, SUPPORTED_LOCALES } from "../../../../lib/i18n";
import type { ClaimWithSources, RegistryDocumentBundle } from "../../../../lib/types";

export const revalidate = 60;

const MAX_COMPARISON_ENTITIES = 4;

function needsVerificationLabel(locale: string) {
  return locale === "ko" ? "확인 필요 / Needs verification" : "Needs verification / 확인 필요";
}

function getComparableBundles(anchor: RegistryDocumentBundle): RegistryDocumentBundle[] {
  const bundles = getAllRegistryBundles();
  const sameCategory = bundles.filter(
    (bundle) => bundle.document.category === anchor.document.category && bundle.entity.id !== anchor.entity.id,
  );
  return [anchor, ...sameCategory].slice(0, MAX_COMPARISON_ENTITIES);
}

function getClaimValue(claim: ClaimWithSources | undefined, locale: string) {
  if (!claim) return needsVerificationLabel(locale);
  return getClaimCitationStatus(claim).isCitationReady ? claim.claim_value : needsVerificationLabel(locale);
}

function getClaimSources(claim: ClaimWithSources | undefined) {
  if (!claim || !getClaimCitationStatus(claim).isCitationReady) return [];
  return claim.sources.filter((source) => Boolean(source.url || source.citation || source.title));
}

function getLastVerified(claim: ClaimWithSources | undefined, locale: string) {
  if (!claim || !getClaimCitationStatus(claim).isCitationReady) return needsVerificationLabel(locale);
  return claim.last_verified_at ?? needsVerificationLabel(locale);
}

function getFieldPaths(bundles: RegistryDocumentBundle[]) {
  return Array.from(new Set(bundles.flatMap((bundle) => bundle.claims.map((claim) => claim.field_path)))).sort();
}

function summarizeDifference(fieldPath: string, bundles: RegistryDocumentBundle[], locale: string) {
  const values = bundles.map((bundle) => {
    const claim = bundle.claims.find((candidate) => candidate.field_path === fieldPath);
    return getClaimValue(claim, locale);
  });
  const verifiedValues = values.filter((value) => !value.includes("Needs verification") && value !== UNKNOWN_FACT_TEXT);
  if (verifiedValues.length < bundles.length) {
    return locale === "ko"
      ? "일부 비교 항목에 verified claim이 없어 차이를 확정하지 않습니다."
      : "Difference not asserted because at least one compared item has no verified claim.";
  }
  return new Set(verifiedValues).size > 1
    ? locale === "ko"
      ? "검증된 claim 값이 서로 다릅니다."
      : "Verified claim values differ."
    : locale === "ko"
      ? "검증된 claim 값이 같습니다."
      : "Verified claim values match.";
}

export async function generateStaticParams() {
  const bundles = getAllRegistryBundles();
  return SUPPORTED_LOCALES.flatMap((locale) => bundles.map((bundle) => ({ locale, slug: bundle.document.slug })));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string; slug: string }>;
}): Promise<Metadata> {
  const { locale, slug } = await params;
  if (!isValidLocale(locale)) return { title: "Not found" };
  const bundle = getRegistryBundleBySlug(slug);
  if (!bundle) return { title: "Comparison not found" };
  return {
    title: `Claim comparison: ${bundle.document.title}`,
    description: "Claim-level comparison page with sources, last verification dates, difference summary, and citation guidance.",
  };
}

export default async function ComparePage({
  params,
}: {
  params: Promise<{ locale: string; slug: string }>;
}) {
  const { locale: rawLocale, slug } = await params;
  if (!isValidLocale(rawLocale)) notFound();
  const locale = rawLocale || DEFAULT_LOCALE;
  const anchor = getRegistryBundleBySlug(slug);
  if (!anchor) notFound();

  const bundles = getComparableBundles(anchor);
  const fieldPaths = getFieldPaths(bundles);
  const unknownLabel = needsVerificationLabel(locale);

  return (
    <article>
      <header className="registry-panel">
        <p className="eyebrow">Claim-level comparison candidate</p>
        <h1>Compare: {anchor.document.category}</h1>
        <p>
          This page compares entities only through canonical claims. It does not rank, recommend, or infer facts outside
          verified claim records.
        </p>
        <p className="meta-label">추천/랭킹 문구가 추가되는 경우 별도 disclosure가 필요합니다.</p>
        <p className="meta-label">Affiliate links, if added later, must be clearly labeled as sponsored/affiliate.</p>
      </header>

      <section className="registry-panel" aria-labelledby="comparison-entities">
        <h2 id="comparison-entities">Comparison entities</h2>
        <ul className="link-list">
          {bundles.map((bundle) => {
            const status = getDocumentCitationStatus(bundle);
            return (
              <li key={bundle.entity.id}>
                <Link href={`/${locale}/wiki/${bundle.document.slug}`}>{bundle.document.title}</Link>{" "}
                <span className={status.isVerifiedDocument ? "status-badge status-badge--verified" : "status-badge status-badge--needs-review"}>
                  {status.verifiedClaims}/{status.totalClaims} verified claims
                </span>{" "}
                <span className="meta-label">entity_id: {bundle.entity.id}</span>
              </li>
            );
          })}
        </ul>
      </section>

      <section className="registry-panel" aria-labelledby="claim-comparison-table">
        <h2 id="claim-comparison-table">Claim table</h2>
        <div className="table-wrap">
          <table className="data-table">
            <thead>
              <tr>
                <th>Claim</th>
                {bundles.map((bundle) => (
                  <th key={bundle.entity.id}>
                    {bundle.document.title}
                  </th>
                ))}
                <th>Difference summary</th>
              </tr>
            </thead>
            <tbody>
              {fieldPaths.map((fieldPath) => (
                <tr key={fieldPath}>
                  <th scope="row">
                    {fieldPath}
                  </th>
                  {bundles.map((bundle) => {
                    const claim = bundle.claims.find((candidate) => candidate.field_path === fieldPath);
                    const sources = getClaimSources(claim);
                    return (
                      <td key={bundle.entity.id}>
                        <p><strong>{getClaimValue(claim, locale)}</strong></p>
                        <p className="meta-label">Last verified: {getLastVerified(claim, locale)}</p>
                        <p className="meta-label">Source per claim:</p>
                        {sources.length > 0 ? (
                          <ul className="link-list">
                            {sources.map((source) => (
                              <li key={source.id}>
                                {source.url ? <a href={source.url}>{source.title ?? source.citation ?? source.url}</a> : (source.title ?? source.citation)}
                              </li>
                            ))}
                          </ul>
                        ) : (
                          <p className="meta-label">{unknownLabel}</p>
                        )}
                      </td>
                    );
                  })}
                  <td>
                    {summarizeDifference(fieldPath, bundles, locale)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="registry-panel" aria-labelledby="citation-guidance">
        <h2 id="citation-guidance">Citation guidance</h2>
        <ul className="link-list">
          <li>Cite individual verified claims with their displayed source, not the comparison summary as a factual source.</li>
          <li>Do not cite values marked as Needs verification / 확인 필요 as facts.</li>
          <li>Do not treat this page as a recommendation or ranking unless a separate recommendation disclosure is added.</li>
          <li>Sponsored or affiliate content must be explicitly labeled before publication.</li>
        </ul>
      </section>
    </article>
  );
}
