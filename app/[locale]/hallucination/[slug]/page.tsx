import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { getRegistryBundleBySlug } from "../../../../lib/data";
import { getRegistryBundleFromSupabase } from "../../../../lib/supabase-documents";
import { createHallucinationReportStub } from "../../../../lib/submission-stubs";
import { HALLUCINATION_FIELD_MAX_LENGTHS } from "../../../../lib/submission-limits";
import { getTranslations } from "../../../../lib/i18n/translations";
import { isValidLocale } from "../../../../lib/i18n/locales";

export const metadata: Metadata = {
  title: "AI 오답 신고",
  description: "AI 서비스가 문서와 다른 답을 생성한 경우 신고합니다.",
};

export default async function HallucinationPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string; slug: string }>;
  searchParams: Promise<{ submitted?: string }>;
}) {
  const { locale: localeParam, slug } = await params;
  if (!isValidLocale(localeParam)) {
    notFound();
  }
  const locale = localeParam;
  const { submitted } = await searchParams;
  const t = getTranslations(locale);
  const bundle = getRegistryBundleBySlug(slug) ?? await getRegistryBundleFromSupabase(slug);

  if (!bundle) {
    return (
      <section className="registry-panel">
        <p className="eyebrow">AI hallucination report</p>
        <h1>Document not found</h1>
        <p>{t.actionForms.documentNotFound}</p>
      </section>
    );
  }

  const { entity, document } = bundle;

  async function submitHallucinationReport(formData: FormData) {
    "use server";

    createHallucinationReportStub({
      document_id: document.id,
      entity_id: entity.id,
      ai_service: String(formData.get("ai_service") ?? "unknown").trim() || "unknown",
      prompt: String(formData.get("prompt") ?? "").trim() || null,
      ai_answer: String(formData.get("ai_answer") ?? "").trim() || null,
      expected_correction: String(formData.get("expected_correction") ?? "").trim() || null,
    });

    redirect(`/${locale}/hallucination/${document.slug}?submitted=1`);
  }

  return (
    <article>
      <header className="registry-panel">
        <p className="eyebrow">AI hallucination report</p>
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
          <p>{t.actionForms.hallucinationSubmittedBody}</p>
        </section>
      ) : null}

      <section className="registry-panel" aria-labelledby="hallucination-form-title">
        <h2 id="hallucination-form-title">{t.actionForms.hallucinationFormTitle}</h2>
        <p>{t.actionForms.hallucinationFormDescription}</p>
        <form action={submitHallucinationReport} className="registry-form">
          <label>
            {t.actionForms.aiService}
            <input name="ai_service" required maxLength={HALLUCINATION_FIELD_MAX_LENGTHS.ai_service} placeholder={t.actionForms.aiServicePlaceholder} />
          </label>
          <label>
            {t.actionForms.prompt}
            <textarea name="prompt" maxLength={HALLUCINATION_FIELD_MAX_LENGTHS.prompt} placeholder={t.actionForms.promptPlaceholder} />
          </label>
          <label>
            {t.actionForms.aiAnswer}
            <textarea name="ai_answer" maxLength={HALLUCINATION_FIELD_MAX_LENGTHS.ai_answer} placeholder={t.actionForms.aiAnswerPlaceholder} />
          </label>
          <label>
            {t.actionForms.expectedCorrection}
            <textarea name="expected_correction" maxLength={HALLUCINATION_FIELD_MAX_LENGTHS.expected_correction} placeholder={t.actionForms.expectedCorrectionPlaceholder} />
          </label>
          <input type="hidden" name="contributor_hash" value="local-stub-contributor-hash" />
          <button type="submit">{t.actionForms.submitHallucination}</button>
        </form>
      </section>

      <section className="notice-box" aria-labelledby="privacy-notice">
        <h2 id="privacy-notice">{t.actionForms.privacyTitle}</h2>
        <p>{t.actionForms.hallucinationPrivacyBody}</p>
      </section>
    </article>
  );
}
