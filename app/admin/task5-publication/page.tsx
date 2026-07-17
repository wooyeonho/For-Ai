"use client";

import Link from "next/link";
import { createClient } from "@supabase/supabase-js";
import { useCallback, useMemo, useState } from "react";
import { readAdminCsrfToken } from "@/lib/admin-client";
import { AdminSecretField, useAdminSecret } from "../AdminSecretProvider";

type QueueItem = {
  claim: {
    id: string;
    document_slug: string;
    document_title: string;
    document_status: string;
    claim_text: string;
    claim_value: string;
    current_claim_version_id: string;
    publication_state: string;
  };
  version: { id: string; version: number; text: string; text_hash: string; created_at: string } | null;
  latest_risk: {
    deterministic_result: string;
    model_result: string;
    final_result: string;
    deterministic_policy_version: string;
    model_id?: string | null;
    prompt_version?: string | null;
  } | null;
  evidence: Array<{
    id: string;
    relation: string;
    quote: string | null;
    context: string | null;
    quote_hash_valid: boolean;
    context_hash_valid: boolean;
    source: {
      url: string;
      publisher: string;
      retrieved_at: string;
      http_status: number;
      content_type: string;
      text_available_for_revalidation: boolean;
    };
  }>;
  model_provenance: Array<{ stage: string; provider: string; model_id: string; prompt_version: string }>;
  duplicate_candidates: Array<{ id: string; document_slug: string; claim_text: string; claim_value: string; score: number }>;
  review_events: Array<{ id: string; action: string; reason: string; created_at: string }>;
  publish_ready: boolean;
};

type QueuePayload = {
  settings: { phase: number; draft_enabled: boolean; updated_at?: string | null };
  emergency_disabled: boolean;
  assisted_policy: { version: number; mode: string; rules: Record<string, unknown> } | null;
  gate: {
    minimum_observation_days: number;
    required_operator_samples: number;
    recorded_operator_samples: number;
    code_ready_only: boolean;
    phase_1_enabled: boolean;
    eligible_for_activation: boolean;
    reason: string;
  };
  items: QueueItem[];
};

const PANEL = { background: "#fff", border: "1px solid #e5e7eb", borderRadius: 16, padding: 20 };
const BUTTON_ROW = { display: "flex", gap: 8, flexWrap: "wrap" as const };

export default function Task5PublicationPage() {
  const { adminSecret, setAdminSecret, resetAdminSecret, loginAdmin, authMessage } = useAdminSecret();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [accessToken, setAccessToken] = useState<string | null>(null);
  const [payload, setPayload] = useState<QueuePayload | null>(null);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const [reasons, setReasons] = useState<Record<string, string>>({});
  const [edits, setEdits] = useState<Record<string, string>>({});
  const [duplicateReviewed, setDuplicateReviewed] = useState<Record<string, boolean>>({});

  const authClient = useMemo(() => {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    if (!url || !anonKey) return null;
    return createClient(url, anonKey, { auth: { persistSession: false, autoRefreshToken: false } });
  }, []);

  const authHeaders = useCallback((): Record<string, string> => accessToken
    ? { Authorization: `Bearer ${accessToken}` }
    : { "x-admin-csrf": readAdminCsrfToken() }, [accessToken]);

  const load = useCallback(async (token: string | null = accessToken) => {
    setLoading(true);
    setMessage(null);
    try {
      const response = await fetch("/api/admin/task5-publication", {
        headers: { "Cache-Control": "no-store", ...(token ? { Authorization: `Bearer ${token}` } : {}) },
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        setPayload(null);
        setMessage({ ok: false, text: data.error ?? "Publication queue load failed" });
        return;
      }
      setPayload(data);
      setEdits(Object.fromEntries((data.items ?? []).map((item: QueueItem) => [item.claim.id, item.version?.text ?? item.claim.claim_value])));
      setMessage({ ok: true, text: `${data.items?.length ?? 0} AI draft(s) loaded.` });
    } catch {
      setMessage({ ok: false, text: "Network error" });
    } finally {
      setLoading(false);
    }
  }, [accessToken]);

  const loginWithSupabase = useCallback(async () => {
    if (!authClient || !email.trim() || !password) {
      setMessage({ ok: false, text: "Supabase Auth email and password are required." });
      return;
    }
    setLoading(true);
    setMessage(null);
    try {
      const { data, error } = await authClient.auth.signInWithPassword({ email: email.trim(), password });
      const token = data.session?.access_token ?? null;
      if (error || !token) {
        setMessage({ ok: false, text: error?.message ?? "Supabase Auth login failed." });
        return;
      }
      setPassword("");
      setAccessToken(token);
      await load(token);
    } finally {
      setLoading(false);
    }
  }, [authClient, email, load, password]);

  const logout = useCallback(async () => {
    if (authClient) await authClient.auth.signOut();
    setAccessToken(null);
    setPayload(null);
    setMessage({ ok: true, text: "Signed out." });
  }, [authClient]);

  const loginAndLoad = useCallback(async () => {
    if (await loginAdmin()) await load();
  }, [loginAdmin, load]);

  const act = useCallback(async (item: QueueItem, action: "publish" | "reject" | "escalate" | "refetch" | "hold" | "edit") => {
    const reason = reasons[item.claim.id]?.trim() ?? "";
    if (reason.length < 3) {
      setMessage({ ok: false, text: "Enter a review reason of at least 3 characters." });
      return;
    }
    if (action === "publish" && !duplicateReviewed[item.claim.id]) {
      setMessage({ ok: false, text: "Review and acknowledge the duplicate-search results first." });
      return;
    }
    setLoading(true);
    setMessage(null);
    try {
      const response = await fetch("/api/admin/task5-publication", {
        method: "POST",
        headers: { "Content-Type": "application/json", ...authHeaders() },
        body: JSON.stringify({
          action,
          claim_id: item.claim.id,
          claim_version_id: item.claim.current_claim_version_id,
          verification_policy_version: payload?.assisted_policy?.version,
          duplicate_reviewed: duplicateReviewed[item.claim.id] === true,
          new_text: edits[item.claim.id],
          reason,
          idempotency_key: crypto.randomUUID(),
        }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        setMessage({ ok: false, text: data.detail ?? data.error ?? "Review action failed" });
        return;
      }
      setMessage({
        ok: true,
        text: action === "edit"
          ? "New immutable version created. New evidence and risk assessment are required before publication."
          : `${action} recorded.`,
      });
      await load();
    } catch {
      setMessage({ ok: false, text: "Network error" });
    } finally {
      setLoading(false);
    }
  }, [authHeaders, duplicateReviewed, edits, load, payload?.assisted_policy?.version, reasons]);

  return (
    <main style={{ maxWidth: 1180, margin: "32px auto", padding: "0 20px", display: "grid", gap: 16 }}>
      <header style={PANEL}>
        <p style={{ margin: 0, color: "#1d4ed8", fontSize: 12, fontWeight: 800 }}>TASK 5-P1 · DESIGNATED OPERATOR</p>
        <h1>AI draft evidence review and assisted publication</h1>
        <p>
          AI, cron, clients, and ordinary application code cannot publish. A normal-risk current version can be published only by an active Supabase Auth editor through the audited DB RPC after the Phase 1 gate is approved.
        </p>
        <section style={{ display: "grid", gap: 8, maxWidth: 620 }}>
          <strong>Production editor login</strong>
          <input type="email" autoComplete="username" value={email} onChange={(event) => setEmail(event.target.value)} placeholder="Active Supabase Auth editor email" />
          <input type="password" autoComplete="current-password" value={password} onChange={(event) => setPassword(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter") void loginWithSupabase(); }} placeholder="Password" />
          <div style={BUTTON_ROW}>
            <button type="button" onClick={() => void loginWithSupabase()} disabled={loading || Boolean(accessToken)}>Sign in and load</button>
            <button type="button" onClick={() => void logout()} disabled={loading || !accessToken}>Sign out</button>
          </div>
          <small>Password authentication goes directly to Supabase Auth. Publication additionally requires an active editor+ row in admin_users.</small>
        </section>
        <details style={{ marginTop: 14 }}>
          <summary>Emergency read-only break-glass</summary>
          <p>Break-glass cannot publish or edit AI claims; a designated Supabase editor identity is mandatory.</p>
          <AdminSecretField adminSecret={adminSecret} setAdminSecret={setAdminSecret} resetAdminSecret={resetAdminSecret} onSubmit={loginAndLoad} authMessage={authMessage} buttonLabel="Break-glass queue read" />
        </details>
        <div style={{ ...BUTTON_ROW, marginTop: 12 }}>
          <button type="button" onClick={() => void load()} disabled={loading}>Reload queue</button>
          <Link href="/admin">Admin home</Link>
          <Link href="/admin/claim-corrections">Corrections queue</Link>
        </div>
        {message && <p style={{ color: message.ok ? "#166534" : "#991b1b" }}>{message.text}</p>}
      </header>

      {payload && (
        <section style={{ ...PANEL, borderInlineStart: payload.settings.phase >= 1 ? "6px solid #16a34a" : "6px solid #d97706" }}>
          <h2 style={{ marginTop: 0 }}>Activation gate</h2>
          <ul>
            <li>DB phase: <strong>{payload.settings.phase}</strong> {payload.settings.phase >= 1 ? "(assisted publication enabled)" : "(publication blocked)"}</li>
            <li>Emergency deny switch: <strong>{payload.emergency_disabled ? "ON" : "off"}</strong></li>
            <li>Operator samples: <strong>{payload.gate.recorded_operator_samples}/{payload.gate.required_operator_samples}</strong></li>
            <li>Minimum observation: <strong>{payload.gate.minimum_observation_days} days</strong></li>
            <li>Assisted policy: <strong>{payload.assisted_policy ? `v${payload.assisted_policy.version}` : "missing"}</strong></li>
          </ul>
          <p style={{ marginBottom: 0 }}>{payload.gate.reason}</p>
        </section>
      )}

      {(payload?.items ?? []).length === 0 ? (
        <section style={PANEL}><p>No unpublished Task 5 AI drafts. Production Phase remains safe and dark.</p></section>
      ) : payload?.items.map((item) => (
        <article key={item.claim.id} style={{ ...PANEL, borderInlineStart: item.publish_ready ? "6px solid #16a34a" : "6px solid #dc2626" }}>
          <div style={{ display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
            <div>
              <h2 style={{ margin: 0 }}>{item.claim.document_title || item.claim.claim_text}</h2>
              <p style={{ color: "#6b7280" }}>{item.claim.document_slug} · {item.claim.id} · version {item.version?.version ?? "missing"}</p>
            </div>
            <strong>{item.publish_ready ? "RPC prerequisites visible" : "Blocked: incomplete prerequisites"}</strong>
          </div>

          <section style={{ background: "#f9fafb", borderRadius: 12, padding: 14 }}>
            <strong>Claim version</strong>
            <p>{item.claim.claim_text}</p>
            <textarea rows={4} maxLength={4000} value={edits[item.claim.id] ?? item.version?.text ?? ""} onChange={(event) => setEdits((current) => ({ ...current, [item.claim.id]: event.target.value }))} style={{ width: "100%" }} />
            <small>Editing creates a new immutable version. Evidence and risk are not copied, so the new version cannot publish until re-evaluated.</small>
          </section>

          <section>
            <h3>Latest risk</h3>
            {item.latest_risk ? (
              <ul>
                <li>final: <strong>{item.latest_risk.final_result}</strong></li>
                <li>deterministic: {item.latest_risk.deterministic_result} · {item.latest_risk.deterministic_policy_version}</li>
                <li>model: {item.latest_risk.model_result} · {item.latest_risk.model_id ?? "unknown"} · {item.latest_risk.prompt_version ?? "unknown"}</li>
              </ul>
            ) : <p>No current-version risk assessment. Publication is blocked.</p>}
          </section>

          <section>
            <h3>Evidence snapshots</h3>
            {item.evidence.length === 0 ? <p>No current-version evidence. Publication is blocked.</p> : item.evidence.map((evidence) => (
              <details key={evidence.id} open>
                <summary>{evidence.source.publisher} · {evidence.relation} · retrieved {evidence.source.retrieved_at}</summary>
                <p><a href={evidence.source.url} target="_blank" rel="noreferrer">{evidence.source.url}</a></p>
                <p><strong>Quote:</strong> {evidence.quote ?? "unavailable"}</p>
                <p><strong>Context:</strong> {evidence.context ?? "unavailable"}</p>
                <p>quote hash {evidence.quote_hash_valid ? "✓" : "✗"} · context hash {evidence.context_hash_valid ? "✓" : "✗"} · server text {evidence.source.text_available_for_revalidation ? "✓" : "✗"}</p>
              </details>
            ))}
          </section>

          <section>
            <h3>AI provenance</h3>
            {item.model_provenance.length === 0 ? <p>Missing provenance. Publication is blocked.</p> : (
              <ul>{item.model_provenance.map((entry, index) => <li key={`${entry.stage}-${index}`}>{entry.stage}: {entry.provider} / {entry.model_id} / {entry.prompt_version}</li>)}</ul>
            )}
          </section>

          <section>
            <h3>Duplicate search</h3>
            {item.duplicate_candidates.length === 0 ? <p>No lexical duplicate candidate above the review threshold.</p> : (
              <ul>{item.duplicate_candidates.map((candidate) => <li key={candidate.id}><Link href={`/en/wiki/${candidate.document_slug}`}>{candidate.document_slug}</Link> · score {candidate.score} · {candidate.claim_value}</li>)}</ul>
            )}
            <label><input type="checkbox" checked={duplicateReviewed[item.claim.id] === true} onChange={(event) => setDuplicateReviewed((current) => ({ ...current, [item.claim.id]: event.target.checked }))} /> I reviewed the duplicate-search results.</label>
          </section>

          <label style={{ display: "grid", gap: 6 }}>
            Review reason (publish copies this text into public verification history; never include private data)
            <textarea rows={3} maxLength={2000} value={reasons[item.claim.id] ?? ""} onChange={(event) => setReasons((current) => ({ ...current, [item.claim.id]: event.target.value }))} />
          </label>
          <div style={{ ...BUTTON_ROW, marginTop: 12 }}>
            <button type="button" disabled={loading || !accessToken} onClick={() => void act(item, "edit")}>Create new version</button>
            <button type="button" disabled={loading || !accessToken} onClick={() => void act(item, "reject")}>Reject</button>
            <button type="button" disabled={loading || !accessToken} onClick={() => void act(item, "escalate")}>Escalate</button>
            <button type="button" disabled={loading || !accessToken} onClick={() => void act(item, "refetch")}>Request refetch</button>
            <button type="button" disabled={loading || !accessToken} onClick={() => void act(item, "hold")}>Hold</button>
            <button type="button" disabled={loading || !accessToken || !item.publish_ready || payload.settings.phase < 1 || payload.emergency_disabled} onClick={() => void act(item, "publish")}>Publish assisted claim</button>
          </div>
          {!accessToken && <p style={{ color: "#991b1b" }}>Sign in with an active Supabase editor account to act. Break-glass is read-only for this workflow.</p>}
        </article>
      ))}
    </main>
  );
}
