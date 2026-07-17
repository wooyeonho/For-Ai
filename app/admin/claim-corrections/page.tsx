"use client";

import Link from "next/link";
import { useCallback, useMemo, useState } from "react";
import { createClient } from "@supabase/supabase-js";
import { readAdminCsrfToken } from "@/lib/admin-client";
import { AdminSecretField, useAdminSecret } from "../AdminSecretProvider";

type ReportRow = {
  id: string;
  reported_document_slug: string;
  reported_claim_id: string;
  reported_claim_version: string;
  issue_category: string;
  severity: string;
  message: string;
  reporter_contact?: string | null;
  review_due_at?: string | null;
  status: string;
  created_at: string;
};

type QueuePayload = {
  reports: ReportRow[];
  db_claims: Array<{ id: string; publication_state: string }>;
  legacy_overrides: Array<{ claim_id: string; publication_state: string }>;
};

const PANEL = { background: "#fff", border: "1px solid #e5e7eb", borderRadius: 16, padding: 20 };

export default function ClaimCorrectionsAdminPage() {
  const { adminSecret, setAdminSecret, resetAdminSecret, loginAdmin, authMessage } = useAdminSecret();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [accessToken, setAccessToken] = useState<string | null>(null);
  const [payload, setPayload] = useState<QueuePayload | null>(null);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const [reasons, setReasons] = useState<Record<string, string>>({});

  const states = useMemo(() => new Map([
    ...(payload?.db_claims ?? []).map((claim) => [claim.id, claim.publication_state] as const),
    ...(payload?.legacy_overrides ?? []).map((claim) => [claim.claim_id, claim.publication_state] as const),
  ]), [payload]);

  const authClient = useMemo(() => {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    if (!url || !anonKey) return null;
    return createClient(url, anonKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
  }, []);

  const load = useCallback(async (token: string | null = accessToken) => {
    setLoading(true);
    setMessage(null);
    try {
      const response = await fetch("/api/admin/claim-corrections?status=all", {
        headers: {
          "Cache-Control": "no-store",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        setMessage({ ok: false, text: data.error ?? "Queue load failed" });
        return;
      }
      setPayload(data);
      setMessage({ ok: true, text: `${data.reports?.length ?? 0} reports loaded.` });
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
      const { data, error } = await authClient.auth.signInWithPassword({
        email: email.trim(),
        password,
      });
      const token = data.session?.access_token ?? null;
      if (error || !token) {
        setMessage({ ok: false, text: error?.message ?? "Supabase Auth login failed." });
        return;
      }
      setPassword("");
      setAccessToken(token);
      await load(token);
    } catch {
      setMessage({ ok: false, text: "Supabase Auth network error." });
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

  const act = useCallback(async (report: ReportRow, action: "quarantine" | "restore" | "withdraw") => {
    const publicReason = reasons[report.id]?.trim() ?? "";
    if (publicReason.length < 3) {
      setMessage({ ok: false, text: "Enter a public-safe reason of at least 3 characters." });
      return;
    }
    setLoading(true);
    setMessage(null);
    try {
      const response = await fetch("/api/admin/claim-corrections", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(accessToken
            ? { Authorization: `Bearer ${accessToken}` }
            : { "x-admin-csrf": readAdminCsrfToken() }),
        },
        body: JSON.stringify({
          report_id: report.id,
          action,
          public_reason: publicReason,
          idempotency_key: crypto.randomUUID(),
        }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        setMessage({ ok: false, text: data.detail ?? data.error ?? "Action failed" });
        return;
      }
      setMessage({ ok: true, text: `${action} completed. Origin caches were invalidated.` });
      await load();
    } catch {
      setMessage({ ok: false, text: "Network error" });
    } finally {
      setLoading(false);
    }
  }, [accessToken, load, reasons]);

  return (
    <main style={{ maxWidth: 1120, margin: "32px auto", padding: "0 20px", display: "grid", gap: 16 }}>
      <header style={PANEL}>
        <p style={{ margin: 0, color: "#6b7280", fontSize: 12, fontWeight: 800 }}>TASK 5-F · TRUST OPERATIONS</p>
        <h1>Claim reports, quarantine, and correction history</h1>
        <p>Reports never quarantine automatically. Moderator+ can quarantine/restore; only admin can withdraw. The reason below becomes public, so do not include contact details or private correspondence.</p>
        <section style={{ display: "grid", gap: 8, maxWidth: 620 }}>
          <strong>Production admin login</strong>
          <input type="email" autoComplete="username" value={email} onChange={(event) => setEmail(event.target.value)} placeholder="Active Supabase Auth admin email" />
          <input type="password" autoComplete="current-password" value={password} onChange={(event) => setPassword(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter") void loginWithSupabase(); }} placeholder="Password" />
          <div style={{ display: "flex", gap: 8 }}>
            <button type="button" onClick={() => void loginWithSupabase()} disabled={loading || Boolean(accessToken)}>Sign in and load</button>
            <button type="button" onClick={() => void logout()} disabled={loading || !accessToken}>Sign out</button>
          </div>
          <small>Authentication is verified against Supabase Auth and the active admin_users role table. The password is never sent to a For-Ai API.</small>
        </section>
        <details style={{ marginTop: 14 }}>
          <summary>Emergency break-glass login</summary>
          <p>This path is disabled in production unless `ALLOW_BREAK_GLASS_ADMIN=true`. Use only during a documented incident.</p>
          <AdminSecretField
            adminSecret={adminSecret}
            setAdminSecret={setAdminSecret}
            resetAdminSecret={resetAdminSecret}
            onSubmit={loginAndLoad}
            authMessage={authMessage}
            buttonLabel="Break-glass login and load"
          />
        </details>
        <div style={{ marginTop: 12, display: "flex", gap: 8 }}>
          <button type="button" onClick={() => void load()} disabled={loading}>Reload queue</button>
          <Link href="/admin">Admin home</Link>
        </div>
        {message && <p style={{ color: message.ok ? "#166534" : "#991b1b" }}>{message.text}</p>}
      </header>

      {(payload?.reports ?? []).length === 0 ? (
        <section style={PANEL}><p>No open claim-bound reports.</p></section>
      ) : payload?.reports.map((report) => {
        const state = states.get(report.reported_claim_id) ?? "active";
        return (
          <article key={report.id} style={{ ...PANEL, borderInlineStart: report.severity === "critical" ? "6px solid #991b1b" : report.severity === "high" ? "6px solid #d97706" : "6px solid #2563eb" }}>
            <div style={{ display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
              <div>
                <strong>{report.issue_category}</strong> · severity {report.severity} · state {state}
                <p style={{ margin: "6px 0", color: "#6b7280", fontSize: 13 }}>{report.reported_document_slug} / {report.reported_claim_id}</p>
              </div>
              <span>{new Date(report.created_at).toLocaleString()} · due {report.review_due_at ? new Date(report.review_due_at).toLocaleString() : "—"}</span>
            </div>
            <p style={{ whiteSpace: "pre-wrap" }}>{report.message}</p>
            {report.reporter_contact && (
              <details>
                <summary>Private reporter contact</summary>
                <p>{report.reporter_contact}</p>
              </details>
            )}
            <label style={{ display: "grid", gap: 6 }}>
              Public-safe reason
              <textarea
                rows={3}
                maxLength={2000}
                value={reasons[report.id] ?? ""}
                onChange={(event) => setReasons((current) => ({ ...current, [report.id]: event.target.value }))}
                placeholder="Explain the public action without private data."
              />
            </label>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 12 }}>
              <button type="button" disabled={loading || state === "quarantined" || state === "withdrawn"} onClick={() => void act(report, "quarantine")}>Quarantine</button>
              <button type="button" disabled={loading || state !== "quarantined"} onClick={() => void act(report, "restore")}>Restore</button>
              <button type="button" disabled={loading || state === "withdrawn"} onClick={() => void act(report, "withdraw")}>Withdraw</button>
              <Link href={`/en/wiki/${encodeURIComponent(report.reported_document_slug)}`}>Open public page</Link>
            </div>
          </article>
        );
      })}
    </main>
  );
}
