import { redirect } from "next/navigation";
import { getRegistryBundleBySlug } from "../../../lib/data";
import { createReportSubmissionStub } from "../../../lib/submission-stubs";

export default async function ReportPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ submitted?: string }>;
}) {
  const { slug } = await params;
  const { submitted } = await searchParams;
  const bundle = getRegistryBundleBySlug(slug);

  if (!bundle) {
    return (
      <section className="registry-panel">
        <p className="eyebrow">Correction report</p>
        <h1>Document not found</h1>
        <p>ìì²­í ë¬¸ìë¥¼ ì°¾ì ì ììµëë¤.</p>
      </section>
    );
  }

  const { entity, document, claims } = bundle;

  async function submitReport(formData: FormData) {
    "use server";

    const fieldPath = String(formData.get("field_path") ?? "").trim() || null;
    const message = String(formData.get("message") ?? "").trim();

    createReportSubmissionStub({
      document_id: document.id,
      entity_id: entity.id,
      field_path: fieldPath,
      message,
    });

    redirect(`/report/${document.slug}?submitted=1`);
  }

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
          <h2>ì ì¶ëììµëë¤</h2>
          <p>ì ì  ìì²­ì´ ì ì ëê¸° ìíë¡ ì²ë¦¬ëììµëë¤. íì¬ MVPììë ì ì¥ìì ê¸°ë¡íì§ ìë ìì í stub ìëµìëë¤.</p>
        </section>
      ) : null}

      <section className="registry-panel" aria-labelledby="report-form-title">
        <h2 id="report-form-title">ì ì  ìì²­</h2>
        <p>íì¸ì´ íìí claimì ëí´ ì ì  ìì²­ì ë¨ê²¨ì£¼ì¸ì. ë¡ê·¸ì¸ì íìíì§ ììµëë¤.</p>
        <form action={submitReport} className="registry-form">
          <label>
            Field path ì í ëë ìë ¥
            <select name="field_path" defaultValue="">
              <option value="">ì ì²´ ë¬¸ì ëë ì§ì  ì¤ëª</option>
              {claims.map((claim) => (
                <option value={claim.field_path} key={claim.id}>{claim.field_path}</option>
              ))}
            </select>
          </label>
          <label>
            ì ì  ìì²­ ë´ì©
            <textarea name="message" required minLength={5} placeholder="ì´ë¤ claimì´ ì ìì ëì´ì¼ íëì§ ì ì´ì£¼ì¸ì." />
          </label>
          <input type="hidden" name="contributor_hash" value="local-stub-contributor-hash" />
          <button type="submit">ì ì  ìì²­ ì ì¶</button>
        </form>
      </section>

      <section className="notice-box" aria-labelledby="privacy-notice">
        <h2 id="privacy-notice">Privacy notice</h2>
        <p>Raw IP addresses are never stored. This MVP uses contributor_hash only and does not expose public read access to reports.</p>
      </section>
    </article>
  );
}
