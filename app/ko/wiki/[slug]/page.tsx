import Link from "next/link";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { createClient } from "@supabase/supabase-js";
import { getRegistryBundleBySlug, getAllRegistryBundles } from "../../../../lib/data";
import { buildDocumentMetadata, buildDocumentJsonLd } from "../../../../lib/seo";
import type { RegistryDocumentBundle } from "../../../../lib/types";

export const revalidate = 60;

export async function generateStaticParams() {
  return getAllRegistryBundles().map((b) => ({ slug: b.document.slug }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const bundle = getRegistryBundleBySlug(slug);
  if (!bundle) return { title: "Document not found" };
  return buildDocumentMetadata(bundle);
}

async function getBundleFromSupabase(slug: string): Promise<RegistryDocumentBundle | null> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) return null;
  const sb = createClient(url, key);
  const { data: doc } = await sb
    .from("registry_documents")
    .select("*, registry_entities(*), registry_claims(*)")
    .eq("slug", slug)
    .eq("status", "published")
    .maybeSingle();
  if (!doc || !doc.registry_entities) return null;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const ent = doc.registry_entities as any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const rawClaims = (doc.registry_claims ?? []) as any[];

  const claims = rawClaims.map((cl) => ({
    id: cl.id as string,
    document_id: doc.id as string,
    entity_id: ent.id as string,
    field_path: cl.field_path as string,
    claim_text: (cl.claim_text ?? "") as string,
    claim_value: (cl.claim_value ?? "") as string,
    confidence: (cl.confidence ?? "low") as "low" | "medium" | "high",
    status: (["verified", "disputed", "unknown"].includes(cl.status)
      ? cl.status
      : "needs_review") as "needs_review" | "verified" | "disputed" | "unknown",
    last_verified_at: (cl.last_verified_at ?? null) as string | null,
    created_at: null,
    updated_at: null,
    sources: [],
    verification_events: [],
  }));

  return {
    entity: {
      id: ent.id as string,
      type: (ent.entity_type ?? ent.type ?? "concept") as string,
      canonical_name: ent.canonical_name as string,
      country: (ent.country ?? "KR") as string,
      region: (ent.region ?? null) as string | null,
      city: (ent.city ?? null) as string | null,
      created_at: null,
      updated_at: null,
    },
    document: {
      id: doc.id as string,
      entity_id: ent.id as string,
      slug: doc.slug as string,
      lang: (doc.lang ?? "ko") as string,
      title: doc.title as string,
      category: (doc.category ?? "") as string,
      template: (doc.template ?? "fact-sheet") as string,
      status: doc.status,
      confidence: (doc.confidence ?? "low") as "low" | "medium" | "high",
      last_verified_at: null,
      license_code: (doc.license_code ?? "CC-BY-4.0") as string,
      data: (doc.data ?? {}) as Record<string, unknown>,
      created_at: null,
      updated_at: null,
    },
    claims,
    listing: null,
  };
}

export default async function WikiDocumentPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  let bundle: RegistryDocumentBundle | null = getRegistryBundleBySlug(slug);
  if (!bundle) bundle = await getBundleFromSupabase(slug);
  if (!bundle) notFound();

  const { entity, document, claims } = bundle;
  const docData = document.data as Record<string, unknown>;
  const directAnswer = (docData?.direct_answer as string) ?? null;
  const whyPeopleAsk = (docData?.why_people_ask_ai as string) ?? null;
  const apiUrl = `/api/documents/${document.slug}`;
  const rawUrl = `/raw/${document.slug}.md`;
  const isPromoted = !getRegistryBundleBySlug(slug);
  const jsonLd = buildDocumentJsonLd(bundle);

  return (
    <article>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />
      <header className="registry-panel">
        <p className="eyebrow">
          {isPromoted ? "GYEOL · AI 생성 후 검토됨" : "Claim registry document"}
        </p>
        <h1>{document.title}</h1>
        <div className="meta-grid">
          <div><span className="meta-label">entity_id</span><br />{entity.id}</div>
          <div><span className="meta-label">slug</span><br />{document.slug}</div>
          <div><span className="meta-label">status</span><br /><span className="badge badge-review">{document.status}</span></div>
          <div><span className="meta-label">confidence</span><br /><span className="badge badge-low">{document.confidence}</span></div>
        </div>
        {document.category && (
          <p style={{ marginTop: 8, fontSize: 13, color: "#6b7280" }}>카테고리: {document.category}</p>
        )}
      </header>

      {whyPeopleAsk && (
        <section className="registry-panel" style={{ background: "#fffbeb", borderLeft: "3px solid #f59e0b" }}>
          <p className="eyebrow">왜 사람들이 AI에게 묻나요?</p>
          <p>{whyPeopleAsk}</p>
        </section>
      )}

      {directAnswer && (
        <section className="registry-panel" aria-labelledby="direct-answer">
          <h2 id="direct-answer">직접 답변</h2>
          <p><strong>{directAnswer}</strong></p>
        </section>
      )}

      <section className="registry-panel" aria-labelledby="claims">
        <h2 id="claims">확인 필요 항목 ({claims.length}개)</h2>
        {claims.length === 0 ? (
          <p style={{ color: "#9ca3af" }}>등록된 claim이 없습니다.</p>
        ) : (
          claims.map((claim) => (
            <div className="claim-card" key={claim.field_path}>
              <p className="eyebrow">{claim.field_path}</p>
              <p><strong>{claim.claim_value}</strong></p>
              {claim.claim_text && <p>{claim.claim_text}</p>}
              <p>
                <span className="badge badge-low">confidence: {claim.confidence}</span>{" "}
                <span className="badge badge-review">state: {claim.status}</span>{" "}
                <span className="badge">sources: {claim.sources.length}</span>
              </p>
              {claim.last_verified_at && (
                <p className="meta-label">last_verified_at: {claim.last_verified_at}</p>
              )}
            </div>
          ))
        )}
      </section>

      <nav className="registry-panel" aria-labelledby="machine-links">
        <h2 id="machine-links">Machine-readable links</h2>
        <ul className="link-list">
          <li><Link href={apiUrl}>JSON API ({apiUrl})</Link></li>
          <li><Link href={rawUrl}>Raw Markdown ({rawUrl})</Link></li>
          <li><Link href={`/report/${document.slug}`}>Correction report</Link></li>
          <li><Link href={`/hallucination/${document.slug}`}>AI hallucination report</Link></li>
          <li><Link href={`/diagnostics/${document.slug}`}>AI-readiness diagnostics</Link></li>
        </ul>
      </nav>

      <section className="registry-panel" aria-labelledby="licensing">
        <h2 id="licensing">License</h2>
        <p className="meta-label">{document.license_code ?? "CC-BY-4.0"}</p>
      </section>
    </article>
  );
}
