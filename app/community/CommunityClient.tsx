"use client";
import { useState, useEffect, useCallback, useMemo } from "react";
import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { SUPPORTED_LOCALES } from "@/lib/i18n/locales";

interface Post {
  id: string;
  document_id: string | null;
  claim_id?: string | null;
  author_type: "user" | "ai" | "admin";
  author_name: string;
  content: string;
  status: string;
  created_at: string;
  question_type?: "question" | "discussion" | "report" | null;
  resolved_at?: string | null;
  document_title?: string;
  document_slug?: string;
}

const SUPPORTED_COMMUNITY_LOCALES = new Set<string>(SUPPORTED_LOCALES);

const AUTHOR_ICON: Record<string, string> = { user: "👤", ai: "✦", admin: "🛡️" };
const AUTHOR_LABEL: Record<string, string> = { user: "사용자", ai: "AI 제안", admin: "관리자" };
const AI_DISCLOSURE_LABEL = "Unverified AI-generated suggestion";
const AI_DISCLOSURE_DESCRIPTION = "This post was created by an admin/internal AI generation flow and is not verified fact until human review links it to source-backed claims.";
const QUESTION_TYPE_ICON: Record<string, string> = { question: "❓", discussion: "💬", report: "⚠" };
const QUESTION_TYPE_LABEL: Record<string, string> = { question: "질문", discussion: "토론", report: "오류 신고" };
const POST_REVIEW_MESSAGE = "글이 검토 대기열에 등록되었습니다. 관리자 승인 전에는 공개 목록에 표시되지 않습니다. 승인 후 게시됩니다.";
const STATUS_HELP: Record<string, string> = {
  pending: "검토 대기: 제출은 접수되었지만 아직 공개되지 않았습니다.",
  published: "게시됨: 공개 목록과 관련 wiki page에 표시됩니다.",
  hidden: "숨김: 운영 정책에 따라 공개되지 않습니다.",
  spam: "스팸: 스팸으로 판단되어 공개되지 않습니다.",
};

export default function CommunityClient({ documents }: { documents: { id: string; title: string; slug: string }[] }) {
  const [posts, setPosts] = useState<Post[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<string>("all");
  const [typeFilter, setTypeFilter] = useState<string>("all");
  const [showForm, setShowForm] = useState(false);

  const [authorName, setAuthorName] = useState("");
  const [content, setContent] = useState("");
  const [documentId, setDocumentId] = useState("");
  const [claimId, setClaimId] = useState("");
  const [questionType, setQuestionType] = useState<"question" | "discussion" | "report">("discussion");
  const [submitting, setSubmitting] = useState(false);
  const [msg, setMsg] = useState<{ text: string; ok: boolean } | null>(null);
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const currentLocale = useMemo(() => {
    const lang = searchParams.get("lang");
    if (lang && SUPPORTED_COMMUNITY_LOCALES.has(lang)) return lang;
    const firstPathSegment = pathname.split("/").filter(Boolean)[0];
    return SUPPORTED_COMMUNITY_LOCALES.has(firstPathSegment) ? firstPathSegment : "en";
  }, [pathname, searchParams]);

  // Pre-fill from URL params (e.g. from wiki "질문하기" button)
  useEffect(() => {
    const urlDocId = searchParams.get("document_id");
    const urlQ = searchParams.get("q");
    if (urlDocId) {
      setDocumentId(urlDocId);
      setQuestionType("question");
      setShowForm(true);
    }
    if (urlQ && !content) {
      setContent(urlQ);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const loadPosts = useCallback(async () => {
    setLoading(true);
    const params = new URLSearchParams({ limit: "100" });
    if (filter !== "all") params.set("author_type", filter);
    if (typeFilter !== "all") params.set("question_type", typeFilter);
    try {
      const r = await fetch(`/api/posts?${params.toString()}`);
      const d = await r.json();
      setPosts(Array.isArray(d.posts) ? d.posts : []);
    } catch {
      setPosts([]);
    }
    setLoading(false);
  }, [filter, typeFilter]);

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
          author_type: "user",
          author_name: authorName.trim() || undefined,
          content: content.trim(),
          document_id: documentId || null,
          claim_id: claimId.trim() || null,
          question_type: questionType,
        }),
      });
      const d = await r.json();
      if (r.ok) {
        const submittedContent = content.trim();
        const submittedAuthorType = "user" as const;
        const submittedAuthorName = authorName.trim() || "익명";
        const submittedDocumentId = documentId || null;
        const submittedClaimId = claimId.trim() || null;
        const submittedQuestionType = questionType;
        const relatedDocument = documents.find((doc) => doc.id === submittedDocumentId);

        flash(POST_REVIEW_MESSAGE);
        setContent("");
        setAuthorName("");
        setDocumentId("");
        setClaimId("");
        setShowForm(false);
        if (filter === "all" || filter === submittedAuthorType) {
          setPosts((currentPosts) => [
            {
              id: d.id ?? `pending-${Date.now()}`,
              document_id: submittedDocumentId,
              claim_id: submittedClaimId,
              author_type: submittedAuthorType,
              author_name: submittedAuthorName,
              content: submittedContent,
              status: d.status ?? "pending",
              created_at: d.created_at ?? new Date().toISOString(),
              question_type: submittedQuestionType,
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
              공개 글쓰기는 사용자 제보만 받습니다. AI 제안은 관리자/내부 생성 결과로만 표시됩니다
            </p>
          </div>
          <div className="community-actions">
            <Link href="/" className="community-home-link">← 홈</Link>
            <button
              onClick={() => setShowForm(!showForm)}
              className="btn btn-primary"
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
            <div className="community-form-notice" role="note">
              공개 글은 검토 후 게시됩니다. 제출 직후에는 공개 목록에 표시되지 않습니다.
            </div>
            <div className="community-form-row">
              <div>
                <label className="community-label">글 유형</label>
                <div className="community-segmented">
                  {(["question", "discussion", "report"] as const).map((qt) => (
                    <button key={qt} type="button" onClick={() => setQuestionType(qt)}
                      className={`btn btn-ghost community-chip ${questionType === qt ? "is-active" : ""}`}>
                      {QUESTION_TYPE_ICON[qt]} {QUESTION_TYPE_LABEL[qt]}
                    </button>
                  ))}
                </div>
              </div>
              <div className="community-field-flex">
                <label className="community-label">이름 (선택)</label>
                <input type="text" value={authorName} onChange={(e) => setAuthorName(e.target.value)}
                  placeholder="닉네임"
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
              <label className="community-label">관련 claim_id (선택)</label>
              <input type="text" value={claimId} onChange={(e) => setClaimId(e.target.value)}
                placeholder="특정 claim에 관한 글이면 claims.id를 입력"
                className="community-input" />
              <div className="community-count">claim_id는 운영자가 claim-level 처리로 전환할 때 사용됩니다.</div>
            </div>

            <div className="community-field-block">
              <label className="community-label">내용 *</label>
              <textarea value={content} onChange={(e) => setContent(e.target.value)} required minLength={2} maxLength={2000}
                placeholder="여기에 글을 작성하세요..."
                className="community-textarea" />
              <div className="community-count">{content.length}/2000</div>
            </div>

            <div className="community-actions">
              <button type="submit" disabled={submitting}
                className="btn btn-primary community-submit-button">
                {submitting ? "등록 중..." : "등록"}
              </button>
              <button type="button" onClick={() => setShowForm(false)}
                className="btn btn-secondary">
                취소
              </button>
            </div>
          </form>
        )}

        <div className="community-form-notice" role="note">
          상태 안내: {STATUS_HELP.pending} {STATUS_HELP.published} {STATUS_HELP.hidden} {STATUS_HELP.spam}
        </div>

        <div className="community-filter-row">
          {[
            { key: "all", label: "전체 유형" },
            { key: "question", label: "❓ 질문" },
            { key: "discussion", label: "💬 토론" },
            { key: "report", label: "⚠ 오류 신고" },
          ].map((f) => (
            <button key={f.key} onClick={() => setTypeFilter(f.key)}
              className={`btn btn-ghost community-chip ${typeFilter === f.key ? "is-active" : ""}`}>
              {f.label}
            </button>
          ))}
        </div>
        <div className="community-filter-row">
          {[
            { key: "all", label: "기본 피드 (사용자·관리자)" },
            { key: "user", label: "👤 사용자" },
            { key: "ai", label: "✦ AI" },
            { key: "admin", label: "🛡️ 관리자" },
          ].map((f) => (
            <button key={f.key} onClick={() => setFilter(f.key)}
              className={`btn btn-ghost community-chip ${filter === f.key ? "is-active" : ""}`}>
              {f.label}
            </button>
          ))}
          <button onClick={loadPosts} className="btn btn-ghost community-refresh-button">↻</button>
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
                    {p.question_type && (
                      <span className="community-author-badge">
                        {QUESTION_TYPE_ICON[p.question_type]} {QUESTION_TYPE_LABEL[p.question_type]}
                      </span>
                    )}
                    {p.resolved_at && (
                      <span className="community-author-badge community-author-badge-verified">✓ 해결됨</span>
                    )}
                    {p.author_type === "ai" && (
                      <span className="community-author-badge community-author-badge-ai">
                        {AI_DISCLOSURE_LABEL}
                      </span>
                    )}
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
                  {p.author_type === "ai" && (
                    <div className="community-related-doc">{AI_DISCLOSURE_DESCRIPTION}</div>
                  )}
                  <p className="community-post-content">{p.content}</p>
                  {p.status && <div className="community-related-doc">상태: {STATUS_HELP[p.status] ?? p.status}</div>}
                  {p.claim_id && <div className="community-related-doc">관련 claim: <code>{p.claim_id}</code></div>}
                  {p.document_id && (
                    <div className="community-related-doc">
                      관련 문서: {p.document_slug ? (
                        <Link href={`/${currentLocale}/wiki/${p.document_slug}`} className="community-related-link">{p.document_title ?? p.document_slug}</Link>
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
