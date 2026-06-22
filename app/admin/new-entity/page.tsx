import { redirect } from "next/navigation";
import { createEntityDraftStub } from "../../../lib/admin-stubs";

export default async function NewEntityPage({ searchParams }: { searchParams: Promise<{ submitted?: string }> }) {
  const { submitted } = await searchParams;

  async function submitEntity(formData: FormData) {
    "use server";

    createEntityDraftStub({
      id: String(formData.get("id") ?? "").trim(),
      type: String(formData.get("type") ?? "").trim(),
      canonical_name: String(formData.get("canonical_name") ?? "").trim(),
      country: String(formData.get("country") ?? "KR").trim() || "KR",
      region: String(formData.get("region") ?? "").trim(),
      city: String(formData.get("city") ?? "").trim(),
    });

    redirect("/admin/new-entity?submitted=1");
  }

  return (
    <article>
      <header className="registry-panel">
        <p className="eyebrow">Goal 9 · Admin content creation</p>
        <h1>Create new entity draft</h1>
        <p>This MVP form creates a schema-shaped draft stub only. It does not write to a database.</p>
      </header>

      {submitted === "1" ? (
        <section className="notice-box success-box" aria-live="polite">
          <h2>Draft accepted</h2>
          <p>Entity draft was accepted by the local stub. Review is required before any future persistence.</p>
        </section>
      ) : null}

      <section className="registry-panel" aria-labelledby="entity-form-title">
        <h2 id="entity-form-title">Entity fields</h2>
        <form action={submitEntity} className="registry-form">
          <label>Entity ID<input name="id" required placeholder="kr-weddinghall-example-001" /></label>
          <label>Type<input name="type" required placeholder="weddinghall" /></label>
          <label>Canonical name<input name="canonical_name" required placeholder="확인 필요" /></label>
          <label>Country<input name="country" required defaultValue="KR" /></label>
          <label>Region<input name="region" placeholder="서울특별시" /></label>
          <label>City<input name="city" placeholder="중구" /></label>
          <button type="submit">Create entity draft</button>
        </form>
      </section>
    </article>
  );
}
