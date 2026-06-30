"use client";
import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import { ensureAdminSession } from "../../../lib/admin-client";
import { AdminSecretField, useAdminSecret } from "../AdminSecretProvider";

interface Post {
  id: string;
  document_id: string | null;
  author_type: string;
  author_name: string;
  content: string;
  contributor_hash: string | null;
  status: string;
  created_at: string;
}

const AUTHOR_ICON: Record<string, string> = { user: "👤", ai: "✦", admin: "🛡️" };
const STATUS_STYLE: Record<string, { bg: string; color: string }> = {
  pending: { bg: "#dbeafe", color: "#1d4ed8" },
  published: { bg: "#dcfce7", color: "#15803d" },
  hidden: { bg: "#fef9c3", color: "#a16207" },
  spam: { bg: "#fee2e2", color: "#b91c1c" },
  deleted: { bg: "#f3f4f6", color: "#6b7280" },
};

export default function AdminPostsPage() {
  const [posts, setPosts] = useState<Post[]>([]);
  const [loading, setLoading] = useState(true);
  const { adminSecret, setAdminSecret, resetAdminSecret } = useAdminSecret();
  const [statusFilter, setStatusFilter] = useState("pending");
  const [authorFilter, setAuthorFilter] = useState("all");
  const [msg, setMsg] = useState<{ text: string; ok: boolean } | null>(null);

  const [showCreate, setShowCreate] = useState(false);
  const [newContent, setNewContent] = useState("");
  const [newAuthorType, setNewAuthorType] = useState("admin");
  const [newAuthorName, setNewAuthorName] = useState("관리자");
  const [creating, setCreating] = useState(false);

  const load = useCallback(async () => {
    if (adminSecret) await ensureAdminSession(adminSecret);
    setLoading(true);
    const params = new URLSearchParams({ status: statusFilter });
    if (authorFilter !== "all") params.set("author_type", authorFilter);
    try {
      const r = await fetch(`/api/admin/posts?${params.toString()}`, { headers: {} });
      const d = await r.json();
      setPosts(Array.isArray(d.posts) ? d.posts : []);
      if (!r.ok) flash(d.error ?? "조회 실패", false);
    } catch {
      flash("네트워크 오류", false);
    }
    setLoading(false);
  }, [adminSecret, statusFilter, authorFilter]);

  useEffect(() => { load(); }, [load]);

  function flash(text: string, ok = true) {
    setMsg({ text, ok });
    setTimeout(() => setMsg(null), 4000);
  }

  async function updateStatus(id: string, status: string) {
    if (adminSecret) await ensureAdminSession(adminSecret);
    const r = await fetch("/api/admin/posts", {
      method: "PATCH",
      headers: { "Content-Type": "application/json",  "x-admin-csrf": "1" },
      body: JSON.stringify({ id, status }),
    });
    const d = await r.json();
    if (r.ok) { flash(`상태 변경: ${status}`); load(); }
    else flash(d.error ?? "실패", false);
  }

  async function createPost(e: React.FormEvent) {
    e.preventDefault();
    if (!newContent.trim()) return;
    if (adminSecret) await ensureAdminSession(adminSecret);
    setCreating(true);
    try {
      const r = await fetch("/api/admin/posts", {
        method: "POST",
        headers: { "Content-Type": "application/json",  "x-admin-csrf": "1" },
        body: JSON.stringify({
          content: newContent.trim(),
          author_type: newAuthorType,
          author_name: newAuthorName.trim() || "관리자",
        }),
      });
      const d = await r.json();
      if (r.ok) {
        flash("글 등록 완료!");
        setNewContent("");
        setShowCreate(false);
        load();
      } else flash(d.error ?? "등록 실패", false);
    } catch {
      flash("네트워크 오류", false);
    }
    setCreating(false);
  }

  return (
    <div style={{ minHeight: "100vh", background: "#f9fafb", padding: "24px", fontFamily: "sans-serif" }}>
      <div style={{ maxWidth: 860, margin: "0 auto" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 24 }}>
          <div>
            <h1 style={{ fontSize: 22, fontWeight: 700, margin: 0 }}>글 관리</h1>
            <p style={{ color: "#6b7280", fontSize: 13, margin: "4px 0 0" }}>모든 커뮤니티 글을 관리합니다</p>
          </div>
          <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
            <AdminSecretField
              adminSecret={adminSecret}
              setAdminSecret={setAdminSecret}
              resetAdminSecret={resetAdminSecret}
              label="관리자 비밀번호"
              placeholder="Admin password"
              inputStyle={{ border: "1px solid #d1d5db", borderRadius: 6, padding: "6px 10px", fontSize: 13, width: 160 }}
            />
            <Link href="/admin/candidates" style={{ fontSize: 13, color: "#2563eb" }}>후보 큐</Link>
            <Link href="/community" style={{ fontSize: 13, color: "#2563eb" }}>커뮤니티</Link>
          </div>
        </div>

        {msg && (
          <div style={{ marginBottom: 12, padding: "10px 14px", background: msg.ok ? "#f0fdf4" : "#fef2f2", border: `1px solid ${msg.ok ? "#bbf7d0" : "#fecaca"}`, borderRadius: 8, fontSize: 13 }}>
            {msg.text}
          </div>
        )}

        <div style={{ display: "flex", gap: 8, marginBottom: 16, flexWrap: "wrap", alignItems: "center" }}>
          <button onClick={() => setShowCreate(!showCreate)}
            style={{ padding: "8px 16px", background: "#2563eb", color: "#fff", border: "none", borderRadius: 8, fontSize: 13, fontWeight: 600, cursor: "pointer" }}>
            + 관리자 글 작성
          </button>
          <div style={{ flex: 1 }} />
          {["pending", "published", "hidden", "spam", "deleted", "all"].map((s) => (
            <button key={s} onClick={() => setStatusFilter(s)}
              style={{ padding: "5px 14px", borderRadius: 20, fontSize: 12, cursor: "pointer", border: statusFilter === s ? "none" : "1px solid #d1d5db", background: statusFilter === s ? "#111827" : "#fff", color: statusFilter === s ? "#fff" : "#374151" }}>
              {s}
            </button>
          ))}
        </div>

        <div style={{ display: "flex", gap: 8, marginBottom: 16, flexWrap: "wrap", alignItems: "center" }}>
          <span style={{ fontSize: 12, color: "#6b7280", fontWeight: 600 }}>작성자</span>
          {[
            { key: "all", label: "전체" },
            { key: "user", label: "👤 사용자" },
            { key: "ai", label: "✦ AI" },
            { key: "admin", label: "🛡️ 관리자" },
          ].map((f) => (
            <button key={f.key} onClick={() => setAuthorFilter(f.key)}
              style={{ padding: "5px 12px", borderRadius: 16, fontSize: 12, fontWeight: 500, cursor: "pointer", border: authorFilter === f.key ? "none" : "1px solid #d1d5db", background: authorFilter === f.key ? "#2563eb" : "#fff", color: authorFilter === f.key ? "#fff" : "#374151" }}>
              {f.label}
            </button>
          ))}
        </div>

        {showCreate && (
          <form onSubmit={createPost} style={{ background: "#fff", border: "1px solid #e5e7eb", borderRadius: 10, padding: 20, marginBottom: 20 }}>
            <div style={{ display: "flex", gap: 12, marginBottom: 12, flexWrap: "wrap" }}>
              <div>
                <label style={{ fontSize: 12, fontWeight: 600, color: "#6b7280", display: "block", marginBottom: 4 }}>작성자 유형</label>
                <select value={newAuthorType} onChange={(e) => setNewAuthorType(e.target.value)}
                  style={{ padding: "6px 10px", border: "1px solid #d1d5db", borderRadius: 6, fontSize: 13 }}>
                  <option value="admin">관리자</option>
                  <option value="ai">AI</option>
                  <option value="user">사용자</option>
                </select>
              </div>
              <div style={{ flex: 1 }}>
                <label style={{ fontSize: 12, fontWeight: 600, color: "#6b7280", display: "block", marginBottom: 4 }}>이름</label>
                <input type="text" value={newAuthorName} onChange={(e) => setNewAuthorName(e.target.value)}
                  style={{ width: "100%", padding: "6px 10px", border: "1px solid #d1d5db", borderRadius: 6, fontSize: 13 }} />
              </div>
            </div>
            <textarea value={newContent} onChange={(e) => setNewContent(e.target.value)} required
              placeholder="글 내용 입력..."
              style={{ width: "100%", minHeight: 80, padding: 10, border: "1px solid #d1d5db", borderRadius: 6, fontSize: 14, marginBottom: 12, resize: "vertical" }} />
            <div style={{ display: "flex", gap: 8 }}>
              <button type="submit" disabled={creating}
                style={{ padding: "8px 20px", background: creating ? "#9ca3af" : "#2563eb", color: "#fff", border: "none", borderRadius: 8, fontSize: 13, fontWeight: 600, cursor: creating ? "not-allowed" : "pointer" }}>
                {creating ? "등록 중..." : "등록"}
              </button>
              <button type="button" onClick={() => setShowCreate(false)}
                style={{ padding: "8px 20px", background: "#f3f4f6", color: "#374151", border: "1px solid #d1d5db", borderRadius: 8, fontSize: 13, cursor: "pointer" }}>
                취소
              </button>
            </div>
          </form>
        )}

        {loading ? (
          <div style={{ textAlign: "center", padding: "60px 0", color: "#9ca3af" }}>로딩 중...</div>
        ) : posts.length === 0 ? (
          <div style={{ textAlign: "center", padding: "60px 0", color: "#9ca3af" }}>글이 없습니다</div>
        ) : (
          posts.map((p) => {
            const st = STATUS_STYLE[p.status] ?? STATUS_STYLE.published;
            return (
              <div key={p.id} style={{ background: "#fff", border: "1px solid #e5e7eb", borderRadius: 10, padding: 16, marginBottom: 10 }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 12 }}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: "flex", gap: 6, alignItems: "center", marginBottom: 6, flexWrap: "wrap" }}>
                      <span style={{ fontSize: 13, fontWeight: 600 }}>{AUTHOR_ICON[p.author_type] ?? "•"} {p.author_name}</span>
                      <span style={{ fontSize: 11, padding: "1px 8px", borderRadius: 12, fontWeight: 600, background: st.bg, color: st.color }}>{p.status}</span>
                      <span style={{ fontSize: 11, color: "#9ca3af" }}>{p.author_type}</span>
                      {p.contributor_hash && <span style={{ fontSize: 10, color: "#d1d5db" }}>#{p.contributor_hash.slice(0, 8)}</span>}
                    </div>
                    <p style={{ fontSize: 14, lineHeight: 1.6, margin: 0, whiteSpace: "pre-wrap" }}>{p.content}</p>
                  </div>
                  <div style={{ fontSize: 11, color: "#9ca3af", whiteSpace: "nowrap" }}>
                    {new Date(p.created_at).toLocaleString("ko-KR")}
                  </div>
                </div>
                <div style={{ marginTop: 12, display: "flex", gap: 6, flexWrap: "wrap" }}>
                  {p.status !== "published" && (
                    <button onClick={() => updateStatus(p.id, "published")}
                      style={{ padding: "5px 12px", background: "#16a34a", color: "#fff", border: "none", borderRadius: 6, fontSize: 12, cursor: "pointer" }}>
                      공개
                    </button>
                  )}
                  {p.status !== "hidden" && (
                    <button onClick={() => updateStatus(p.id, "hidden")}
                      style={{ padding: "5px 12px", background: "#f59e0b", color: "#fff", border: "none", borderRadius: 6, fontSize: 12, cursor: "pointer" }}>
                      숨기기
                    </button>
                  )}
                  {p.status !== "spam" && (
                    <button onClick={() => updateStatus(p.id, "spam")}
                      style={{ padding: "5px 12px", background: "#dc2626", color: "#fff", border: "none", borderRadius: 6, fontSize: 12, cursor: "pointer" }}>
                      스팸
                    </button>
                  )}
                  {p.status !== "deleted" && (
                    <button onClick={() => updateStatus(p.id, "deleted")}
                      style={{ padding: "5px 12px", background: "#6b7280", color: "#fff", border: "none", borderRadius: 6, fontSize: 12, cursor: "pointer" }}>
                      삭제
                    </button>
                  )}
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
