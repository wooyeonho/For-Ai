import { redirect } from "next/navigation";
import { createDocumentDraftStub, generatePlaceholderClaimsStub } from "../../../lib/admin-stubs";
import { seedEntity } from "../../../lib/seed-data";

export default async function NewDocumentPage({ searchParams }: { searchParams: Promise<{ submitted?: string }> }) {
  const { submitted } = await searchParams;

  async function submitDocument(formData: FormData) {
    "use server";

    const documentId = String(formData.get("id") ?? "").trim();
    const entityId = String(formData.get("entity_id") ?? seedEntity.id).trim() || seedEntity.id;
    const fieldPaths = String(formData.get("field_paths") ?? "")
      .split("\n")
      .map((value) => value.trim())
      .filter(Boolean);

    createDocumentDraftStub({
      id: documentId,
      entity_id: entityId,
      slug: String(formData.get("slug") ?? "").trim(),
      lang: String(formData.get("lang") ?? "ko").trim() || "ko",
      title: String(formData.get("title") ?? "").trim(),
      category: String(formData.get("category") ?? "weddinghall").trim() || "weddinghall",
      template: String(formData.get("template") ?? "parking").trim() || "parking",
    });
    generatePlaceholderClaimsStub({ document_id: documentId, entity_id: entityId, field_paths: fieldPaths });

    redirect("/admin/new-document?submitted=1");
  }

  return (
    <article>
      <header className="registry-panel">
        <p className="eyebrow">Goal 9 · Admin content creation</p>
        <h1>Create new document draft</h1>
        <p>Core facts are generated as placeholder claims with “확인 필요”, low confidence, and needs_review status.</p>
      </header>

      {submitted === "1" ? (
        <section className="notice-box success-box" aria-live="polite">
          <h2>Draft accepted</h2>
          <p>Document and placeholder claim drafts were accepted by the local stub. No database write occurred.</p>
        </section>
      ) : null}

      <section className="registry-panel" aria-labelledby="document-form-title">
        <h2 id="document-form-title">Document fields</h2>
        <form action={submitDocument} className="registry-form">
          <label>Document ID<input name="id" required placeholder="doc-kr-example-parking-ko" /></label>
          <label>Entity ID<input name="entity_id" required defaultValue={seedEntity.id} /></label>
          <label>Slug<input name="slug" required placeholder="english-stable-slug" /></label>
          <label>Language<input name="lang" required defaultValue="ko" /></label>
          <label>Title<input name="title" required placeholder="문서 제목" /></label>
          <label>Category<input name="category" required defaultValue="weddinghall" /></label>
          <label>Template<input name="template" required defaultValue="parking" /></label>
          <label>Placeholder claim field paths<textarea name="field_paths" defaultValue={"parking.availability\nparking.free_parking_minutes\nparking.congestion"} /></label>
          <button type="submit">Create document draft</button>
        </form>
      </section>
    </article>
  );
}
