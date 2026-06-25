"use client";
import { useEffect } from "react";

// Count one view per document per browser session. Guards against React strict-
// mode double-invoke, client-side back/forward remounts, and refreshes within a
// session. Server-side rate-limiting is the backstop for cross-session abuse.
export function ViewTracker({ slug }: { slug: string }) {
  useEffect(() => {
    if (!slug) return;
    const key = `forai_viewed_${slug}`;
    try {
      if (sessionStorage.getItem(key)) return;
      sessionStorage.setItem(key, "1");
    } catch {
      // sessionStorage unavailable (private mode / SSR edge) — fall through.
    }
    fetch(`/api/documents/${slug}/view`, { method: "POST" }).catch(() => {});
  }, [slug]);
  return null;
}
