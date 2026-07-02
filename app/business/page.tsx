import Link from "next/link";

export default async function BusinessWaitlistPage({
  searchParams,
}: {
  searchParams: Promise<{ entity_id?: string; slug?: string; lang?: string; submitted?: string }>;
}) {
  const params = await searchParams;
  const entityId = params.entity_id ?? "";
  const slug = params.slug ?? "";
  const lang = params.lang ?? "en";

  return (
    <main style={{ maxWidth: 920, margin: "0 auto", padding: "32px 20px" }}>
      <nav style={{ marginBottom: 16 }}>
        {slug ? <Link href={`/${lang}/wiki/${slug}`}>← Back to public fact page</Link> : <Link href="/">← For-Ai</Link>}
      </nav>
      {params.submitted === "1" && (
        <section className="registry-panel" role="status" style={{ background: "#ecfdf5", border: "1px solid #86efac" }}>
          <strong>Request received.</strong> We captured your waitlist/contact request for pre-payment demand validation.
        </section>
      )}

      <section className="registry-panel">
        <p className="eyebrow">Verified business profile waitlist</p>
        <h1>Claim this entity / Correct AI-visible facts</h1>
        <p>
          Use this pre-payment contact capture to tell For-Ai you want a verified business profile, correction tools,
          and monitoring for AI answer risk. This does not verify facts automatically.
        </p>
        <ul className="link-list">
          <li><strong>Verified business profile</strong>: ownership/contact workflow and risk dashboard.</li>
          <li><strong>Correction tools</strong>: business-submitted source-backed proposals queued for independent review.</li>
          <li><strong>Sponsored placement</strong>: optional promotional placement, clearly labeled and separate from verification.</li>
        </ul>
      </section>

      <form className="registry-panel" action="/api/business/profile" method="post">
        <input type="hidden" name="intent" value="waitlist" />
        <label style={{ display: "grid", gap: 6, marginBottom: 12 }}>
          Entity ID
          <input name="entity_id" defaultValue={entityId} required style={{ padding: 10, border: "1px solid #d1d5db", borderRadius: 8 }} />
        </label>
        <label style={{ display: "grid", gap: 6, marginBottom: 12 }}>
          Business name
          <input name="business_name" required style={{ padding: 10, border: "1px solid #d1d5db", borderRadius: 8 }} />
        </label>
        <label style={{ display: "grid", gap: 6, marginBottom: 12 }}>
          Business email
          <input name="business_email" type="email" required style={{ padding: 10, border: "1px solid #d1d5db", borderRadius: 8 }} />
        </label>
        <label style={{ display: "grid", gap: 6, marginBottom: 12 }}>
          Country
          <input name="country" required placeholder="US, KR, GLOBAL..." style={{ padding: 10, border: "1px solid #d1d5db", borderRadius: 8 }} />
        </label>
        <label style={{ display: "grid", gap: 6, marginBottom: 12 }}>
          What do you need most?
          <select name="requested_plan" defaultValue="profile_and_corrections" style={{ padding: 10, border: "1px solid #d1d5db", borderRadius: 8 }}>
            <option value="profile_and_corrections">Verified profile + correction tools</option>
            <option value="risk_monitoring">AI answer risk monitoring</option>
            <option value="sponsored_only">Sponsored placement only</option>
            <option value="enterprise">Enterprise/API/data licensing</option>
          </select>
        </label>
        <label style={{ display: "grid", gap: 6, marginBottom: 12 }}>
          Current AI-visible fact problem
          <textarea name="pain_point" rows={4} placeholder="Example: AI answers show outdated hours, wrong refund policy, stale pricing..." style={{ padding: 10, border: "1px solid #d1d5db", borderRadius: 8 }} />
        </label>
        <label style={{ display: "flex", gap: 8, alignItems: "flex-start", marginBottom: 16 }}>
          <input name="contact_email_consent" type="checkbox" value="true" required />
          <span>I consent to For-Ai storing this contact email for business profile verification and waitlist follow-up.</span>
        </label>
        <input type="hidden" name="contact_email_purpose" value="business_profile_verification_waitlist" />
        <p style={{ color: "#92400e", fontWeight: 700 }}>
          Paid status, ownership, and sponsorship never change claim verification or citation readiness.
        </p>
        <button className="button" type="submit">Join waitlist / request contact</button>
      </form>
    </main>
  );
}
