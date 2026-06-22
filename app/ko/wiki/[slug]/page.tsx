import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@supabase/supabase-js";
import { getRegistryBundleBySlug, getAllRegistryBundles } from "../../../../lib/data";
import type { RegistryDocumentBundle } from "../../../../lib/types";

export const revalidate = 60;

export async function generateStaticParams() {
  return getAllRegistryBundles().map((b) => ({ slug: b.document.slug }));
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
  const entity = doc.registry_entities as { id:string;canonical_name:string;entity_type:string;lang:string };
  const claims = ((doc.registry_claims ?? []) as { id:string;field_path:string;claim_value:string;claim_text:string;confidence:string;status:string;last_verified_at:string|null }[])
    .map(cl => ({
      id: cl.id, entity_id: entity.id, document_slug: slug,
      field_path: cl.field_path, claim_value: cl.claim_value,
      claim_text: cl.claim_text ?? "",
      confidence: cl.confidence as "low"|"medium"|"high",
      status: cl.status as "needs_review"|"verified"|"disputed"|"outdated",
      sources: [], last_verified_at: cl.last_verified_at ?? null,
    }));
  return {
    entity: { id: entity.id, canonical_name: entity.canonical_name, entity_type: entity.entity_type ?? "concept", lang: entity.lang ?? "ko", aliases: [] },
    document: { slug: doc.slug, entity_id: entity.id, title: doc.title, template: doc.template ?? "fact-sheet", lang: doc.lang ?? "ko", status: doc.status, confidence: doc.confidence as "low"|"medium"|"high", license_code: doc.license_code ?? "CC-BY-4.0", data: doc.data ?? {} },
    claims,
  };
}

export default async function WikiDocumentPage({ params }: { params: Promise<{ slug: string }> }) {
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

  return (
    <article>
      <header className="registry-panel">
        <p className="eyebrow">{isPromoted ? "GYEOL · AI 생성 후 검토됨" : "Claim registry document"}</p>
        <h1>{document.title}</h1>
        <div className="meta-grid">
          <div><span className="meta-label">entity_id</span><br />{entity.id}</div>
          <div><span className="meta-label">slug</span><br />{document.slug}</div>
          <div><span className="meta-label">status</span><br /><span className="badge badge-review">{document.status}</span></div>
          <div><span className="meta-label">confidence</span><br /><span className="badge badge-low">{document.confidence}</span></div>
        </div>
      </header>

      {whyPeopleAsk && (
        <section className="registry-panel" style={{background:"#fffbeb",borderLeft:"3px solid #f59e0b"}}>
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
        {claims.length === 0 ? <p style={{color:"#9ca3af"}}>등록된 claim이 없습니다.</p>
        : claims.map((claim) => (
          <div className="claim-card" key={claim.field_path}>
            <p className="eyebrow">{claim.field_path}</p>
            <p><strong>{claim.claim_value}</strong></p>
            {claim.claim_text && <p>{claim.claim_text}</p>}
            <p>
              <span className="badge badge-low">confidence: {claim.confidence}</span>{" "}
              <span className="badge badge-review">state: {claim.status}</span>{" "}
              <span className="badge">sources: {claim.sources.length}</span>
            </p>
            {claim.last_verified_at && <p className="meta-label">last_verified_at: {claim.last_verified_at}</p>}
          </div>
        ))}
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
