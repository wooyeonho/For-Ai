"use client";
import { useState, useEffect, useCallback, useMemo } from "react";
import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { SUPPORTED_LOCALES } from "@/lib/i18n/locales";

type AuthorType = "user" | "ai" | "admin";
type PublicAuthorType = Exclude<AuthorType, "admin">;
type QuestionType = "question" | "discussion" | "report";
type FilterValue = AuthorType | "all";
type QuestionFilterValue = QuestionType | "all";

type CommunityDocument = { id: string; title: string; slug: string };
type CommunityClientProps = { documents: CommunityDocument[] };
type Post = {
  id: string;
  document_id: string | null;
  claim_id?: string | null;
  author_type: AuthorType;
  author_name: string;
  content: string;
  status: string;
  created_at: string;
  question_type?: QuestionType | null;
  resolved_at?: string | null;
  document_title?: string;
  document_slug?: string;
};
type FlashMessage = { text: string; ok: boolean } | null;
type CommunityPostFormProps = {
  documents: CommunityDocument[];
  authorType: PublicAuthorType;
  authorName: string;
  content: string;
  documentId: string;
  claimId: string;
  questionType: QuestionType;
  submitting: boolean;
  onAuthorTypeChange: (value: PublicAuthorType) => void;
  onAuthorNameChange: (value: string) => void;
  onContentChange: (value: string) => void;
  onDocumentIdChange: (value: string) => void;
  onClaimIdChange: (value: string) => void;
  onQuestionTypeChange: (value: QuestionType) => void;
  onCancel: () => void;
  onSubmit: (event: React.FormEvent) => void;
};
type CommunityFilterBarProps = {
  authorFilter: string;
  questionFilter: string;
  onAuthorFilterChange: (value: FilterValue) => void;
  onQuestionFilterChange: (value: QuestionFilterValue) => void;
  onRefresh: () => void;
};
type CommunityPendingNoticeProps = { statusHelp: Record<string, string> };
type CommunityPostListProps = { loading: boolean; posts: Post[]; currentLocale: string };

const SUPPORTED_COMMUNITY_LOCALES = new Set<string>(SUPPORTED_LOCALES);
const COMMUNITY_COPY = {
  header: {
    title: "커뮤니티",
    subtitle: "사용자·AI·관리자 모두 글을 남길 수 있습니다",
    home: "← 홈",
    write: "+ 글쓰기",
  },
  form: {
    pendingNotice: "공개 글은 검토 후 게시됩니다. 제출 직후에는 공개 목록에 표시되지 않습니다.",
    questionType: "글 유형",
    authorType: "작성자 유형",
    authorName: "이름 (선택)",
    aiNamePlaceholder: "AI 이름",
    userNamePlaceholder: "닉네임",
    relatedDocument: "관련 문서 (선택)",
    noDocument: "없음",
    claimId: "관련 claim_id (선택)",
    claimIdPlaceholder: "특정 claim에 관한 글이면 claims.id를 입력",
    claimIdHelp: "claim_id는 운영자가 claim-level 처리로 전환할 때 사용됩니다.",
    content: "내용 *",
    contentPlaceholder: "여기에 글을 작성하세요...",
    submitting: "등록 중...",
    submit: "등록",
    cancel: "취소",
  },
  filters: {
    questionTypes: [
      { key: "all", label: "전체 유형" },
      { key: "question", label: "❓ 질문" },
      { key: "discussion", label: "💬 토론" },
      { key: "report", label: "⚠ 오류 신고" },
    ] as const,
    authors: [
      { key: "all", label: "전체 작성자" },
      { key: "user", label: "👤 사용자" },
      { key: "ai", label: "✦ AI" },
      { key: "admin", label: "🛡️ 관리자" },
    ] as const,
    refresh: "↻",
  },
  list: {
    loading: "로딩 중...",
    empty: "글이 없습니다. 첫 글을 작성해 보세요!",
    resolved: "✓ 해결됨",
    pending: "검토 대기",
    status: "상태",
    relatedClaim: "관련 claim",
    relatedDocument: "관련 문서",
  },
  messages: {
    review: "글이 검토 대기열에 등록되었습니다. 관리자 승인 전에는 공개 목록에 표시되지 않습니다. 승인 후 게시됩니다.",
    submitFailed: "등록 실패",
    networkError: "네트워크 오류",
  },
  statusHelp: {
    pending: "검토 대기: 제출은 접수되었지만 아직 공개되지 않았습니다.",
    published: "게시됨: 공개 목록과 관련 wiki page에 표시됩니다.",
    hidden: "숨김: 운영 정책에 따라 공개되지 않습니다.",
    spam: "스팸: 스팸으로 판단되어 공개되지 않습니다.",
  },
} as const;

const AUTHOR_ICON: Record<AuthorType, string> = { user: "👤", ai: "✦", admin: "🛡️" };
const AUTHOR_LABEL: Record<AuthorType, string> = { user: "사용자", ai: "AI", admin: "관리자" };
const QUESTION_TYPE_ICON: Record<QuestionType, string> = { question: "❓", discussion: "💬", report: "⚠" };
const QUESTION_TYPE_LABEL: Record<QuestionType, string> = { question: "질문", discussion: "토론", report: "오류 신고" };

function CommunityPostForm(props: CommunityPostFormProps) {
  return (
    <form onSubmit={props.onSubmit} className="community-form">
      <div className="community-form-notice" role="note">{COMMUNITY_COPY.form.pendingNotice}</div>
      <div className="community-form-row">
        <div>
          <label className="community-label">{COMMUNITY_COPY.form.questionType}</label>
          <div className="community-segmented">
            {(["question", "discussion", "report"] as const).map((type) => <button key={type} type="button" onClick={() => props.onQuestionTypeChange(type)} className={`btn btn-ghost community-chip ${props.questionType === type ? "is-active" : ""}`}>{QUESTION_TYPE_ICON[type]} {QUESTION_TYPE_LABEL[type]}</button>)}
          </div>
        </div>
        <div>
          <label className="community-label">{COMMUNITY_COPY.form.authorType}</label>
          <div className="community-segmented">
            {(["user", "ai"] as const).map((type) => <button key={type} type="button" onClick={() => props.onAuthorTypeChange(type)} className={`btn btn-ghost community-chip ${props.authorType === type ? "is-active" : ""}`}>{AUTHOR_ICON[type]} {AUTHOR_LABEL[type]}</button>)}
          </div>
        </div>
        <div className="community-field-flex">
          <label className="community-label">{COMMUNITY_COPY.form.authorName}</label>
          <input type="text" value={props.authorName} onChange={(event) => props.onAuthorNameChange(event.target.value)} placeholder={props.authorType === "ai" ? COMMUNITY_COPY.form.aiNamePlaceholder : COMMUNITY_COPY.form.userNamePlaceholder} className="community-input" />
        </div>
      </div>
      {props.documents.length > 0 && <div className="community-field-block"><label className="community-label">{COMMUNITY_COPY.form.relatedDocument}</label><select value={props.documentId} onChange={(event) => props.onDocumentIdChange(event.target.value)} className="community-input"><option value="">{COMMUNITY_COPY.form.noDocument}</option>{props.documents.map((document) => <option key={document.id} value={document.id}>{document.title}</option>)}</select></div>}
      <div className="community-field-block"><label className="community-label">{COMMUNITY_COPY.form.claimId}</label><input type="text" value={props.claimId} onChange={(event) => props.onClaimIdChange(event.target.value)} placeholder={COMMUNITY_COPY.form.claimIdPlaceholder} className="community-input" /><div className="community-count">{COMMUNITY_COPY.form.claimIdHelp}</div></div>
      <div className="community-field-block"><label className="community-label">{COMMUNITY_COPY.form.content}</label><textarea value={props.content} onChange={(event) => props.onContentChange(event.target.value)} required minLength={2} maxLength={2000} placeholder={COMMUNITY_COPY.form.contentPlaceholder} className="community-textarea" /><div className="community-count">{props.content.length}/2000</div></div>
      <div className="community-actions"><button type="submit" disabled={props.submitting} className="btn btn-primary community-submit-button">{props.submitting ? COMMUNITY_COPY.form.submitting : COMMUNITY_COPY.form.submit}</button><button type="button" onClick={props.onCancel} className="btn btn-secondary">{COMMUNITY_COPY.form.cancel}</button></div>
    </form>
  );
}

function CommunityPendingNotice({ statusHelp }: CommunityPendingNoticeProps) {
  return <div className="community-form-notice" role="note">상태 안내: {statusHelp.pending} {statusHelp.published} {statusHelp.hidden} {statusHelp.spam}</div>;
}

function CommunityFilterBar({ authorFilter, questionFilter, onAuthorFilterChange, onQuestionFilterChange, onRefresh }: CommunityFilterBarProps) {
  return (
    <>
      <div className="community-filter-row">{COMMUNITY_COPY.filters.questionTypes.map((filter) => <button key={filter.key} onClick={() => onQuestionFilterChange(filter.key)} className={`btn btn-ghost community-chip ${questionFilter === filter.key ? "is-active" : ""}`}>{filter.label}</button>)}</div>
      <div className="community-filter-row">{COMMUNITY_COPY.filters.authors.map((filter) => <button key={filter.key} onClick={() => onAuthorFilterChange(filter.key)} className={`btn btn-ghost community-chip ${authorFilter === filter.key ? "is-active" : ""}`}>{filter.label}</button>)}<button onClick={onRefresh} className="btn btn-ghost community-refresh-button">{COMMUNITY_COPY.filters.refresh}</button></div>
    </>
  );
}

function CommunityPostList({ loading, posts, currentLocale }: CommunityPostListProps) {
  if (loading) return <div className="community-empty">{COMMUNITY_COPY.list.loading}</div>;
  if (posts.length === 0) return <div className="community-empty">{COMMUNITY_COPY.list.empty}</div>;

  return posts.map((post) => (
    <div key={post.id} className="community-post-card">
      <div className="community-post-layout">
        <div className="community-post-body">
          <div className="community-post-meta">
            <span className={`community-author community-author-${post.author_type}`}>{AUTHOR_ICON[post.author_type]} {post.author_name}</span>
            {post.question_type && <span className="community-author-badge">{QUESTION_TYPE_ICON[post.question_type]} {QUESTION_TYPE_LABEL[post.question_type]}</span>}
            {post.resolved_at && <span className="community-author-badge community-author-badge-verified">{COMMUNITY_COPY.list.resolved}</span>}
            {post.status === "pending" ? <span className="community-author-badge community-author-badge-pending">{COMMUNITY_COPY.list.pending}</span> : <span className={`community-author-badge community-author-badge-${post.author_type}`}>{AUTHOR_LABEL[post.author_type]}</span>}
          </div>
          <p className="community-post-content">{post.content}</p>
          {post.status && <div className="community-related-doc">{COMMUNITY_COPY.list.status}: {COMMUNITY_COPY.statusHelp[post.status as keyof typeof COMMUNITY_COPY.statusHelp] ?? post.status}</div>}
          {post.claim_id && <div className="community-related-doc">{COMMUNITY_COPY.list.relatedClaim}: <code>{post.claim_id}</code></div>}
          {post.document_id && <div className="community-related-doc">{COMMUNITY_COPY.list.relatedDocument}: {post.document_slug ? <Link href={`/${currentLocale}/wiki/${post.document_slug}`} className="community-related-link">{post.document_title ?? post.document_slug}</Link> : <span>{post.document_id}</span>}</div>}
        </div>
        <div className="community-post-time">{new Date(post.created_at).toLocaleString(undefined, { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })}</div>
      </div>
    </div>
  ));
}

export default function CommunityClient({ documents }: CommunityClientProps) {
  const [posts, setPosts] = useState<Post[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<FilterValue>("all");
  const [typeFilter, setTypeFilter] = useState<QuestionFilterValue>("all");
  const [showForm, setShowForm] = useState(false);
  const [authorType, setAuthorType] = useState<PublicAuthorType>("user");
  const [authorName, setAuthorName] = useState("");
  const [content, setContent] = useState("");
  const [documentId, setDocumentId] = useState("");
  const [claimId, setClaimId] = useState("");
  const [questionType, setQuestionType] = useState<QuestionType>("discussion");
  const [submitting, setSubmitting] = useState(false);
  const [msg, setMsg] = useState<FlashMessage>(null);
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const currentLocale = useMemo(() => {
    const lang = searchParams.get("lang");
    if (lang && SUPPORTED_COMMUNITY_LOCALES.has(lang)) return lang;
    const firstPathSegment = pathname.split("/").filter(Boolean)[0];
    return SUPPORTED_COMMUNITY_LOCALES.has(firstPathSegment) ? firstPathSegment : "en";
  }, [pathname, searchParams]);

  useEffect(() => {
    const urlDocId = searchParams.get("document_id");
    const urlQ = searchParams.get("q");
    if (urlDocId) {
      setDocumentId(urlDocId);
      setQuestionType("question");
      setShowForm(true);
    }
    if (urlQ && !content) setContent(urlQ);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const loadPosts = useCallback(async () => {
    setLoading(true);
    const params = new URLSearchParams({ limit: "100" });
    if (filter !== "all") params.set("author_type", filter);
    if (typeFilter !== "all") params.set("question_type", typeFilter);
    try {
      const response = await fetch(`/api/posts?${params.toString()}`);
      const data = await response.json();
      setPosts(Array.isArray(data.posts) ? data.posts : []);
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

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    if (!content.trim()) return;
    setSubmitting(true);
    try {
      const response = await fetch("/api/posts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ author_type: authorType, author_name: authorName.trim() || undefined, content: content.trim(), document_id: documentId || null, claim_id: claimId.trim() || null, question_type: questionType }),
      });
      const data = await response.json();
      if (response.ok) {
        const submittedContent = content.trim();
        const submittedAuthorType = authorType;
        const submittedAuthorName = authorName.trim() || (authorType === "ai" ? "AI" : "익명");
        const submittedDocumentId = documentId || null;
        const submittedClaimId = claimId.trim() || null;
        const submittedQuestionType = questionType;
        const relatedDocument = documents.find((document) => document.id === submittedDocumentId);
        flash(COMMUNITY_COPY.messages.review);
        setContent("");
        setAuthorName("");
        setDocumentId("");
        setClaimId("");
        setShowForm(false);
        if (filter === "all" || filter === submittedAuthorType) {
          setPosts((currentPosts) => [{ id: data.id ?? `pending-${Date.now()}`, document_id: submittedDocumentId, claim_id: submittedClaimId, author_type: submittedAuthorType, author_name: submittedAuthorName, content: submittedContent, status: data.status ?? "pending", created_at: data.created_at ?? new Date().toISOString(), question_type: submittedQuestionType, document_title: relatedDocument?.title, document_slug: relatedDocument?.slug }, ...currentPosts]);
        }
        window.scrollTo({ top: 0, behavior: "smooth" });
      } else {
        flash(data.error ?? COMMUNITY_COPY.messages.submitFailed, false);
      }
    } catch {
      flash(COMMUNITY_COPY.messages.networkError, false);
    }
    setSubmitting(false);
  }

  return (
    <div className="community-page"><div className="community-shell">
      <div className="community-header"><div><h1 className="community-title">{COMMUNITY_COPY.header.title}</h1><p className="community-subtitle">{COMMUNITY_COPY.header.subtitle}</p></div><div className="community-actions"><Link href="/" className="community-home-link">{COMMUNITY_COPY.header.home}</Link><button onClick={() => setShowForm(!showForm)} className="btn btn-primary">{COMMUNITY_COPY.header.write}</button></div></div>
      {msg && <div className={`community-alert ${msg.ok ? "community-alert-success" : "community-alert-danger"}`}>{msg.text}</div>}
      {showForm && <CommunityPostForm documents={documents} authorType={authorType} authorName={authorName} content={content} documentId={documentId} claimId={claimId} questionType={questionType} submitting={submitting} onAuthorTypeChange={setAuthorType} onAuthorNameChange={setAuthorName} onContentChange={setContent} onDocumentIdChange={setDocumentId} onClaimIdChange={setClaimId} onQuestionTypeChange={setQuestionType} onCancel={() => setShowForm(false)} onSubmit={handleSubmit} />}
      <CommunityPendingNotice statusHelp={COMMUNITY_COPY.statusHelp} />
      <CommunityFilterBar authorFilter={filter} questionFilter={typeFilter} onAuthorFilterChange={setFilter} onQuestionFilterChange={setTypeFilter} onRefresh={loadPosts} />
      <CommunityPostList loading={loading} posts={posts} currentLocale={currentLocale} />
    </div></div>
  );
}
