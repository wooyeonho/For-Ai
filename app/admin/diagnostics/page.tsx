"use client";

import Link from "next/link";
import { useCallback, useState } from "react";
import { adminApiHeaders, establishAdminSession } from "../AdminSecretProvider";

type TableCheck = {
  accessible: boolean;
  count: number | null;
  error: string | null;
};

type DiagnosticsPayload = {
  env: {
    admin_secret: boolean;
    next_public_supabase_url: boolean;
    supabase_service_role_key: boolean;
    ai_provider_key: boolean;
    ai_providers: Record<string, boolean>;
  };
  supabase: {
    admin_client: boolean;
    tables: Record<string, TableCheck>;
  };
};

function StatusBadge({ ok }: { ok: boolean }) {
  return (
    <span className={ok ? "badge badge-verified" : "badge badge-low"}>
      {ok ? "configured" : "missing"}
    </span>
  );
}

export default function AdminDiagnosticsPage() {
  const [secret, setSecret] = useState("");
  const [data, setData] = useState<DiagnosticsPayload | null>(null);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setMessage(null);
    const res = await fetch("/api/admin/diagnostics", { headers: adminApiHeaders(secret) });
    const payload = await res.json();
    setLoading(false);
    if (res.ok) {
      setData(payload);
      setMessage({ ok: true, text: "Diagnostics loaded. Secret values are not exposed." });
    } else {
      setMessage({ ok: false, text: payload.error ?? "Diagnostics failed" });
    }
  }, [secret]);

  return (
    <div style={{ maxWidth: 960, margin: "0 auto", padding: "40px 20px" }}>
      <nav style={{ marginBottom: 24, fontSize: 13 }}>
        <Link href="/admin/review">← Admin review</Link>
      </nav>

      <header className="registry-panel">
        <p className="eyebrow">Admin diagnostics</p>
        <h1>Environment and Supabase access checks</h1>
        <p>
          ADMIN_SECRET, Supabase, and AI provider key presence are shown as booleans only.
          Actual secret values are never returned by the diagnostics API.
        </p>
        <div style={{ display: "flex", gap: 8, marginTop: 16 }}>
          <input
            aria-label="Admin secret"
            type="password"
            value={secret}
            onChange={(event) => { setSecret(event.target.value); void establishAdminSession(event.target.value); }}
            placeholder="ADMIN_SECRET"
            style={{ flex: 1, padding: 10 }}
          />
          <button onClick={load} disabled={loading}>{loading ? "Checking..." : "Run diagnostics"}</button>
        </div>
        {message && <p style={{ color: message.ok ? "#166534" : "#991b1b" }}>{message.text}</p>}
      </header>

      {data && (
        <>
          <section className="registry-panel" aria-labelledby="env-title">
            <h2 id="env-title">Environment variables</h2>
            <div className="meta-grid">
              <div className="claim-card"><p className="eyebrow">ADMIN_SECRET</p><StatusBadge ok={data.env.admin_secret} /></div>
              <div className="claim-card"><p className="eyebrow">NEXT_PUBLIC_SUPABASE_URL</p><StatusBadge ok={data.env.next_public_supabase_url} /></div>
              <div className="claim-card"><p className="eyebrow">SUPABASE_SERVICE_ROLE_KEY</p><StatusBadge ok={data.env.supabase_service_role_key} /></div>
              <div className="claim-card"><p className="eyebrow">AI provider key</p><StatusBadge ok={data.env.ai_provider_key} /></div>
            </div>

            <h3>AI providers</h3>
            <ul className="link-list">
              {Object.entries(data.env.ai_providers).map(([provider, ok]) => (
                <li key={provider}><strong>{provider}</strong> <StatusBadge ok={ok} /></li>
              ))}
            </ul>
          </section>

          <section className="registry-panel" aria-labelledby="supabase-title">
            <h2 id="supabase-title">Supabase table access</h2>
            <p><strong>Admin client:</strong> <StatusBadge ok={data.supabase.admin_client} /></p>
            <div className="meta-grid">
              {Object.entries(data.supabase.tables).map(([table, check]) => (
                <div className="claim-card" key={table}>
                  <p className="eyebrow">{table}</p>
                  <p><StatusBadge ok={check.accessible} /></p>
                  <p style={{ margin: 0 }}>count: {check.count ?? "n/a"}</p>
                  {check.error && <p style={{ color: "#991b1b" }}>{check.error}</p>}
                </div>
              ))}
            </div>
          </section>
        </>
      )}
    </div>
  );
}
