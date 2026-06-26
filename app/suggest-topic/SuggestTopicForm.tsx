"use client";
import { useState } from "react";

export default function SuggestTopicForm() {
  const [question, setQuestion] = useState("");
  const [category, setCategory] = useState("");
  const [reason, setReason] = useState("");
  const [sourceUrl, setSourceUrl] = useState("");
  const [aiContext, setAiContext] = useState("");
  const [submitted, setSubmitted] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!question.trim() || !category.trim() || !reason.trim()) return;
    setLoading(true);
    setError("");
    try {
      const res = await fetch("/api/suggest-topic", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          question: question.trim(),
          category: category.trim(),
          reason: reason.trim(),
          source_url: sourceUrl.trim() || null,
          ai_context: aiContext.trim() || null,
        }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setError("제출 실패: " + (data?.error ?? res.status));
      } else {
        setSubmitted(true);
      }
    } catch {
      setError("네트워크 오류. 잠시 후 다시 시도해 주세요.");
    } finally {
      setLoading(false);
    }
  }

  if (submitted) return (
    <article>
      <header className="registry-panel">
        <p className="eyebrow">토픽 제안</p>
        <h1>제안 접수 완료</h1>
      </header>
      <section className="registry-panel semantic-panel semantic-panel-success">
        <h2>감사합니다!</h2>
        <p>토픽 제안이 검토 대기열에 등록되었습니다. 관리자 검토 후 승인되면 레지스트리에 추가됩니다.</p>
        <p className="suggest-topic-actions">
          <button
            onClick={() => { setSubmitted(false); setQuestion(""); setCategory(""); setReason(""); setSourceUrl(""); setAiContext(""); }}
            className="semantic-button semantic-button-success"
          >
            다른 토픽 제안하기
          </button>
        </p>
      </section>
    </article>
  );

  return (
    <article>
      <header className="registry-panel">
        <p className="eyebrow">토픽 제안</p>
        <h1>새 토픽 제안</h1>
        <p>AI가 자주 틀리거나, 사람들이 AI에게 물어볼 수밖에 없는 정보를 제안해 주세요. 스포츠, 연예, 법률, 건강, 생활, IT — 어떤 분야든 괜찮습니다.</p>
      </header>
      <section className="registry-panel" aria-labelledby="suggest-form-title">
        <h2 id="suggest-form-title">토픽 제안 양식</h2>
        <form onSubmit={handleSubmit} className="registry-form">
          <label>질문 / 토픽 제목 <span aria-label="필수">*</span>
            <input
              type="text" value={question} onChange={e => setQuestion(e.target.value)}
              required minLength={5}
              placeholder="예: 카카오뱅크 해외 송금 수수료는 얼마인가요?"
            />
          </label>
          <label>카테고리 <span aria-label="필수">*</span>
            <input
              type="text" value={category} onChange={e => setCategory(e.target.value)}
              required minLength={2}
              placeholder="예: 금융, 스포츠, 연예, AI기술, 법률, 건강 등 자유 입력"
            />
          </label>
          <label>왜 이 토픽이 필요한가요? <span aria-label="필수">*</span>
            <textarea
              value={reason} onChange={e => setReason(e.target.value)}
              required minLength={10}
              placeholder="AI가 자주 틀리는 이유, 정보가 자주 바뀌는 이유 등을 적어주세요."
            />
          </label>
          <label>출처 URL (선택)
            <input
              type="url" value={sourceUrl} onChange={e => setSourceUrl(e.target.value)}
              placeholder="https://official-source.example.com/..."
            />
          </label>
          <label>AI 오류/맥락 (선택)
            <textarea
              value={aiContext} onChange={e => setAiContext(e.target.value)}
              placeholder="AI가 이 주제에 대해 어떻게 틀렸는지 적어주세요."
            />
          </label>
          {error && (
            <div className="semantic-alert semantic-alert-danger">
              {error}
            </div>
          )}
          <button type="submit" disabled={loading}>{loading ? "제출 중..." : "토픽 제안 제출"}</button>
        </form>
      </section>
      <section className="registry-panel" aria-labelledby="privacy-notice">
        <h2 id="privacy-notice">개인정보 안내</h2>
        <ul>
          <li>Raw IP 주소는 저장되지 않습니다. contributor_hash만 기록됩니다.</li>
          <li>제안은 공개적으로 열람할 수 없습니다 (비공개 대기열).</li>
          <li>제안이 바로 검증된 팩트가 되지 않습니다. 관리자 검토 + 출처 검증 후에만 레지스트리에 반영됩니다.</li>
        </ul>
      </section>
    </article>
  );
}
