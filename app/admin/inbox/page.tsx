"use client";

import Link from "next/link";
import { useCallback, useMemo, useState } from "react";

type SourceRow = { id: string; title?: string | null; url?: string | null; citation?: string | null };
type ClaimRow = { id: string; document_id: string; field_path?: string; claim_text: string; claim_value: string; status: string; confidence: string; last_verified_at?: string | null; claim_sources?: SourceRow[] };
type ReportRow = {
  id: string;
  document_id: string | null;
  entity_id: string | null;
  ai_service: string;
  prompt?: string | null;
  ai_answer?: string | null;
  expected_correction?: string | null;
  claim_id?: string | null;
  wrong_answer_type?: string | null;
  correction_prompt?: string | null;
  moderation_note?: string | null;
  status: string;
  created_at: string;
  documents?: { id: string; slug: string; title: string; lang: string; country: string; category: string } | null;
  claims?: ClaimRow | null;
};

type InboxPayload = { reports: ReportRow[]; claims: ClaimRow[] };

type Draft = { claim_id: string; claim_text: string; claim_value: string; field_path: string; correction_prompt: string; moderation_note: string };

const EMPTY_DRAFT: Draft = { claim_id: "", claim_text: "", claim_value: "확인 필요", field_path: "", correction_prompt: "", moderation_note: "" };

export default function AdminInboxPage() {
  const [secret, setSecret] = useState("");
  const [status, setStatus] = useState("new");
  const [data, setData] = useState<InboxPayload>({ reports: [], claims: [] });
  const [drafts, setDrafts] = useState<Record<string, Draft>>({});
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const claimsByDocument = useMemo(() => {
    const map = new Map<string, ClaimRow[]>();
    for (const claim of data.claims) map.set(claim.document_id, [...(map.get(claim.document_id) ?? []), claim]);
    return map;
  }, [data.claims]);

  const load = useCallback(async () => {
    setLoading(true);
    setMessage(null);
    const res = await fetch(`/api/admin/hallucination-inbox?status=${encodeURIComponent(status)}`, { headers: { "x-admin-secret": secret } });
    const payload = await res.json();
    setLoading(false);
    if (!res.ok) {
      setMessage(payload.error ?? "Failed to load inbox");
      return;
    }
    setData(payload);
    setMessage(`Loaded ${payload.reports.length} hallucination reports.`);
  }, [secret, status]);

  function draftFor(report: ReportRow): Draft {
    return drafts[report.id] ?? {
      ...EMPTY_DRAFT,
      claim_id: report.claim_id ?? "",
      claim_text: report.expected_correction ?? "",
      correction_prompt: report.correction_prompt ?? report.expected_correction ?? "",
      moderation_note: report.moderation_note ?? "",
    };
  }

  function updateDraft(reportId: string, patch: Partial<Draft>) {
    setDrafts((current) => ({ ...current, [reportId]: { ...(current[reportId] ?? EMPTY_DRAFT), ...patch } }));
  }

  async function review(report: ReportRow, action: "link_claim" | "create_claim" | "reject") {
    const draft = draftFor(report);
    setMessage(null);
    const res = await fetch("/api/admin/hallucination-inbox", {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-admin-secret": secret, "x-admin-csrf": "admin-inbox" },
      body: JSON.stringify({ action, report_id: report.id, ...draft }),
    });
    const payload = await res.json();
    if (!res.ok) {
      setMessage(payload.error ?? "Review action failed");
      return;
    }
    setMessage(`${action} complete for report ${report.id}`);
    await load();
  }

  return (
    <div style={{ maxWidth: 1120, margin: "0 auto", padding: "40px 20px" }}>
      <nav style={{ marginBottom: 24, fontSize: 13 }}><Link href="/admin/review">← Admin review</Link></nav>
      <header className="registry-panel">
        <p className="eyebrow">Admin inbox</p>
        <h1>Hallucination reports → claim review</h1>
        <p>운영자가 AI 오답 제보를 기존 claim에 연결하거나 새 needs_review claim으로 전환한 뒤 accepted 상태로 공개 correction 페이지에 반영합니다.</p>
        <div style={{ display: "grid", gridTemplateColumns: "1fr auto auto", gap: 8 }}>
          <input aria-label="Admin secret" type="password" value={secret} onChange={(event) => setSecret(event.target.value)} placeholder="ADMIN_SECRET" style={{ padding: 10 }} />
          <select aria-label="Report status" value={status} onChange={(event) => setStatus(event.target.value)} style={{ padding: 10 }}>
            {['new', 'accepted', 'rejected', 'spam', 'all'].map((item) => <option key={item} value={item}>{item}</option>)}
          </select>
          <button onClick={load} disabled={loading}>{loading ? "Loading..." : "Load inbox"}</button>
        </div>
        {message && <p>{message}</p>}
      </header>

      {data.reports.map((report) => {
        const draft = draftFor(report);
        const documentClaims = report.document_id ? claimsByDocument.get(report.document_id) ?? [] : [];
        const acceptedUrl = report.documents ? `/${report.documents.lang}/ai-wrong-about/${report.documents.slug}` : null;
        return (
          <section className="registry-panel" key={report.id} aria-labelledby={`report-${report.id}`}>
            <p className="eyebrow">{report.status} · {report.ai_service} · {new Date(report.created_at).toLocaleString()}</p>
            <h2 id={`report-${report.id}`}>{report.documents?.title ?? report.document_id ?? "Unlinked report"}</h2>
            <div className="meta-grid">
              <div><span className="meta-label">prompt</span><br />{report.prompt ?? "—"}</div>
              <div><span className="meta-label">AI answer</span><br />{report.ai_answer ?? "—"}</div>
              <div><span className="meta-label">expected correction</span><br />{report.expected_correction ?? "—"}</div>
            </div>

            <h3>1. 기존 claim에 연결</h3>
            <select aria-label="Existing claim" value={draft.claim_id} onChange={(event) => updateDraft(report.id, { claim_id: event.target.value })} style={{ width: "100%", padding: 10 }}>
              <option value="">Select a claim</option>
              {documentClaims.map((claim) => <option key={claim.id} value={claim.id}>{claim.status} · {claim.claim_text} = {claim.claim_value}</option>)}
            </select>

            <h3>2. 또는 새 claim 만들기</h3>
            <div style={{ display: "grid", gap: 8 }}>
              <input value={draft.field_path} onChange={(event) => updateDraft(report.id, { field_path: event.target.value })} placeholder="field_path (optional)" style={{ padding: 10 }} />
              <textarea value={draft.claim_text} onChange={(event) => updateDraft(report.id, { claim_text: event.target.value })} placeholder="claim_text" rows={2} style={{ padding: 10 }} />
              <input value={draft.claim_value} onChange={(event) => updateDraft(report.id, { claim_value: event.target.value })} placeholder="claim_value (use 확인 필요 until verified)" style={{ padding: 10 }} />
              <textarea value={draft.correction_prompt} onChange={(event) => updateDraft(report.id, { correction_prompt: event.target.value })} placeholder="correction prompt shown after acceptance" rows={2} style={{ padding: 10 }} />
              <textarea value={draft.moderation_note} onChange={(event) => updateDraft(report.id, { moderation_note: event.target.value })} placeholder="moderation note" rows={2} style={{ padding: 10 }} />
            </div>

            <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 16 }}>
              <button type="button" onClick={() => review(report, "link_claim")} disabled={!draft.claim_id}>Accept + link existing claim</button>
              <button type="button" onClick={() => review(report, "create_claim")}>Accept + create needs_review claim</button>
              <button type="button" onClick={() => review(report, "reject")}>Reject report</button>
              {acceptedUrl && <Link href={acceptedUrl}>Open AI wrong-answer page</Link>}
            </div>
          </section>
        );
      })}
    </div>
  );
}
