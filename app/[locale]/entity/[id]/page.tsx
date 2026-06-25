import Link from "next/link";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getAllRegistryBundles } from "../../../../lib/data";
import { getEntityProfile } from "../../../../lib/entity-profile";
import { getDocumentCitationStatus } from "../../../../lib/citation-status";
import { buildEntityMetadata, buildEntityJsonLd } from "../../../../lib/seo";
import { apiEntityUrl } from "../../../../lib/urls";
import { SUPPORTED_LOCALES, isValidLocale, getTranslations } from "../../../../lib/i18n";
import type { SupportedLocale } from "../../../../lib/i18n";
import { getEntityLabels } from "../../../../lib/i18n/entity-labels";
import { ClaimTable } from "../../../components/ClaimTable";

export const revalidate = 60;

export async function generateStaticParams() {
  const ids = [...new Set(getAllRegistryBundles().map((b) => b.entity.id))];
  return SUPPORTED_LOCALES.flatMap((locale) => ids.map((id) => ({ locale, id })));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string; id: string }>;
}): Promise<Metadata> {
  const { locale, id } = await params;
  if (!isValidLocale(locale)) return { title: "Not found" };
  const profile = await getEntityProfile(decodeURIComponent(id));
  if (!profile) return { title: "Entity not found" };
  return buildEntityMetadata(profile, locale);
}

export default async function EntityProfilePage({
  params,
}: {
  params: Promise<{ locale: string; id: string }>;
}) {
  const { locale, id } = await params;
  if (!isValidLocale(locale)) notFound();

  const profile = await getEntityProfile(decodeURIComponent(id));
  if (!profile) notFound();

  const { entity, documents, summary } = profile;
  const t = getTranslations(locale as SupportedLocale);
  const el = getEntityLabels(locale as SupportedLocale);
  const jsonLd = buildEntityJsonLd(profile);

  return (
    <article>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />

      <header className="registry-panel">
        <p className="eyebrow">{el.profile}</p>
        <h1>{entity.canonical_name}</h1>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 8 }}>
          {entity.type && <span className="badge">{entity.type}</span>}
          {entity.country && <span className="badge">{entity.country}</span>}
          {entity.city && <span className="badge">{entity.city}</span>}
        </div>
      </header>

      {/* Trust summary: discovery is open, citation is gated by human approval */}
      <section className="registry-panel" aria-labelledby="trust-summary">
        <h2 id="trust-summary">{el.trustSummary}</h2>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 4 }}>
          <span className={summary.citable_documents > 0 ? "badge badge-verified" : "badge badge-review"}>
            {el.citableDocuments}: {summary.citable_documents}/{summary.total_documents}
          </span>
          <span className="badge">
            {el.verifiedClaims}: {summary.verified_claims}/{summary.total_claims}
          </span>
          {summary.citable_documents > 0 && (
            <span className={summary.freshness === "stale" ? "badge badge-review" : "badge badge-verified"}>
              {el.freshness}: {summary.freshness}
            </span>
          )}
        </div>
      </section>

      {/* Every document about this entity, citable ones first */}
      <section className="registry-panel" aria-labelledby="entity-documents">
        <h2 id="entity-documents">{el.documents} ({summary.total_documents})</h2>
      </section>
      {documents.map((bundle) => {
        const status = getDocumentCitationStatus(bundle);
        return (
          <section key={bundle.document.id} className="registry-panel">
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
              <h3 style={{ margin: 0 }}>
                <Link href={`/${locale}/wiki/${bundle.document.slug}`}>{bundle.document.title}</Link>
              </h3>
              <span className={status.isVerifiedDocument ? "badge badge-verified" : "badge badge-review"}>
                {status.isVerifiedDocument ? t.claims.canCite : status.label}
              </span>
            </div>
            <ClaimTable claims={bundle.claims} locale={locale} />
          </section>
        );
      })}

      {/* Machine-readable */}
      <nav className="registry-panel" aria-labelledby="entity-machine">
        <h2 id="entity-machine">{el.machineReadable}</h2>
        <ul className="link-list">
          <li><Link href={`/api/entities/${encodeURIComponent(entity.id)}`}>JSON API ({apiEntityUrl(entity.id)})</Link></li>
        </ul>
      </nav>

      {/* Language switcher */}
      <nav className="registry-panel" aria-labelledby="entity-lang">
        <h2 id="entity-lang">{t.wiki.otherLanguages}</h2>
        <ul className="link-list" style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
          {SUPPORTED_LOCALES.filter((l) => l !== locale).map((l) => (
            <li key={l}><Link href={`/${l}/entity/${encodeURIComponent(entity.id)}`}>{l.toUpperCase()}</Link></li>
          ))}
        </ul>
      </nav>
    </article>
  );
}
