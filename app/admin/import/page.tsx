import { redirect } from "next/navigation";
import { createBulkImportStub } from "../../../lib/admin-stubs";

export default async function AdminImportPage({ searchParams }: { searchParams: Promise<{ submitted?: string }> }) {
  const { submitted } = await searchParams;

  async function submitImport(formData: FormData) {
    "use server";

    const rows = String(formData.get("rows") ?? "")
      .split("\n")
      .map((row) => row.trim())
      .filter(Boolean).length;

    createBulkImportStub(rows);
    redirect("/admin/import?submitted=1");
  }

  return (
    <article>
      <header className="registry-panel">
        <p className="eyebrow">Goal 9 · Bulk import</p>
        <h1>Bulk import stub</h1>
        <p>Paste rows for future entity/document drafting. This MVP does not persist imported data.</p>
      </header>

      {submitted === "1" ? (
        <section className="notice-box success-box" aria-live="polite">
          <h2>Import accepted</h2>
          <p>Rows were accepted by the local import stub. Review and persistence are intentionally out of scope here.</p>
        </section>
      ) : null}

      <section className="registry-panel" aria-labelledby="import-form-title">
        <h2 id="import-form-title">Import rows</h2>
        <form action={submitImport} className="registry-form">
          <label>Rows<textarea name="rows" required placeholder="entity_id,title,slug,template" /></label>
          <button type="submit">Validate import stub</button>
        </form>
      </section>
    </article>
  );
}
