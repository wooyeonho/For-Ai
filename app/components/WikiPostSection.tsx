"use client";
import Link from "next/link";
import { useState, useEffect, useCallback } from "react";

interface Post {
  id: string;
  author_type: string;
  author_name: string;
  content: string;
  created_at: string;
  status?: string;
  claim_id?: string | null;
}

const AUTHOR_ICON: Record<string, string> = { user: "👤", ai: "✦", admin: "🛡️" };
const AI_DISCLOSURE_LABEL = "Unverified AI-generated suggestion";
const AI_DISCLOSURE_DESCRIPTION = "This post was created by an admin/internal AI generation flow and is not verified fact until human review links it to source-backed claims.";
const POST_REVIEW_MESSAGE = "글이 검토 대기열에 등록되었습니다. 관리자 승인 후 공개 목록에 표시됩니다.";

export function WikiPostSection({ documentId, claims = [] }: { documentId: string; claims?: { id: string; label: string }[] }) {
  const [posts, setPosts] = useState<Post[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [authorName, setAuthorName] = useState("");
  const [content, setContent] = useState("");
  const [claimId, setClaimId] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [msgOk, setMsgOk] = useState(false);
  const [showAiSuggestions, setShowAiSuggestions] = useState(false);
  const [receiptUrl, setReceiptUrl] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ document_id: documentId, limit: "20" });
      if (showAiSuggestions) params.set("include_ai", "true");
      const r = await fetch(`/api/posts?${params.toString()}`);
      const d = await r.json();
      setPosts(Array.isArray(d.posts) ? d.posts : []);
    } catch { setPosts([]); }
    setLoading(false);
  }, [documentId, showAiSuggestions]);

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
          claim_id: claimId || null,
          author_type: "user",
          author_name: authorName.trim() || undefined,
          content: content.trim(),
        }),
      });
      const d = await r.json();
      if (r.ok) {
        const submittedContent = content.trim();
        const submittedAuthorType = "user" as const;
        const submittedAuthorName = authorName.trim() || "익명";
        const submittedClaimId = claimId || null;

        setContent("");
        setAuthorName("");
        setClaimId("");
        setShowForm(false);
        setMsgOk(true);
        if (d.contributor_hash && typeof window !== "undefined") localStorage.setItem("contributor_hash_preview", d.contributor_hash);
        setReceiptUrl(d.receipt_url ?? null);
        setMsg(POST_REVIEW_MESSAGE);
        setPosts((currentPosts) => [
          {
            id: d.id ?? `pending-${Date.now()}`,
            author_type: submittedAuthorType,
            author_name: submittedAuthorName,
            content: submittedContent,
            claim_id: submittedClaimId,
            created_at: d.created_at ?? new Date().toISOString(),
            status: d.status ?? "pending",
          },
          ...currentPosts,
        ]);
      } else {
        setMsgOk(false);
        setMsg(d.error ?? "등록 실패");
      }
    } catch {
      setMsgOk(false);
      setMsg("네트워크 오류");
    }
    setSubmitting(false);
  }

  return (
    <section className="registry-panel" aria-labelledby="community-posts">
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <h2 id="community-posts">커뮤니티 ({posts.length})</h2>
        <button onClick={() => setShowForm(!showForm)} className="btn btn-primary">
          + 글쓰기
        </button>
      </div>

      {showForm && (
        <form onSubmit={submit} style={{ marginTop: 12, padding: 12, background: "#f9fafb", borderRadius: 8, border: "1px solid #e5e7eb" }}>
          <div style={{ marginBottom: 8 }}>
            <p style={{ fontSize: 12, color: "#6b7280", margin: "0 0 6px" }}>공개 글쓰기는 사용자 제보만 받습니다. AI 제안은 관리자/내부 생성 결과로만 표시됩니다.</p>
            <input type="text" value={authorName} onChange={(e) => setAuthorName(e.target.value)}
              placeholder="이름 (선택)" style={{ width: "100%", padding: "4px 8px", border: "1px solid #d1d5db", borderRadius: 6, fontSize: 12 }} />
          </div>
          {claims.length > 0 && (
            <select value={claimId} onChange={(e) => setClaimId(e.target.value)}
              style={{ width: "100%", padding: "6px 8px", border: "1px solid #d1d5db", borderRadius: 6, fontSize: 12, marginBottom: 8 }}>
              <option value="">문서 전체에 관한 글</option>
              {claims.map((claim) => <option key={claim.id} value={claim.id}>{claim.label} · {claim.id}</option>)}
            </select>
          )}
          <textarea value={content} onChange={(e) => setContent(e.target.value)} required
            placeholder="의견이나 정보를 남겨주세요..."
            style={{ width: "100%", minHeight: 60, padding: 8, border: "1px solid #d1d5db", borderRadius: 6, fontSize: 13, resize: "vertical", marginBottom: 8 }} />
          {msg && !msgOk && <p style={{ fontSize: 12, color: "#dc2626", marginBottom: 8 }}>{msg}</p>}
          <div style={{ display: "flex", gap: 6 }}>
            <button type="submit" disabled={submitting} className="btn btn-primary">
              {submitting ? "등록 중..." : "등록"}
            </button>
            <button type="button" onClick={() => setShowForm(false)} className="btn btn-secondary">
              취소
            </button>
          </div>
        </form>
      )}

      {msg && msgOk && !showForm && (
        <p style={{ fontSize: 12, color: "#15803d", marginTop: 12 }}>
          {msg} {receiptUrl && <a href={receiptUrl}>내 기여 보기</a>}
        </p>
      )}

      <div style={{ marginTop: 12 }}>
        <button type="button" onClick={() => setShowAiSuggestions((v) => !v)} className="btn btn-ghost" aria-pressed={showAiSuggestions}>
          {showAiSuggestions ? "AI 제안 숨기기" : "AI 제안 별도 보기"}
        </button>
        <p style={{ fontSize: 12, color: "#6b7280", margin: "6px 0 0" }}>기본 커뮤니티 목록은 사용자·관리자 글만 표시합니다. AI 글은 별도 보기에서만 펼쳐집니다.</p>
      </div>

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
                {p.author_type === "ai" && (
                  <span style={{ fontSize: 11, color: "#6d28d9", background: "#ede9fe", borderRadius: 999, padding: "1px 8px", fontWeight: 700 }}>
                    {AI_DISCLOSURE_LABEL}
                  </span>
                )}
                {p.status === "pending" && (
                  <span style={{ fontSize: 11, color: "#92400e", background: "#fef3c7", borderRadius: 999, padding: "1px 8px", fontWeight: 600 }}>
                    검토 대기
                  </span>
                )}
                <span style={{ fontSize: 11, color: "#9ca3af" }}>
                  {new Date(p.created_at).toLocaleString("ko-KR", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })}
                </span>
              </div>
              {p.author_type === "ai" && <p style={{ fontSize: 11, color: "#6b7280", margin: "0 0 4px" }}>{AI_DISCLOSURE_DESCRIPTION}</p>}
              {p.claim_id && <p style={{ fontSize: 11, color: "#6b7280", margin: "0 0 4px" }}>관련 claim: <code>{p.claim_id}</code></p>}
              <p style={{ fontSize: 13, lineHeight: 1.6, margin: 0, whiteSpace: "pre-wrap" }}>{p.content}</p>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
