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
const POST_REVIEW_MESSAGE = "글이 검토 대기열에 등록되었습니다. 관리자 승인 후 공개 목록에 표시됩니다.";

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
        const submittedContent = content.trim();
        const submittedAuthorType = authorType;
        const submittedAuthorName = authorName.trim() || (authorType === "ai" ? "AI" : "익명");
        const submittedDocumentId = documentId || null;
        const relatedDocument = documents.find((doc) => doc.id === submittedDocumentId);

        flash(POST_REVIEW_MESSAGE);
        setContent("");
        setAuthorName("");
        setDocumentId("");
        setShowForm(false);
        if (filter === "all" || filter === submittedAuthorType) {
          setPosts((currentPosts) => [
            {
              id: d.id ?? `pending-${Date.now()}`,
              document_id: submittedDocumentId,
              author_type: submittedAuthorType,
              author_name: submittedAuthorName,
              content: submittedContent,
              status: d.status ?? "pending",
              created_at: d.created_at ?? new Date().toISOString(),
              document_title: relatedDocument?.title,
              document_slug: relatedDocument?.slug,
            },
            ...currentPosts,
          ]);
        }
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
    <div className="community-page">
      <div className="community-shell">
        <div className="community-header">
          <div>
            <h1 className="community-title">커뮤니티</h1>
            <p className="community-subtitle">
              사용자·AI·관리자 모두 글을 남길 수 있습니다
            </p>
          </div>
          <div className="community-actions">
            <Link href="/" className="community-home-link">← 홈</Link>
            <button
              onClick={() => setShowForm(!showForm)}
              className="community-primary-button"
            >
              + 글쓰기
            </button>
          </div>
        </div>

        {msg && (
          <div className={`community-alert ${msg.ok ? "community-alert-success" : "community-alert-danger"}`}>
            {msg.text}
          </div>
        )}

        {showForm && (
          <form onSubmit={handleSubmit} className="community-form">
            <div className="community-form-row">
              <div>
                <label className="community-label">작성자 유형</label>
                <div className="community-segmented">
                  {(["user", "ai"] as const).map((t) => (
                    <button key={t} type="button" onClick={() => setAuthorType(t)}
                      className={`community-chip ${authorType === t ? "community-chip-active" : ""}`}>
                      {AUTHOR_ICON[t]} {AUTHOR_LABEL[t]}
                    </button>
                  ))}
                </div>
              </div>
              <div className="community-field-flex">
                <label className="community-label">이름 (선택)</label>
                <input type="text" value={authorName} onChange={(e) => setAuthorName(e.target.value)}
                  placeholder={authorType === "ai" ? "AI 이름" : "닉네임"}
                  className="community-input" />
              </div>
            </div>

            {documents.length > 0 && (
              <div className="community-field-block">
                <label className="community-label">관련 문서 (선택)</label>
                <select value={documentId} onChange={(e) => setDocumentId(e.target.value)}
                  className="community-input">
                  <option value="">없음</option>
                  {documents.map((d) => (
                    <option key={d.id} value={d.id}>{d.title}</option>
                  ))}
                </select>
              </div>
            )}

            <div className="community-field-block">
              <label className="community-label">내용 *</label>
              <textarea value={content} onChange={(e) => setContent(e.target.value)} required minLength={2} maxLength={2000}
                placeholder="여기에 글을 작성하세요..."
                className="community-textarea" />
              <div className="community-count">{content.length}/2000</div>
            </div>

            <div className="community-actions">
              <button type="submit" disabled={submitting}
                className="community-primary-button community-submit-button">
                {submitting ? "등록 중..." : "등록"}
              </button>
              <button type="button" onClick={() => setShowForm(false)}
                className="community-secondary-button">
                취소
              </button>
            </div>
          </form>
        )}

        <div className="community-filter-row">
          {[
            { key: "all", label: "전체" },
            { key: "user", label: "👤 사용자" },
            { key: "ai", label: "✦ AI" },
            { key: "admin", label: "🛡️ 관리자" },
          ].map((f) => (
            <button key={f.key} onClick={() => setFilter(f.key)}
              className={`community-chip ${filter === f.key ? "community-chip-active" : ""}`}>
              {f.label}
            </button>
          ))}
          <button onClick={loadPosts} className="community-refresh-button">↻</button>
        </div>

        {loading ? (
          <div className="community-empty">로딩 중...</div>
        ) : posts.length === 0 ? (
          <div className="community-empty">글이 없습니다. 첫 글을 작성해 보세요!</div>
        ) : (
          posts.map((p) => (
            <div key={p.id} className="community-post-card">
              <div className="community-post-layout">
                <div className="community-post-body">
                  <div className="community-post-meta">
                    <span className={`community-author community-author-${p.author_type}`}>
                      {AUTHOR_ICON[p.author_type]} {p.author_name}
                    </span>
                    {p.status === "pending" ? (
                      <span className="community-author-badge community-author-badge-pending">
                        검토 대기
                      </span>
                    ) : (
                      <span className={`community-author-badge community-author-badge-${p.author_type}`}>
                        {AUTHOR_LABEL[p.author_type]}
                      </span>
                    )}
                  </div>
                  <p className="community-post-content">{p.content}</p>
                  {p.document_id && (
                    <div className="community-related-doc">
                      관련 문서: {p.document_slug ? (
                        <Link href={`/en/wiki/${p.document_slug}`} className="community-related-link">{p.document_title ?? p.document_slug}</Link>
                      ) : (
                        <span>{p.document_id}</span>
                      )}
                    </div>
                  )}
                </div>
                <div className="community-post-time">
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
