"use client";

import type { Session } from "@supabase/supabase-js";
import { useCallback, useEffect, useState } from "react";
import { getSupabaseBrowserClient } from "@/lib/supabase-browser";

type InboxNotification = {
  id: string;
  event_id: string;
  reasons: string[];
  claim_id: string;
  created_at: string;
  read_at: string | null;
};

const PANEL = { background: "#fff", border: "1px solid #e5e7eb", borderRadius: 16, padding: 20 } as const;
const BUTTON = { border: 0, borderRadius: 9, padding: "10px 14px", background: "#111827", color: "#fff", fontWeight: 700, cursor: "pointer" } as const;

function reasonLabel(reason: string): string {
  const labels: Record<string, string> = {
    wanted_claim_published: "A fact you requested was published",
    assisted_review_published: "Your assisted review published a claim",
    assisted_review_rejected: "Your assisted review rejected a draft",
    assisted_review_escalated: "Your assisted review escalated a draft",
    assisted_review_refetch_requested: "Your assisted review requested fresh evidence",
    assisted_review_held: "Your assisted review placed a draft on hold",
    assisted_review_version_created: "Your assisted review created a new version",
  };
  return labels[reason] ?? reason.replaceAll("_", " ");
}

export default function NotificationsPage() {
  const client = getSupabaseBrowserClient();
  const [session, setSession] = useState<Session | null>(null);
  const [items, setItems] = useState<InboxNotification[]>([]);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState<string | null>(null);

  const load = useCallback(async (currentSession?: Session | null) => {
    if (!client) {
      setLoading(false);
      setMessage("Notification sign-in is not configured.");
      return;
    }
    const resolved = currentSession === undefined
      ? (await client.auth.getSession()).data.session
      : currentSession;
    setSession(resolved);
    if (!resolved) {
      setItems([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    const { data, error } = await client
      .from("notifications")
      .select("id,event_id,reasons,claim_id,created_at,read_at")
      .order("created_at", { ascending: false })
      .limit(100);
    setLoading(false);
    if (error) {
      setMessage("Could not load the private inbox.");
      return;
    }
    setItems((data ?? []) as InboxNotification[]);
    setMessage(null);
  }, [client]);

  useEffect(() => {
    if (!client) {
      void load(null);
      return;
    }
    void load();
    const { data } = client.auth.onAuthStateChange((_event, nextSession) => void load(nextSession));
    return () => data.subscription.unsubscribe();
  }, [client, load]);

  const signIn = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!client || !email.trim() || !password) return;
    setLoading(true);
    const { error } = await client.auth.signInWithPassword({ email: email.trim(), password });
    setPassword("");
    if (error) {
      setLoading(false);
      setMessage("Sign-in failed.");
    }
  };

  const markRead = async (ids: string[]) => {
    if (!client || ids.length === 0) return;
    const readAt = new Date().toISOString();
    const { error } = await client.from("notifications").update({ read_at: readAt }).in("id", ids).is("read_at", null);
    if (error) {
      setMessage("Could not mark the notification as read.");
      return;
    }
    setItems((current) => current.map((item) => ids.includes(item.id) ? { ...item, read_at: item.read_at ?? readAt } : item));
    window.dispatchEvent(new Event("for-ai:notifications-changed"));
  };

  const unread = items.filter((item) => !item.read_at);

  return (
    <div style={{ maxWidth: 860, margin: "0 auto", display: "grid", gap: 16 }}>
      <header style={PANEL}>
        <p style={{ margin: "0 0 6px", color: "#6b7280", fontSize: 12, fontWeight: 800, letterSpacing: ".08em", textTransform: "uppercase" }}>Private inbox</p>
        <h1 style={{ margin: 0 }}>Notifications</h1>
        <p style={{ color: "#4b5563", lineHeight: 1.6 }}>Publication and review notices are created once from the transactional outbox. Only the signed-in account mapped to the recipient can read them.</p>
      </header>

      {!session ? (
        <form onSubmit={signIn} style={{ ...PANEL, display: "grid", gap: 12 }}>
          <h2 style={{ margin: 0 }}>Sign in</h2>
          <input type="email" autoComplete="username" value={email} onChange={(event) => setEmail(event.target.value)} placeholder="Supabase Auth email" required style={{ padding: 11, border: "1px solid #d1d5db", borderRadius: 9 }} />
          <input type="password" autoComplete="current-password" value={password} onChange={(event) => setPassword(event.target.value)} placeholder="Password" required style={{ padding: 11, border: "1px solid #d1d5db", borderRadius: 9 }} />
          <button type="submit" disabled={loading} style={BUTTON}>{loading ? "Signing in..." : "Sign in"}</button>
          <small style={{ color: "#6b7280" }}>Credentials go directly to Supabase Auth. For-Ai does not receive the password.</small>
          {message ? <p role="alert" style={{ color: "#991b1b", margin: 0 }}>{message}</p> : null}
        </form>
      ) : (
        <>
          <section style={{ ...PANEL, display: "flex", justifyContent: "space-between", gap: 12, alignItems: "center", flexWrap: "wrap" }}>
            <div><strong>{unread.length} unread</strong><br /><small>{session.user.email ?? "Authenticated account"}</small></div>
            <div style={{ display: "flex", gap: 8 }}>
              <button type="button" onClick={() => void markRead(unread.map((item) => item.id))} disabled={unread.length === 0} style={{ ...BUTTON, background: unread.length === 0 ? "#9ca3af" : "#065f46" }}>Mark all read</button>
              <button type="button" onClick={() => void client?.auth.signOut()} style={{ ...BUTTON, background: "#4b5563" }}>Sign out</button>
            </div>
          </section>

          {loading ? <section style={PANEL}>Loading...</section> : items.length === 0 ? (
            <section style={PANEL}><p style={{ margin: 0 }}>No notifications yet.</p></section>
          ) : items.map((item) => (
            <article key={item.id} style={{ ...PANEL, borderColor: item.read_at ? "#e5e7eb" : "#2563eb", background: item.read_at ? "#fff" : "#eff6ff" }}>
              <div style={{ display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
                <strong>{item.reasons.map(reasonLabel).join(" · ")}</strong>
                {!item.read_at ? <button type="button" onClick={() => void markRead([item.id])} style={{ ...BUTTON, padding: "7px 10px", background: "#1d4ed8" }}>Mark read</button> : <span style={{ color: "#6b7280" }}>Read</span>}
              </div>
              <p style={{ marginBottom: 6 }}>Claim: <code>{item.claim_id}</code></p>
              <small style={{ color: "#6b7280" }}>{new Date(item.created_at).toLocaleString()}</small>
            </article>
          ))}
          {message ? <p role="alert" style={{ color: "#991b1b" }}>{message}</p> : null}
        </>
      )}
    </div>
  );
}
