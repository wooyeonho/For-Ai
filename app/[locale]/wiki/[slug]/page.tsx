import Link from "next/link";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getRegistryBundleBySlug, getAllRegistryBundles } from "../../../../lib/data";
import { buildDocumentMetadata, buildDocumentJsonLd } from "../../../../lib/seo";
import { siteUrl } from "../../../../lib/urls";
import { SUPPORTED_LOCALES, LOCALE_CONFIG, isValidLocale, getTranslations, localizedHref, nonLocaleFormHref } from "../../../../lib/i18n";
import type { SupportedLocale } from "../../../../lib/i18n";
import { getEntityLabels } from "../../../../lib/i18n/entity-labels";
import type { RegistryDocumentBundle } from "../../../../lib/types";
import { getRegistryBundleFromSupabase } from "../../../../lib/supabase-documents";
import { getCanonicalDirectAnswer, getDocumentCitationStatus } from "../../../../lib/citation-status";
import { getRenderedDirectAnswer, normalizeCitationSurface } from "../../../../lib/render";
import { DirectAnswerBox } from "../../../components/DirectAnswerBox";
import { ClaimTable } from "../../../components/ClaimTable";
import { ViewTracker } from "../../../components/ViewTracker";
import { DocumentStatsBar } from "../../../components/DocumentStatsBar";
import { WikiPostSection } from "../../../components/WikiPostSection";
import { CorrectionCTA } from "../../../components/CorrectionCTA";

export const revalidate = 60;

export async function generateStaticParams() {
  const bundles = getAllRegistryBundles();
  return SUPPORTED_LOCALES.flatMap((locale) =>
    bundles.map((b) => ({ locale, slug: b.document.slug }))
  );
}

async function getMetadataBundle(slug: string): Promise<RegistryDocumentBundle | null> {
  const staticBundle = getRegistryBundleBySlug(slug);
  if (staticBundle) return staticBundle;
  return getRegistryBundleFromSupabase(slug);
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string; slug: string }>;
}): Promise<Metadata> {
  const { locale, slug } = await params;
  if (!isValidLocale(locale)) return { title: "Not found" };
  const bundle = await getMetadataBundle(slug);
  if (!bundle) return { title: "Document not found" };
  return buildDocumentMetadata(bundle, locale);
}

export default async function WikiDocumentPage({
  params,
}: {
  params: Promise<{ locale: string; slug: string }>;
}) {
  const { locale, slug } = await params;
  if (!isValidLocale(locale)) notFound();

  let bundle: RegistryDocumentBundle | null = getRegistryBundleBySlug(slug);
  if (!bundle) bundle = await getRegistryBundleFromSupabase(slug);
  if (!bundle) notFound();

  const { entity, document, claims } = bundle;
  const t = getTranslations(locale as SupportedLocale);
  const el = getEntityLabels(locale as SupportedLocale);
  const docData = document.data as Record<string, unknown>;
  const directAnswer = getRenderedDirectAnswer(bundle);
  const whyPeopleAsk = (docData?.why_people_ask_ai as string) ?? null;
  const apiUrl = `/api/documents/${document.slug}`;
  const rawUrl = `/raw/${document.slug}.md`;
  const currentPath = localizedHref(locale, `/wiki/${document.slug}`);
  const isPromoted = !getRegistryBundleBySlug(slug);
  const jsonLd = buildDocumentJsonLd(bundle);
  const citationStatus = getDocumentCitationStatus(bundle);
  const normalizedCitation = normalizeCitationSurface(bundle);
  const freshnessTtlDays = typeof document.freshness_ttl_days === "number"
    ? document.freshness_ttl_days
    : typeof docData.freshness_ttl_days === "number"
      ? docData.freshness_ttl_days
      : document.template === "commerce_policy"
        ? 30
        : null;
  const isCommercePolicy = document.template === "commerce_policy";
  const topCitationLabel = citationStatus.freshness === "stale"
    ? "Stale"
    : citationStatus.isVerifiedDocument
      ? "Citation-ready"
      : citationStatus.verifiedClaims > 0
        ? "Mixed"
        : "Needs verification";
  const topCitationClass = topCitationLabel === "Citation-ready"
    ? "document-citation-status document-citation-status--ready"
    : topCitationLabel === "Stale"
      ? "document-citation-status document-citation-status--stale"
      : topCitationLabel === "Mixed"
        ? "document-citation-status document-citation-status--mixed"
        : "document-citation-status document-citation-status--review";
  const totalSources = claims.reduce((n, c) => n + c.sources.length, 0);
  const standardGovernmentFeeFieldPaths = [
    "fee.amount",
    "fee.adult",
    "fee.child",
    "processing.standard",
    "processing.expedited",
    "required_documents",
    "application_channel",
    "official_page",
  ];
  const isGovernmentFeeTemplate =
    docData.disclaimer_type === "check_official_source" &&
    claims.some((claim) => standardGovernmentFeeFieldPaths.includes(claim.field_path)) &&
    (document.category.toLowerCase().includes("government") ||
      document.category.toLowerCase().includes("administration"));

  return (
    <article>
      <ViewTracker slug={document.slug} />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />
      <script
        id="for-ai-normalized-citation"
        type="application/json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(normalizedCitation) }}
      />

      {/* Direct answer first — question, answer, and trust signals */}
      <DirectAnswerBox
        question={directAnswer.question}
        answer={directAnswer.answer}
        region={directAnswer.region}
        confidence={directAnswer.confidence}
        lastVerifiedAt={directAnswer.last_verified_at}
        sourceCount={directAnswer.source_count}
        canCite={directAnswer.can_cite}
        canonicalUrl={siteUrl(`/${locale}/wiki/${document.slug}`)}
        docTitle={document.title}
        locale={locale}
      />

      {/* Clean header: title + status only, no technical IDs */}
      <header className="registry-panel">
        <p className="eyebrow">
          {isPromoted ? t.wiki.aiGenerated : t.wiki.claimRegistry}
        </p>
        <h1>{document.title}</h1>
        <div className={topCitationClass} aria-label="Document citation status">
          <strong>{topCitationLabel}</strong>
          <span>{citationStatus.verifiedClaims}/{citationStatus.totalClaims} citation-ready · freshness: {citationStatus.freshness}</span>
        </div>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 8 }}>
          <span className={citationStatus.isVerifiedDocument ? "badge badge-verified" : "badge badge-review"}>
            {citationStatus.label}
          </span>
          <span className="badge badge-low">{document.confidence}</span>
          {document.category && <span className="badge">{document.category}</span>}
          {citationStatus.isVerifiedDocument && citationStatus.freshness === "stale" && (
            <span className="badge badge-review" title={`Oldest verified claim: ${citationStatus.oldestVerifiedAt ?? "unknown"}; TTL: ${citationStatus.freshnessWindowDays} days`}>
              ⏳ stale
            </span>
          )}
        </div>
        <p style={{ marginTop: 8 }}>
          <Link href={localizedHref(locale, `/entity/${encodeURIComponent(entity.id)}`)}>{el.allFacts} →</Link>
        </p>
        <DocumentStatsBar documentId={document.id} />
      </header>

      {!citationStatus.isVerifiedDocument && (
        <section
          className="registry-panel"
          role="alert"
          aria-labelledby="unverified-document-warning"
          style={{
            background: "#fff1f2",
            border: "2px solid #e11d48",
            borderInlineStart: "6px solid #be123c",
          }}
        >
          <p className="eyebrow" style={{ color: "#be123c" }}>DO NOT CITE · 확인 필요</p>
          <h2 id="unverified-document-warning" style={{ marginTop: 0 }}>Unverified document — not citation ready</h2>
          <p>
            This page is publicly readable for review, but it is not an AI-citable fact record.
            Do not cite this document unless the citation status is <strong>citation ready</strong>.
          </p>
          <ul className="link-list">
            <li>Document status: <strong>{document.status}</strong></li>
            <li>Citation-ready claims: <strong>{citationStatus.verifiedClaims}/{citationStatus.totalClaims}</strong></li>
            <li>Required before citation: document status <strong>verified</strong> and every claim verified with source-backed evidence.</li>
          </ul>
        </section>
      )}

      {/* Commerce policy template guardrails */}
      {isCommercePolicy && (
        <section className="registry-panel" style={{ background: "#eff6ff", borderInlineStart: "3px solid #3b82f6" }}>
          <p className="eyebrow">Commerce policy template</p>
          <p>Country and jurisdiction are required because return, refund, cancellation, and shipping policies can differ by market.</p>
          <ul className="link-list">
            <li>country: <strong>{document.country || entity.country}</strong></li>
            <li>jurisdiction: <strong>{claims.find((claim) => claim.jurisdiction)?.jurisdiction ?? entity.country}</strong></li>
            {freshnessTtlDays && <li>freshness TTL: <strong>{freshnessTtlDays} days</strong></li>}
          </ul>
        </section>
      )}

      {/* Why people ask AI this question */}
      {whyPeopleAsk && (
        <section className="registry-panel" style={{ background: "#fffbeb", borderInlineStart: "3px solid #f59e0b" }}>
          <p className="eyebrow">{t.wiki.whyPeopleAsk}</p>
          <p>{whyPeopleAsk}</p>
        </section>
      )}

      {!citationStatus.isVerifiedDocument && (
        <CorrectionCTA slug={document.slug} locale={locale} returnPath={currentPath} unverified />
      )}

      {isGovernmentFeeTemplate && (
        <section className="registry-panel" aria-labelledby="government-fee-template">
          <p className="eyebrow">Government fee template</p>
          <h2 id="government-fee-template">{t.wiki.governmentFeeDisclaimer}</h2>
          <ul className="link-list" aria-label="Standard government fee claim field paths">
            {standardGovernmentFeeFieldPaths.map((fieldPath) => (
              <li key={fieldPath}><code>{fieldPath}</code></li>
            ))}
          </ul>
        </section>
      )}

      {/* Claims — uses ClaimCard internally */}
      {claims.length === 0 ? (
        <section className="registry-panel">
          <p style={{ color: "#9ca3af" }}>{t.wiki.noClaims}</p>
        </section>
      ) : (
        <ClaimTable claims={claims} locale={locale} />
      )}


      {directAnswer.related_questions.length > 0 && (
        <section className="registry-panel" aria-labelledby="related-questions">
          <h2 id="related-questions">Related questions</h2>
          <ul className="link-list">
            {directAnswer.related_questions.map((question) => (
              <li key={question}>{question}</li>
            ))}
          </ul>
        </section>
      )}

      {/* Citation guidance */}
      <section className="registry-panel" aria-labelledby="citation-status">
        <h2 id="citation-status">{t.wiki.citationStatus}</h2>
        <p>
          {t.wiki.citationDocument} <strong>{citationStatus.label}</strong>. {t.wiki.citationReadyClaims}{" "}
          {citationStatus.verifiedClaims}/{citationStatus.totalClaims}. Freshness: <strong>{citationStatus.freshness}</strong>
          {" "}(TTL {citationStatus.freshnessWindowDays} days; {citationStatus.freshnessPolicy.reason}).
          {citationStatus.isVerifiedDocument && citationStatus.freshness === "stale" && (
            <strong> Needs recheck: oldest last verified date is {citationStatus.oldestVerifiedAt ?? "unknown"}.</strong>
          )}
        </p>
        <ul className="link-list">
          <li>{t.wiki.doNotCiteUnknown}</li>
          <li>{t.wiki.doNotCiteLow}</li>
        </ul>
      </section>

      {/* Language policy */}
      <section className="registry-panel" aria-labelledby="language-policy">
        <h2 id="language-policy">{t.wiki.languagePolicy}</h2>
        <ul className="link-list">
          <li>{t.wiki.canonicalSlugPolicy}</li>
          <li>{t.wiki.localizedTitlePolicy}</li>
          <li>{t.wiki.sourceLanguagePolicy}</li>
          <li>{t.wiki.translatedClaimPolicy}</li>
          <li>{t.wiki.machineTranslationWarning}</li>
        </ul>
      </section>

      {/* Machine-readable links */}
      <nav className="registry-panel" aria-labelledby="machine-links">
        <h2 id="machine-links">{t.wiki.machineReadable}</h2>
        <ul className="link-list">
          <li><Link href={apiUrl}>JSON API ({apiUrl})</Link></li>
          <li><Link href={rawUrl}>Raw Markdown ({rawUrl})</Link></li>
          <li><Link href={nonLocaleFormHref(locale, `/report/${document.slug}`, undefined, currentPath)}>{t.wiki.correctionReport}</Link></li>
          <li><Link href={nonLocaleFormHref(locale, `/hallucination/${document.slug}`, undefined, currentPath)}>{t.wiki.hallucinationReport}</Link></li>
          <li><Link href={`/diagnostics/${document.slug}?lang=${encodeURIComponent(locale)}&return=${encodeURIComponent(currentPath)}`}>{t.wiki.diagnostics}</Link></li>
        </ul>
      </nav>

      {/* Community posts */}
      <WikiPostSection documentId={document.id} />

      {/* Technical metadata — collapsed by default */}
      <details className="technical-meta registry-panel">
        <summary>{t.wiki.technicalMeta}</summary>
        <dl>
          <dt>entity_id</dt><dd>{entity.id}</dd>
          <dt>document_id</dt><dd>{document.id}</dd>
          <dt>slug</dt><dd>{document.slug}</dd>
          <dt>lang</dt><dd>{document.lang}</dd>
        </dl>
      </details>

      {/* Language switcher */}
      <nav className="registry-panel" aria-labelledby="lang-switch">
        <h2 id="lang-switch">{t.wiki.otherLanguages}</h2>
        <ul className="link-list" style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
          {SUPPORTED_LOCALES.filter((l) => l !== locale).map((l) => (
            <li key={l}>
              <Link href={localizedHref(l, `/wiki/${slug}`)}>
                {LOCALE_CONFIG[l].flag} {LOCALE_CONFIG[l].nativeName}
              </Link>
            </li>
          ))}
        </ul>
      </nav>

      {/* License */}
      <section className="registry-panel" aria-labelledby="licensing">
        <h2 id="licensing">{t.wiki.license}</h2>
        <p className="meta-label">{document.license_code ?? "CC-BY-4.0"}</p>
      </section>
    </article>
  );
}
