"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { AdminSecretField, useAdminSecret } from "../AdminSecretProvider";

type Row = Record<string, unknown> & { id: string; status?: string; entity_id?: string; created_at?: string };
type Section = { key: string; title: string; endpoint: string; rowsKey: string; idKey: string; actions: Record<string, Record<string, unknown>>; warning?: string };

const sections: Section[] = [
  { key: "profiles", title: "Pending business profiles", endpoint: "/api/business/profile?status=pending", rowsKey: "profiles", idKey: "profile_id", actions: { approve: { status: "verified" }, reject: { status: "rejected" }, label: { tier: "pro", status: "verified" }, disable: { status: "suspended" } } },
  { key: "corrections", title: "Business corrections", endpoint: "/api/business/corrections?status=new", rowsKey: "corrections", idKey: "correction_id", actions: { approve: { status: "accepted" }, reject: { status: "rejected" }, label: { status: "reviewing", reviewer_note: "Priority business correction; still requires source-backed human verification." }, disable: { status: "spam_suspected" } } },
  { key: "sponsored", title: "Sponsored placements", endpoint: "/api/business/sponsored?active=false", rowsKey: "placements", idKey: "placement_id", warning: "Sponsored content is promotional inventory only. Never merge it into verified facts, claims, citation surfaces, or claim-level verification events.", actions: { approve: { action: "approve", display_label: "Sponsored — not a verified factual claim" }, reject: { action: "reject" }, label: { action: "label", display_label: "Sponsored — not a verified factual claim" }, disable: { action: "disable" } } },
  { key: "claims", title: "Business-submitted claims", endpoint: "/api/business/submitted-claims?status=pending_verification", rowsKey: "claims", idKey: "claim_id", warning: "Business-submitted claims remain non-citation-ready. Approving here accepts the proposal for workflow tracking only; it does not create a verified fact.", actions: { approve: { action: "approve", reviewer_note: "Accepted as business-submitted proposal; canonical verification still required." }, reject: { action: "reject" }, label: { action: "label", reviewer_note: "Labeled as business-submitted; not a verified fact." }, disable: { action: "disable" } } },
];

function text(value: unknown) {
  if (value === null || value === undefined || value === "") return "—";
  if (typeof value === "object") return JSON.stringify(value);
  return String(value);
}

export default function AdminBusinessPage() {
  const { adminSecret, setAdminSecret, resetAdminSecret } = useAdminSecret();
  const [data, setData] = useState<Record<string, Row[]>>({});
  const [loading, setLoading] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  const load = useCallback(async () => {
    if (!adminSecret) return;
    setLoading(true);
    setMsg(null);
    try {
      const results = await Promise.all(sections.map(async (section) => {
        const res = await fetch(section.endpoint, { headers: { "x-admin-secret": adminSecret } });
        const json = await res.json();
        if (!res.ok) throw new Error(`${section.title}: ${json.error ?? res.statusText}`);
        return [section.key, json[section.rowsKey] ?? []] as const;
      }));
      setData(Object.fromEntries(results));
    } catch (error) {
      setMsg({ ok: false, text: error instanceof Error ? error.message : "Load failed" });
    } finally {
      setLoading(false);
    }
  }, [adminSecret]);

  useEffect(() => { void load(); }, [load]);

  async function act(section: Section, row: Row, action: string) {
    const body = { [section.idKey]: row.id, ...section.actions[action] };
    const res = await fetch(section.endpoint.split("?")[0], { method: "PATCH", headers: { "Content-Type": "application/json", "x-admin-secret": adminSecret, "x-admin-csrf": "1" }, body: JSON.stringify(body) });
    const json = await res.json();
    setMsg({ ok: res.ok, text: res.ok ? `${section.title}: ${action} complete` : json.error ?? "Action failed" });
    if (res.ok) await load();
  }

  return (
    <main style={{ maxWidth: 1180, margin: "0 auto", padding: 24, display: "grid", gap: 18 }}>
      <Link href="/admin">← Admin</Link>
      <h1>Business monetization operations</h1>
      <p style={{ color: "#4b5563" }}>Operate business profiles, correction requests, sponsored placements, and business-submitted claims without compromising claim-level verification.</p>
      <AdminSecretField adminSecret={adminSecret} setAdminSecret={setAdminSecret} resetAdminSecret={resetAdminSecret} />
      <button onClick={load} disabled={!adminSecret || loading} style={{ padding: 10, borderRadius: 8 }}>{loading ? "Loading…" : "Refresh queues"}</button>
      {msg && <div style={{ padding: 12, borderRadius: 10, background: msg.ok ? "#dcfce7" : "#fee2e2", color: msg.ok ? "#166534" : "#991b1b" }}>{msg.text}</div>}
      <div style={{ padding: 16, border: "2px solid #f97316", borderRadius: 14, background: "#fff7ed" }}>
        <strong>Sponsored-content firewall:</strong> sponsored placements are ads, not claims. They must stay visibly labeled and must never be rendered as verified facts or citation-ready records.
      </div>
      {sections.map((section) => (
        <section key={section.key} style={{ border: "1px solid #e5e7eb", borderRadius: 14, padding: 16, display: "grid", gap: 12 }}>
          <h2 style={{ margin: 0 }}>{section.title} ({data[section.key]?.length ?? 0})</h2>
          {section.warning && <p style={{ margin: 0, padding: 10, borderRadius: 10, background: "#fef3c7", color: "#92400e" }}>⚠️ {section.warning}</p>}
          {(data[section.key] ?? []).length === 0 ? <p style={{ color: "#6b7280" }}>No items.</p> : (data[section.key] ?? []).map((row) => (
            <article key={row.id} style={{ border: "1px solid #f3f4f6", borderRadius: 12, padding: 12, display: "grid", gap: 8 }}>
              <div><strong>{text(row.business_name ?? row.field_path ?? row.placement_type ?? row.id)}</strong> <code>{row.status ? text(row.status) : row.is_active ? "active" : "inactive"}</code></div>
              <div style={{ fontSize: 13, color: "#4b5563" }}>entity_id: {text(row.entity_id)} · created: {text(row.created_at)}</div>
              <pre style={{ whiteSpace: "pre-wrap", background: "#f9fafb", padding: 10, borderRadius: 8, maxHeight: 180, overflow: "auto" }}>{JSON.stringify(row, null, 2)}</pre>
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>{["approve", "reject", "label", "disable"].map((action) => <button key={action} onClick={() => void act(section, row, action)} style={{ padding: "8px 10px", borderRadius: 8 }}>{action}</button>)}</div>
            </article>
          ))}
        </section>
      ))}
    </main>
  );
}
