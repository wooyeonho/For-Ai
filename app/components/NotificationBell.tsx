"use client";

import type { Session } from "@supabase/supabase-js";
import Link from "next/link";
import { useEffect, useState } from "react";
import { getSupabaseBrowserClient } from "@/lib/supabase-browser";

export function NotificationBell({ onNavigate }: { onNavigate?: () => void }) {
  const client = getSupabaseBrowserClient();
  const [signedIn, setSignedIn] = useState(false);
  const [unread, setUnread] = useState(0);

  useEffect(() => {
    if (!client) return;
    let active = true;

    const refresh = async (knownSession?: Session | null) => {
      const currentSession = knownSession === undefined
        ? (await client.auth.getSession()).data.session
        : knownSession;
      if (!active) return;
      const hasSession = Boolean(currentSession?.user);
      setSignedIn(hasSession);
      if (!hasSession) {
        setUnread(0);
        return;
      }
      const { count, error } = await client
        .from("notifications")
        .select("id", { count: "exact", head: true })
        .is("read_at", null);
      if (active && !error) setUnread(count ?? 0);
    };

    void refresh();
    const { data: authListener } = client.auth.onAuthStateChange((_event, nextSession) => void refresh(nextSession));
    const onFocus = () => void refresh();
    const onChanged = () => void refresh();
    window.addEventListener("focus", onFocus);
    window.addEventListener("for-ai:notifications-changed", onChanged);
    const timer = window.setInterval(() => void refresh(), 60_000);

    return () => {
      active = false;
      authListener.subscription.unsubscribe();
      window.removeEventListener("focus", onFocus);
      window.removeEventListener("for-ai:notifications-changed", onChanged);
      window.clearInterval(timer);
    };
  }, [client]);

  return (
    <Link
      href="/notifications"
      className="notification-bell"
      aria-label={signedIn ? `Notifications${unread > 0 ? `, ${unread} unread` : ""}` : "Notifications sign in"}
      onClick={onNavigate}
    >
      <svg aria-hidden="true" width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
        <path d="M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9" />
        <path d="M10 21h4" />
      </svg>
      {signedIn && unread > 0 ? <span className="notification-unread-dot" aria-hidden="true" /> : null}
      {signedIn && unread > 0 ? <span className="sr-only">{unread} unread notifications</span> : null}
    </Link>
  );
}
