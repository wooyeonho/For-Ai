"use client";
import { useState, useEffect, useCallback } from "react";

interface Post {
  id: string;
  author_type: string;
  author_name: string;
  content: string;
  created_at: string;
}

const AUTHOR_ICON: Record<string, string> = { user: "👤", ai: "✦", admin: "🛡️" };

export function WikiPostSection({ documentId }: { documentId: string }) {
  const [posts, setPosts] = useState<Post[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [authorType, setAuthorType] = useState<"user" | "ai">("user");
  const [authorName, setAuthorName] = useState("");
  const [content, setContent] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [msgOk, setMsgOk] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const r = await fetch(`/api/posts?document_id=${documentId}&limit=20`);
      const d = await r.json();
      setPosts(Array.isArray(d.posts) ? d.posts : []);
    } catch { setPosts([]); }
    setLoading(false);
  }, [documentId]);

  useEffect(() => { load(); }, [load]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!content.trim()) return;
    setSubmitting(true);
    try {
      const r = await fetch("/api/posts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          document_id: documentId,
          author_type: authorType,
          author_name: authorName.trim() || undefined,
          content: content.trim(),
        }),
      });
      const d = await r.json();
      if (r.ok) {
        setContent("");
        setShowForm(false);
        setMsgOk(true);
        setMsg(d.message ?? "검토 후 게시됩니다.");
        load();
      } else {
        setMsgOk(false);
        setMsg(d.error ?? "등록 실패");
      }
    } catch { setMsg("네트워크 오류"); }
    setSubmitting(false);
  }

  return (
    <section className="registry-panel" aria-labelledby="community-posts">
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <h2 id="community-posts">커뮤니티 ({posts.length})</h2>
        <button onClick={() => setShowForm(!showForm)}
          style={{ padding: "6px 14px", background: "#2563eb", color: "#fff", border: "none", borderRadius: 6, fontSize: 13, cursor: "pointer" }}>
          + 글쓰기
        </button>
      </div>

      {showForm && (
        <form onSubmit={submit} style={{ marginTop: 12, padding: 12, background: "#f9fafb", borderRadius: 8, border: "1px solid #e5e7eb" }}>
          <div style={{ display: "flex", gap: 8, marginBottom: 8 }}>
            {(["user", "ai"] as const).map((t) => (
              <button key={t} type="button" onClick={() => setAuthorType(t)}
                style={{ padding: "4px 12px", borderRadius: 16, fontSize: 12, cursor: "pointer", border: authorType === t ? "none" : "1px solid #d1d5db", background: authorType === t ? "#111827" : "#fff", color: authorType === t ? "#fff" : "#374151" }}>
                {AUTHOR_ICON[t]} {t === "user" ? "사용자" : "AI"}
              </button>
            ))}
            <input type="text" value={authorName} onChange={(e) => setAuthorName(e.target.value)}
              placeholder="이름 (선택)" style={{ flex: 1, padding: "4px 8px", border: "1px solid #d1d5db", borderRadius: 6, fontSize: 12 }} />
          </div>
          <textarea value={content} onChange={(e) => setContent(e.target.value)} required
            placeholder="의견이나 정보를 남겨주세요..."
            style={{ width: "100%", minHeight: 60, padding: 8, border: "1px solid #d1d5db", borderRadius: 6, fontSize: 13, resize: "vertical", marginBottom: 8 }} />
          {msg && !msgOk && <p style={{ fontSize: 12, color: "#dc2626", marginBottom: 8 }}>{msg}</p>}
          <div style={{ display: "flex", gap: 6 }}>
            <button type="submit" disabled={submitting}
              style={{ padding: "6px 16px", background: submitting ? "#9ca3af" : "#2563eb", color: "#fff", border: "none", borderRadius: 6, fontSize: 13, cursor: submitting ? "not-allowed" : "pointer" }}>
              {submitting ? "등록 중..." : "등록"}
            </button>
            <button type="button" onClick={() => setShowForm(false)}
              style={{ padding: "6px 16px", background: "#f3f4f6", color: "#374151", border: "1px solid #d1d5db", borderRadius: 6, fontSize: 13, cursor: "pointer" }}>
              취소
            </button>
          </div>
        </form>
      )}

      {msg && msgOk && !showForm && (
        <p style={{ fontSize: 12, color: "#15803d", marginTop: 12 }}>{msg}</p>
      )}

      {loading ? (
        <p style={{ color: "#9ca3af", fontSize: 13 }}>로딩 중...</p>
      ) : posts.length === 0 ? (
        <p style={{ color: "#9ca3af", fontSize: 13 }}>아직 글이 없습니다. 첫 글을 남겨보세요!</p>
      ) : (
        <div style={{ marginTop: 12, display: "flex", flexDirection: "column", gap: 8 }}>
          {posts.map((p) => (
            <div key={p.id} style={{ padding: "10px 12px", background: "#fff", border: "1px solid #f3f4f6", borderRadius: 8 }}>
              <div style={{ display: "flex", gap: 6, alignItems: "center", marginBottom: 4 }}>
                <span style={{ fontSize: 13, fontWeight: 600, color: p.author_type === "ai" ? "#7c3aed" : p.author_type === "admin" ? "#dc2626" : "#374151" }}>
                  {AUTHOR_ICON[p.author_type]} {p.author_name}
                </span>
                <span style={{ fontSize: 11, color: "#9ca3af" }}>
                  {new Date(p.created_at).toLocaleString("ko-KR", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })}
                </span>
              </div>
              <p style={{ fontSize: 13, lineHeight: 1.6, margin: 0, whiteSpace: "pre-wrap" }}>{p.content}</p>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
