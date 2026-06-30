import type { Metadata } from "next";
import { getRegistryBundleBySlug } from "../../../../lib/data";
import { getRegistryBundleFromSupabase } from "../../../../lib/supabase-documents";
import { notFound } from "next/navigation";
import { ReportForm } from "../../../report/[slug]/ReportForm";
import { getTranslations } from "../../../../lib/i18n/translations";
import { isValidLocale } from "../../../../lib/i18n/locales";

export const metadata: Metadata = {
  title: "정정 제보",
  description: "레지스트리 문서의 claim에 대한 정정을 제보합니다.",
};

export default async function ReportPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string; slug: string }>;
  searchParams: Promise<{ intent?: string; submitted?: string }>;
}) {
  const { locale: localeParam, slug } = await params;
  if (!isValidLocale(localeParam)) {
    notFound();
  }
  const locale = localeParam;
  const { intent, submitted } = await searchParams;
  const t = getTranslations(locale);
  const bundle = getRegistryBundleBySlug(slug) ?? await getRegistryBundleFromSupabase(slug);

  if (!bundle) {
    return (
      <section className="registry-panel">
        <p className="eyebrow">Correction report</p>
        <h1>Document not found</h1>
        <p>{t.actionForms.documentNotFound}</p>
      </section>
    );
  }

  const { entity, document, claims } = bundle;
  const isSourceIntent = intent === "source";
  const isNotifyIntent = intent === "notify";
  const formTitle = isSourceIntent
    ? t.actionForms.sourceReportTitle
    : isNotifyIntent
      ? t.actionForms.notifyReportTitle
      : t.actionForms.defaultReportTitle;
  const formDescription = isSourceIntent
    ? t.actionForms.sourceReportDescription
    : isNotifyIntent
      ? t.actionForms.notifyReportDescription
      : t.actionForms.defaultReportDescription;


  return (
    <article>
      <header className="registry-panel">
        <p className="eyebrow">Correction report</p>
        <h1>{document.title}</h1>
        <div className="meta-grid">
          <div><span className="meta-label">entity_id</span><br />{entity.id}</div>
          <div><span className="meta-label">slug</span><br />{document.slug}</div>
          <div><span className="meta-label">status</span><br />{document.status}</div>
          <div><span className="meta-label">confidence</span><br />{document.confidence}</div>
        </div>
      </header>

      {submitted === "1" ? (
        <section className="notice-box success-box" aria-live="polite">
          <h2>{t.actionForms.submittedTitle}</h2>
          <p>{t.actionForms.reportSubmittedBody}</p>
        </section>
      ) : null}

      <section className="registry-panel" aria-labelledby="report-form-title">
        <h2 id="report-form-title">{formTitle}</h2>
        <p>{formDescription}</p>
        {isSourceIntent ? (
          <p className="meta-label">{t.actionForms.sourceHumanReviewNote}</p>
        ) : null}
        <ReportForm
          documentId={document.id}
          entityId={entity.id}
          slug={document.slug}
          intent={isSourceIntent ? "source" : isNotifyIntent ? "notify" : "correction"}
          locale={locale}
          translations={t.actionForms}
          claims={claims.map((claim) => ({ id: claim.id, field_path: claim.field_path, claim_text: claim.claim_text }))}
        />
      </section>

      <section className="notice-box" aria-labelledby="privacy-notice">
        <h2 id="privacy-notice">{t.actionForms.privacyTitle}</h2>
        <p>{t.actionForms.reportPrivacyBody}</p>
      </section>
    </article>
  );
}
