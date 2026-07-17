import Link from "next/link";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getRegistryBundleBySlug, getAllRegistryBundles } from "../../../../lib/data";
import { buildDocumentMetadata, buildDocumentJsonLd } from "../../../../lib/seo";
import { siteUrl } from "../../../../lib/urls";
import { SUPPORTED_LOCALES, LOCALE_CONFIG, isValidLocale, getTranslations } from "../../../../lib/i18n";
import type { SupportedLocale } from "../../../../lib/i18n";
import { getEntityLabels } from "../../../../lib/i18n/entity-labels";
import type { RegistryDocumentBundle } from "../../../../lib/types";
import { getPublicCorrectionEvents, loadRegistryBundleWithPublicationState } from "../../../../lib/registry-publication";
import { getDocumentCitationStatus, getCitationSafetyBlock } from "../../../../lib/citation-status";
import { getRenderedDirectAnswer, normalizeCitationSurface, getCitationPolicyBlock } from "../../../../lib/render";
import { SponsoredPlacement } from "../../../components/SponsoredPlacement";
import { DirectAnswerBox } from "../../../components/DirectAnswerBox";
import { ClaimTable } from "../../../components/ClaimTable";
import { ViewTracker } from "../../../components/ViewTracker";
import { DocumentStatsBar } from "../../../components/DocumentStatsBar";
import { BusinessClaimCTA } from "../../../components/BusinessClaimCTA";
import { WikiPostSection } from "../../../components/WikiPostSection";
import { CorrectionCTA } from "../../../components/CorrectionCTA";
import { VerificationLevelBadge } from "../../../components/StatusBadge";
import { getBundleRiskDisclaimer } from "../../../../lib/risk-policy";
import { getBusinessProfileRiskDashboard } from "../../../../lib/entity-profile";
import { getActiveSponsoredPlacementsForEntity } from "../../../../lib/sponsored-placements";
import { safeJsonLd } from "../../../../lib/json-ld";

export const revalidate = 60;

export async function generateStaticParams() {
  const bundles = getAllRegistryBundles();
  return SUPPORTED_LOCALES.flatMap((locale) =>
    bundles.map((b) => ({ locale, slug: b.document.slug }))
  );
}

async function getMetadataBundle(slug: string): Promise<RegistryDocumentBundle | null> {
  return loadRegistryBundleWithPublicationState(slug);
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

  const bundle: RegistryDocumentBundle | null = await loadRegistryBundleWithPublicationState(slug);
  if (!bundle) notFound();

  const { entity, document, claims } = bundle;
  const t = getTranslations(locale as SupportedLocale);
  const tw = (key: string, fallback: string) => (t.wiki as Record<string, string>)[key] ?? fallback;
  const el = getEntityLabels(locale as SupportedLocale);
  const docData = document.data as Record<string, unknown>;
  const directAnswer = getRenderedDirectAnswer(bundle);
  const whyPeopleAsk = (docData?.why_people_ask_ai as string) ?? null;
  const apiUrl = `/api/documents/${document.slug}`;
  const rawUrl = `/raw/${document.slug}.md`;
  const documentReturnUrl = `/${locale}/wiki/${document.slug}`;
  const reportActionUrl = `/report/${document.slug}?lang=${locale}&return=${documentReturnUrl}`;
  const hallucinationActionUrl = `/hallucination/${document.slug}?lang=${locale}&return=${documentReturnUrl}`;
  const isPromoted = !getRegistryBundleBySlug(slug);
  const jsonLd = buildDocumentJsonLd(bundle);
  const citationStatus = getDocumentCitationStatus(bundle);
  const citationSafety = getCitationSafetyBlock(bundle, locale);
  const normalizedCitation = normalizeCitationSurface(bundle);
  const citationPolicyBlock = getCitationPolicyBlock(bundle, locale);
  const freshnessWindowDays = typeof document.freshness_ttl_days === "number"
    ? document.freshness_ttl_days
    : typeof docData.freshness_ttl_days === "number"
      ? docData.freshness_ttl_days
      : document.template === "commerce_policy"
        ? 30
        : null;
  const isCommercePolicy = document.template === "commerce_policy";
  const riskDisclaimer = getBundleRiskDisclaimer(bundle);
  const topCitationLabel = citationStatus.freshness === "stale"
    ? tw("stale", "Stale")
    : citationStatus.isVerifiedDocument
      ? tw("citationReady", "Citation-ready")
      : citationStatus.verifiedClaims > 0
        ? tw("mixed", "Mixed")
        : tw("needsVerification", "Needs verification");
  const topCitationClass = topCitationLabel === "Citation-ready"
    ? "document-citation-status document-citation-status--ready"
    : topCitationLabel === "Stale"
      ? "document-citation-status document-citation-status--stale"
      : topCitationLabel === "Mixed"
        ? "document-citation-status document-citation-status--mixed"
        : "document-citation-status document-citation-status--review";
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
  const sponsoredPlacements = await getActiveSponsoredPlacementsForEntity(entity.id);
  const businessRiskDashboard = getBusinessProfileRiskDashboard([bundle]);
  const isGovernmentFeeTemplate =
    docData.disclaimer_type === "check_official_source" &&
    claims.some((claim) => standardGovernmentFeeFieldPaths.includes(claim.field_path)) &&
    (document.category.toLowerCase().includes("government") ||
      document.category.toLowerCase().includes("administration"));
  const totalSources = claims.reduce((sum, claim) => sum + claim.sources.length, 0);
  const hasBusinessSubmittedClaims = claims.some((claim) => claim.source_of_claim === "business_submitted");
  const hasSponsoredClaims = claims.some((claim) => claim.source_of_claim === "sponsored");
  const publicationBlockedClaims = claims.filter((claim) => claim.publication_state === "quarantined" || claim.publication_state === "withdrawn");
  const correctionEvents = await getPublicCorrectionEvents(document.slug, claims.map((claim) => claim.id));

  return (
    <article>
      <ViewTracker slug={document.slug} />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: safeJsonLd(jsonLd) }}
      />
      <script
        id="for-ai-normalized-citation"
        type="application/json"
        dangerouslySetInnerHTML={{ __html: safeJsonLd(normalizedCitation) }}
      />
      <script
        id="for-ai-citation-policy"
        type="application/json"
        dangerouslySetInnerHTML={{ __html: safeJsonLd(citationPolicyBlock) }}
      />

      {/* Top reading order: document title → direct answer → citation signals */}
      <header className="registry-panel">
        <p className="eyebrow">
          {isPromoted ? t.wiki.aiGenerated : t.wiki.claimRegistry}
        </p>
        <h1>{document.title}</h1>
        <p style={{ marginTop: 8 }}>
          <Link href={`/${locale}/entity/${encodeURIComponent(entity.id)}`}>{el.allFacts} →</Link>
        </p>
      </header>

      <DirectAnswerBox
        question={directAnswer.question}
        answer={directAnswer.answer}
        region={directAnswer.region}
        confidence={directAnswer.confidence}
        lastVerifiedAt={directAnswer.last_verified_at}
        sourceCount={directAnswer.source_count}
        canCite={directAnswer.can_cite}
        citationStatusLabel={topCitationLabel}
        canonicalUrl={siteUrl(`/${locale}/wiki/${document.slug}`)}
        docTitle={document.title}
        locale={locale}
      />

      {publicationBlockedClaims.length > 0 && (
        <section
          className="registry-panel"
          role="alert"
          aria-labelledby="publication-state-warning"
          style={{ background: "#fff1f2", border: "2px solid #be123c", borderInlineStart: "6px solid #9f1239" }}
        >
          <p className="eyebrow" style={{ color: "#9f1239" }}>CORRECTION IN PROGRESS · DO NOT CITE AFFECTED CLAIMS</p>
          <h2 id="publication-state-warning" style={{ marginTop: 0 }}>A claim on this page is quarantined or withdrawn</h2>
          <p>The page remains available to preserve the public record. Affected historical values are not citation-ready and badge/API outputs exclude them from verified claims.</p>
          <ul className="link-list">
            {publicationBlockedClaims.map((claim) => (
              <li key={claim.id}><strong>{claim.field_path}</strong>: {claim.publication_state}</li>
            ))}
          </ul>
          <Link href={`/report/${document.slug}?intent=reply&lang=${locale}&return=${encodeURIComponent(documentReturnUrl)}`}>Submit a right of reply →</Link>
        </section>
      )}

      {riskDisclaimer && (
        <section
          className="registry-panel"
          role="note"
          aria-labelledby="high-risk-disclaimer"
          style={{ background: "#fff7ed", borderInlineStart: "4px solid #f97316" }}
        >
          <p className="eyebrow">High-risk category · {riskDisclaimer.category}</p>
          <h2 id="high-risk-disclaimer" style={{ marginTop: 0 }}>{riskDisclaimer.title}</h2>
          <p>{riskDisclaimer.body}</p>
          <p style={{ marginBottom: 0 }}>
            Verified status requires human review plus at least one official or regulator source.
          </p>
        </section>
      )}

      {/* Citation status + metadata panel; the document <h1> renders once in the top header */}
      <section className="registry-panel" aria-label={tw("documentCitationStatus", "Document citation status")}>
        <div className={topCitationClass} aria-label={tw("documentCitationStatus", "Document citation status")}>
          <strong>{topCitationLabel}</strong>
          <span>{citationStatus.verifiedClaims}/{citationStatus.totalClaims} {tw("citationReadyLower", "citation-ready")} · {tw("freshness", "freshness")}: {citationStatus.freshness}</span>
        </div>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 8 }}>
          <VerificationLevelBadge level={citationStatus.verificationLevel} />
        </div>
        <dl className="direct-answer-meta" aria-label="Top citation metadata">
          <div><dt>{t.claims.lastVerified}</dt><dd>{citationStatus.oldestVerifiedAt ?? directAnswer.last_verified_at ?? "Needs verification"}</dd></div>
          <div><dt>{t.claims.sourceCount}</dt><dd>{totalSources}</dd></div>
          <div><dt>{t.claims.confidence}</dt><dd>{document.confidence}</dd></div>
          <div><dt>Category</dt><dd>{document.category || "uncategorized"}</dd></div>
        </dl>
        <DocumentStatsBar documentId={document.id} />
        <div style={{ marginTop: 12 }}>
          <Link
            href={`/community?document_id=${encodeURIComponent(document.id)}&q=${encodeURIComponent(document.title)}`}
            style={{ fontSize: "0.82rem", color: "var(--muted)", textDecoration: "none" }}
          >
            💬 이 팩트에 대해 질문하기 →
          </Link>
        </div>
      </section>

      <BusinessClaimCTA
        entityId={entity.id}
        documentSlug={document.slug}
        locale={locale}
        documentTitle={document.title}
        unverifiedCriticalClaims={businessRiskDashboard.unverified_critical_claims.length}
        staleSources={businessRiskDashboard.stale_sources.length}
      />

      {citationStatus.isVerifiedDocument && citationStatus.freshness === "stale" && (
        <section
          className="registry-panel"
          role="alert"
          aria-labelledby="stale-document-warning"
          style={{
            background: "#fffbeb",
            border: "2px solid #f59e0b",
            borderInlineStart: "6px solid #d97706",
          }}
        >
          <p className="eyebrow" style={{ color: "#92400e" }}>STALE · 재검증 필요</p>
          <h2 id="stale-document-warning" style={{ marginTop: 0 }}>Verified but freshness TTL has expired</h2>
          <p>
            This document has verified, source-backed claims, but at least one citation-ready claim exceeded its freshness TTL.
            Treat the affected claim as needing re-verification before relying on it for current answers.
          </p>
          <ul className="link-list">
            <li>Freshness TTL: <strong>{citationStatus.freshnessWindowDays} days</strong></li>
            <li>Oldest verified claim date: <strong>{citationStatus.oldestVerifiedAt ?? "unknown"}</strong></li>
            <li>Stale claims: <strong>{citationStatus.staleClaims.map((claim) => claim.fieldPath).join(", ") || "unknown"}</strong></li>
          </ul>
        </section>
      )}

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
          <h2 id="unverified-document-warning" style={{ marginTop: 0 }}>Not citation-ready</h2>
          <p>Do not cite this page as fact. It is readable for review only.</p>
          <ul className="link-list">
            <li>{tw("documentStatus", "Document status")}: <strong>{document.status}</strong></li>
            <li>{tw("citationReadyClaimsPlain", "Citation-ready claims")}: <strong>{citationStatus.verifiedClaims}/{citationStatus.totalClaims}</strong></li>
            <li>{tw("requiredBeforeCitation", "Required before citation: document status")} <strong>verified</strong> {tw("everyClaimVerified", "and every claim verified with source-backed evidence.")}</li>
          </ul>
        </section>
      )}

      {(hasBusinessSubmittedClaims || hasSponsoredClaims) && (
        <section
          className="registry-panel"
          aria-labelledby="business-disclosure"
          style={{ background: "#fffbeb", border: "2px solid #f59e0b", borderInlineStart: "6px solid #d97706" }}
        >
          <p className="eyebrow" style={{ color: "#92400e" }}>Business / sponsored disclosure</p>
          <h2 id="business-disclosure" style={{ marginTop: 0 }}>Commercial-origin content is clearly labeled</h2>
          <ul className="link-list">
            {hasBusinessSubmittedClaims && (
              <li>
                Business-submitted claims on this page are <strong>not citation-ready</strong> until independent human verification
                adds normal sources and verification events in the canonical claim chain.
              </li>
            )}
            {hasSponsoredClaims && (
              <li>
                Sponsored or business-claimed content is promotional/commercial-origin material and must not be confused with
                independently verified facts.
              </li>
            )}
          </ul>
        </section>
      )}

      {/* Commerce policy template guardrails */}
      {isCommercePolicy && (
        <details className="registry-panel policy-details" style={{ background: "#eff6ff", borderInlineStart: "3px solid #3b82f6" }}>
          <summary>Commerce policy template</summary>
          <p>Country and jurisdiction are required because return, refund, cancellation, and shipping policies can differ by market.</p>
          <ul className="link-list">
            <li>country: <strong>{document.country || entity.country}</strong></li>
            <li>jurisdiction: <strong>{claims.find((claim) => claim.jurisdiction)?.jurisdiction ?? entity.country}</strong></li>
            {freshnessWindowDays && <li>{tw("freshnessTtl", "freshness TTL")}: <strong>{freshnessWindowDays} days</strong></li>}
          </ul>
        </details>
      )}

      {/* Why people ask AI this question */}
      {whyPeopleAsk && (
        <section className="registry-panel" style={{ background: "#fffbeb", borderInlineStart: "3px solid #f59e0b" }}>
          <p className="eyebrow">{t.wiki.whyPeopleAsk}</p>
          <p>{whyPeopleAsk}</p>
        </section>
      )}

      {!citationStatus.isVerifiedDocument && (
        <CorrectionCTA slug={document.slug} locale={locale} unverified />
      )}

      {isGovernmentFeeTemplate && (
        <section className="registry-panel" aria-labelledby="government-fee-template">
          <p className="eyebrow">{tw("governmentFeeTemplate", "Government fee template")}</p>
          <h2 id="government-fee-template">{t.wiki.governmentFeeDisclaimer}</h2>
          <ul className="link-list" aria-label={tw("standardGovernmentFeeFieldPaths", "Standard government fee claim field paths")}>
            {standardGovernmentFeeFieldPaths.map((fieldPath) => (
              <li key={fieldPath}><code>{fieldPath}</code></li>
            ))}
          </ul>
        </section>
      )}

      {sponsoredPlacements.length > 0 && (
        <section className="registry-panel" aria-labelledby="sponsored-placements">
          <p className="eyebrow">Sponsored placements</p>
          <h2 id="sponsored-placements">Sponsored</h2>
          <p className="meta-label">Paid promotional content below is separate from claim verification and does not affect citation status.</p>
          {sponsoredPlacements.map((placement) => (
            <SponsoredPlacement
              key={placement.id}
              businessName={placement.business_name}
              placementType={placement.placement_type}
              title={placement.category ? `${placement.business_name} · ${placement.category}` : placement.business_name}
              description="Sponsored placement. Not a verified factual claim."
              url={placement.target_url ?? undefined}
              displayLabel={placement.display_label}
            />
          ))}
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

      {correctionEvents.length > 0 && (
        <section className="registry-panel" aria-labelledby="correction-history">
          <p className="eyebrow">Immutable public record</p>
          <h2 id="correction-history">Correction history</h2>
          <p className="meta-label">Reporter contact and operator identity are private and never appear in this history.</p>
          <ol className="link-list">
            {correctionEvents.map((event) => (
              <li key={event.id}>
                <strong>{event.event_type}</strong> · claim <code>{event.claim_id}</code> · {new Date(event.created_at).toISOString()}
                <p style={{ margin: "4px 0" }}>{event.public_reason}</p>
                <span className="meta-label">{event.previous_publication_state} → {event.new_publication_state}</span>
              </li>
            ))}
          </ol>
        </section>
      )}


      {directAnswer.related_questions.length > 0 && (
        <section className="registry-panel" aria-labelledby="related-questions">
          <h2 id="related-questions">{tw("relatedQuestions", "Related questions")}</h2>
          <ul className="link-list">
            {directAnswer.related_questions.map((question) => (
              <li key={question}>{question}</li>
            ))}
          </ul>
        </section>
      )}

      {/* Citation guidance */}
      <details className="registry-panel policy-details">
        <summary>{t.wiki.citationStatus}</summary>
        <p>
          {t.wiki.citationDocument} <strong>{citationStatus.label}</strong>. {t.wiki.citationReadyClaims}{" "}
          {citationStatus.verifiedClaims}/{citationStatus.totalClaims}. {tw("freshnessCapital", "Freshness")}: <strong>{citationStatus.freshness}</strong>
          {" "}(TTL {citationStatus.freshnessWindowDays} days; {citationStatus.freshnessPolicy.reason}).
          {citationStatus.isVerifiedDocument && citationStatus.freshness === "stale" && (
            <strong> {tw("needsRecheck", "Needs recheck: oldest last verified date is")} {citationStatus.oldestVerifiedAt ?? tw("unknown", "unknown")}.</strong>
          )}
        </p>
        <pre aria-label="AI citation safety JSON">{JSON.stringify(citationSafety, null, 2)}</pre>
        <ul className="link-list">
          <li>{t.wiki.doNotCiteUnknown}</li>
          <li>{t.wiki.doNotCiteLow}</li>
          <li><Link href={`/${locale}/verification-policy`}>Read the For-Ai verification policy</Link></li>
        </ul>
      </details>

      {/* Language policy */}
      <details className="registry-panel policy-details">
        <summary>{t.wiki.languagePolicy}</summary>
        <ul className="link-list">
          <li>{t.wiki.canonicalSlugPolicy}</li>
          <li>{t.wiki.localizedTitlePolicy}</li>
          <li>{t.wiki.sourceLanguagePolicy}</li>
          <li>{t.wiki.translatedClaimPolicy}</li>
          <li>{t.wiki.machineTranslationWarning}</li>
        </ul>
      </details>

      {/* Machine-readable links */}
      <nav className="registry-panel" aria-labelledby="machine-links">
        <h2 id="machine-links">{t.wiki.machineReadable}</h2>
        <ul className="link-list">
          <li><Link href={apiUrl}>JSON API ({apiUrl})</Link></li>
          <li><Link href={rawUrl}>Raw Markdown ({rawUrl})</Link></li>
          <li><Link href={reportActionUrl}>{t.wiki.correctionReport}</Link></li>
          <li><Link href={`/report/${document.slug}?intent=reply&lang=${locale}&return=${encodeURIComponent(documentReturnUrl)}`}>Right of reply</Link></li>
          <li><Link href={hallucinationActionUrl}>{t.wiki.hallucinationReport}</Link></li>
          <li><Link href={`/diagnostics/${document.slug}`}>{t.wiki.diagnostics}</Link></li>
        </ul>
      </nav>

      {/* Community posts */}
      <WikiPostSection documentId={document.id} claims={claims.map((claim) => ({ id: claim.id, label: claim.field_path }))} />

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
              <Link href={`/${l}/wiki/${slug}`}>
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
