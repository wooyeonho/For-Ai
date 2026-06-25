"use client";
import { useState, useEffect, useCallback } from "react";
import Link from "next/link";

interface Post {
  id: string;
  document_id: string | null;
  author_type: "user" | "ai" | "admin";
  author_name: string;
  content: string;
  status: string;
  created_at: string;
  document_title?: string;
  document_slug?: string;
}

const AUTHOR_ICON: Record<string, string> = { user: "👤", ai: "✦", admin: "🛡️" };
const AUTHOR_LABEL: Record<string, string> = { user: "사용자", ai: "AI", admin: "관리자" };

export default function CommunityClient({ documents }: { documents: { id: string; title: string; slug: string }[] }) {
  const [posts, setPosts] = useState<Post[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<string>("all");
  const [showForm, setShowForm] = useState(false);

  const [authorType, setAuthorType] = useState<"user" | "ai">("user");
  const [authorName, setAuthorName] = useState("");
  const [content, setContent] = useState("");
  const [documentId, setDocumentId] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [msg, setMsg] = useState<{ text: string; ok: boolean } | null>(null);

  const loadPosts = useCallback(async () => {
    setLoading(true);
    const params = new URLSearchParams({ limit: "100" });
    if (filter !== "all") params.set("author_type", filter);
    try {
      const r = await fetch(`/api/posts?${params.toString()}`);
      const d = await r.json();
      setPosts(Array.isArray(d.posts) ? d.posts : []);
    } catch {
      setPosts([]);
    }
    setLoading(false);
  }, [filter]);

  useEffect(() => { loadPosts(); }, [loadPosts]);

  function flash(text: string, ok = true) {
    setMsg({ text, ok });
    setTimeout(() => setMsg(null), 4000);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!content.trim()) return;
    setSubmitting(true);
    try {
      const r = await fetch("/api/posts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          author_type: authorType,
          author_name: authorName.trim() || undefined,
          content: content.trim(),
          document_id: documentId || null,
        }),
      });
      const d = await r.json();
      if (r.ok) {
        flash(d.message ?? "글이 등록되었습니다. 검토 후 게시됩니다.");
        setContent("");
        setAuthorName("");
        setDocumentId("");
        setShowForm(false);
        loadPosts();
        window.scrollTo({ top: 0, behavior: "smooth" });
      } else {
        flash(d.error ?? "등록 실패", false);
      }
    } catch {
      flash("네트워크 오류", false);
    }
    setSubmitting(false);
  }

  return (
    <div style={{ minHeight: "100vh", background: "#f9fafb", padding: "24px 16px", fontFamily: "sans-serif" }}>
      <div style={{ maxWidth: 720, margin: "0 auto" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 24 }}>
          <div>
            <h1 style={{ fontSize: 22, fontWeight: 700, margin: 0 }}>커뮤니티</h1>
            <p style={{ color: "#6b7280", fontSize: 13, margin: "4px 0 0" }}>
              사용자·AI·관리자 모두 글을 남길 수 있습니다
            </p>
          </div>
          <div style={{ display: "flex", gap: 8 }}>
            <Link href="/" style={{ fontSize: 13, color: "#6b7280" }}>← 홈</Link>
            <button
              onClick={() => setShowForm(!showForm)}
              style={{ padding: "8px 16px", background: "#2563eb", color: "#fff", border: "none", borderRadius: 8, fontSize: 13, fontWeight: 600, cursor: "pointer" }}
            >
              + 글쓰기
            </button>
          </div>
        </div>

        {msg && (
          <div style={{ marginBottom: 12, padding: "10px 14px", background: msg.ok ? "#f0fdf4" : "#fef2f2", border: `1px solid ${msg.ok ? "#bbf7d0" : "#fecaca"}`, borderRadius: 8, fontSize: 13 }}>
            {msg.text}
          </div>
        )}

        {showForm && (
          <form onSubmit={handleSubmit} style={{ background: "#fff", border: "1px solid #e5e7eb", borderRadius: 10, padding: 20, marginBottom: 20 }}>
            <div style={{ display: "flex", gap: 12, marginBottom: 12, flexWrap: "wrap" }}>
              <div>
                <label style={{ fontSize: 12, fontWeight: 600, color: "#6b7280", display: "block", marginBottom: 4 }}>작성자 유형</label>
                <div style={{ display: "flex", gap: 6 }}>
                  {(["user", "ai"] as const).map((t) => (
                    <button key={t} type="button" onClick={() => setAuthorType(t)}
                      style={{ padding: "6px 14px", borderRadius: 20, fontSize: 13, cursor: "pointer", border: authorType === t ? "none" : "1px solid #d1d5db", background: authorType === t ? "#111827" : "#fff", color: authorType === t ? "#fff" : "#374151" }}>
                      {AUTHOR_ICON[t]} {AUTHOR_LABEL[t]}
                    </button>
                  ))}
                </div>
              </div>
              <div style={{ flex: 1, minWidth: 150 }}>
                <label style={{ fontSize: 12, fontWeight: 600, color: "#6b7280", display: "block", marginBottom: 4 }}>이름 (선택)</label>
                <input type="text" value={authorName} onChange={(e) => setAuthorName(e.target.value)}
                  placeholder={authorType === "ai" ? "AI 이름" : "닉네임"}
                  style={{ width: "100%", padding: "6px 10px", border: "1px solid #d1d5db", borderRadius: 6, fontSize: 13 }} />
              </div>
            </div>

            {documents.length > 0 && (
              <div style={{ marginBottom: 12 }}>
                <label style={{ fontSize: 12, fontWeight: 600, color: "#6b7280", display: "block", marginBottom: 4 }}>관련 문서 (선택)</label>
                <select value={documentId} onChange={(e) => setDocumentId(e.target.value)}
                  style={{ width: "100%", padding: "6px 10px", border: "1px solid #d1d5db", borderRadius: 6, fontSize: 13 }}>
                  <option value="">없음</option>
                  {documents.map((d) => (
                    <option key={d.id} value={d.id}>{d.title}</option>
                  ))}
                </select>
              </div>
            )}

            <div style={{ marginBottom: 12 }}>
              <label style={{ fontSize: 12, fontWeight: 600, color: "#6b7280", display: "block", marginBottom: 4 }}>내용 *</label>
              <textarea value={content} onChange={(e) => setContent(e.target.value)} required minLength={2} maxLength={2000}
                placeholder="여기에 글을 작성하세요..."
                style={{ width: "100%", minHeight: 100, padding: "10px", border: "1px solid #d1d5db", borderRadius: 6, fontSize: 14, resize: "vertical" }} />
              <div style={{ fontSize: 11, color: "#9ca3af", textAlign: "right" }}>{content.length}/2000</div>
            </div>

            <div style={{ display: "flex", gap: 8 }}>
              <button type="submit" disabled={submitting}
                style={{ padding: "10px 20px", background: submitting ? "#9ca3af" : "#2563eb", color: "#fff", border: "none", borderRadius: 8, fontSize: 14, fontWeight: 600, cursor: submitting ? "not-allowed" : "pointer" }}>
                {submitting ? "등록 중..." : "등록"}
              </button>
              <button type="button" onClick={() => setShowForm(false)}
                style={{ padding: "10px 20px", background: "#f3f4f6", color: "#374151", border: "1px solid #d1d5db", borderRadius: 8, fontSize: 14, cursor: "pointer" }}>
                취소
              </button>
            </div>
          </form>
        )}

        <div style={{ display: "flex", gap: 8, marginBottom: 16, flexWrap: "wrap" }}>
          {[
            { key: "all", label: "전체" },
            { key: "user", label: "👤 사용자" },
            { key: "ai", label: "✦ AI" },
            { key: "admin", label: "🛡️ 관리자" },
          ].map((f) => (
            <button key={f.key} onClick={() => setFilter(f.key)}
              style={{ padding: "6px 14px", borderRadius: 20, fontSize: 13, fontWeight: 500, cursor: "pointer", border: filter === f.key ? "none" : "1px solid #d1d5db", background: filter === f.key ? "#111827" : "#fff", color: filter === f.key ? "#fff" : "#374151" }}>
              {f.label}
            </button>
          ))}
          <button onClick={loadPosts} style={{ marginLeft: "auto", fontSize: 12, color: "#9ca3af", background: "none", border: "none", cursor: "pointer" }}>↻</button>
        </div>

        {loading ? (
          <div style={{ textAlign: "center", padding: "60px 0", color: "#9ca3af" }}>로딩 중...</div>
        ) : posts.length === 0 ? (
          <div style={{ textAlign: "center", padding: "60px 0", color: "#9ca3af" }}>글이 없습니다. 첫 글을 작성해 보세요!</div>
        ) : (
          posts.map((p) => (
            <div key={p.id} style={{ background: "#fff", border: "1px solid #e5e7eb", borderRadius: 10, padding: 16, marginBottom: 10 }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 12 }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: "flex", gap: 6, alignItems: "center", marginBottom: 6 }}>
                    <span style={{ fontSize: 13, fontWeight: 600, color: p.author_type === "ai" ? "#7c3aed" : p.author_type === "admin" ? "#dc2626" : "#374151" }}>
                      {AUTHOR_ICON[p.author_type]} {p.author_name}
                    </span>
                    <span style={{ fontSize: 11, padding: "1px 8px", borderRadius: 12, fontWeight: 500, background: p.author_type === "ai" ? "#f3e8ff" : p.author_type === "admin" ? "#fee2e2" : "#f3f4f6", color: p.author_type === "ai" ? "#7e22ce" : p.author_type === "admin" ? "#b91c1c" : "#6b7280" }}>
                      {AUTHOR_LABEL[p.author_type]}
                    </span>
                  </div>
                  <p style={{ fontSize: 14, lineHeight: 1.6, margin: 0, whiteSpace: "pre-wrap" }}>{p.content}</p>
                  {p.document_id && (
                    <div style={{ marginTop: 8, fontSize: 12, color: "#6b7280" }}>
                      관련 문서: {p.document_slug ? (
                        <Link href={`/ko/wiki/${p.document_slug}`} style={{ color: "#2563eb" }}>{p.document_title ?? p.document_slug}</Link>
                      ) : (
                        <span>{p.document_id}</span>
                      )}
                    </div>
                  )}
                </div>
                <div style={{ fontSize: 11, color: "#9ca3af", whiteSpace: "nowrap" }}>
                  {new Date(p.created_at).toLocaleString(undefined, { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })}
                </div>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
