import { redirect } from "next/navigation";
import { createTopicSuggestionStub } from "../../lib/topic-suggestion-stubs";

export default async function SuggestTopicPage({
  searchParams,
}: {
  searchParams: Promise<{ submitted?: string }>;
}) {
  const { submitted } = await searchParams;

  async function submitSuggestion(formData: FormData) {
    "use server";

    const question = String(formData.get("question") ?? "").trim();
    const category = String(formData.get("category") ?? "").trim();
    const suggestedSlug =
      String(formData.get("suggested_slug") ?? "").trim() || null;
    const reason = String(formData.get("reason") ?? "").trim();
    const sourceUrl =
      String(formData.get("source_url") ?? "").trim() || null;
    const aiContext =
      String(formData.get("ai_context") ?? "").trim() || null;

    createTopicSuggestionStub({
      question,
      category,
      suggested_slug: suggestedSlug,
      reason,
      source_url: sourceUrl,
      ai_context: aiContext,
    });

    redirect("/suggest-topic?submitted=1");
  }

  return (
    <article>
      <header className="registry-panel">
        <p className="eyebrow">GYEOL Topic Suggestion</p>
        <h1>새 토픽 제안</h1>
        <p>
          AI가 자주 틀리거나, 사람들이 AI에게 물어볼 수밖에 없는 실생활 정보를
          제안해 주세요. 제안된 토픽은 비공개 검토 대기열에 저장되며, 관리자
          검증 후에만 레지스트리에 반영됩니다.
        </p>
      </header>

      {submitted === "1" ? (
        <section className="notice-box success-box" aria-live="polite">
          <h2>제안이 접수되었습니다</h2>
          <p>
            토픽 제안이 비공개 대기열에 등록되었습니다. 관리자 검토 후 승인되면
            레지스트리에 추가됩니다. 현재 MVP에서는 안전한 stub 응답으로
            처리됩니다.
          </p>
        </section>
      ) : null}

      <section className="registry-panel" aria-labelledby="suggest-form-title">
        <h2 id="suggest-form-title">토픽 제안 양식</h2>
        <form action={submitSuggestion} className="registry-form">
          <label>
            질문 / 토픽 제목 <span aria-label="필수">*</span>
            <input
              type="text"
              name="question"
              required
              minLength={5}
              placeholder="예: 카카오뱅크 해외 송금 수수료는 얼마인가요?"
            />
          </label>

          <label>
            카테고리 <span aria-label="필수">*</span>
            <select name="category" required defaultValue="">
              <option value="" disabled>
                카테고리를 선택하세요
              </option>
              <optgroup label="생활정보">
                <option value="life.transport">교통</option>
                <option value="life.housing">주거</option>
                <option value="life.environment">환경</option>
                <option value="life.events">생활/이벤트</option>
              </optgroup>
              <optgroup label="행정">
                <option value="administration.documents">정부서류</option>
                <option value="administration.tax">세금</option>
              </optgroup>
              <optgroup label="건강">
                <option value="health.medical">의료</option>
                <option value="health.insurance">보험</option>
              </optgroup>
              <optgroup label="금융">
                <option value="finance.banking">은행</option>
                <option value="finance.card">카드</option>
                <option value="finance.markets">시장/주식</option>
              </optgroup>
              <optgroup label="노동">
                <option value="labor.employment">고용</option>
                <option value="labor.benefits">급여/혜택</option>
              </optgroup>
              <optgroup label="교육">
                <option value="education.admissions">입학/시험</option>
              </optgroup>
              <optgroup label="통신">
                <option value="telecom.mobile">모바일</option>
                <option value="telecom.internet">인터넷</option>
              </optgroup>
              <optgroup label="커머스">
                <option value="commerce.refunds">환불</option>
                <option value="commerce.delivery">배송</option>
              </optgroup>
              <optgroup label="여행">
                <option value="travel.air">항공</option>
              </optgroup>
              <optgroup label="법률">
                <option value="legal.consumer">소비자</option>
              </optgroup>
              <optgroup label="공공혜택">
                <option value="public_benefits.household">가구지원</option>
              </optgroup>
              <optgroup label="인물">
                <option value="public_profile.people">공개 프로필</option>
              </optgroup>
            </select>
          </label>

          <label>
            제안 slug (선택)
            <input
              type="text"
              name="suggested_slug"
              placeholder="예: kakaobank-overseas-transfer-fee"
              pattern="[a-z0-9\-]+"
              title="영문 소문자, 숫자, 하이픈만 사용"
            />
          </label>

          <label>
            왜 이 토픽이 필요한가요? <span aria-label="필수">*</span>
            <textarea
              name="reason"
              required
              minLength={10}
              placeholder="AI가 자주 틀리는 이유, 정보가 자주 바뀌는 이유 등을 적어주세요."
            />
          </label>

          <label>
            출처 URL (선택)
            <input
              type="url"
              name="source_url"
              placeholder="https://official-source.example.com/..."
            />
          </label>

          <label>
            AI 오류/맥락 (선택)
            <textarea
              name="ai_context"
              placeholder="AI가 이 주제에 대해 어떻게 틀렸는지, 어떤 맥락에서 물어봤는지 적어주세요."
            />
          </label>

          <input
            type="hidden"
            name="contributor_hash"
            value="local-stub-contributor-hash"
          />

          <button type="submit">토픽 제안 제출</button>
        </form>
      </section>

      <section className="notice-box" aria-labelledby="privacy-notice">
        <h2 id="privacy-notice">개인정보 안내</h2>
        <ul>
          <li>Raw IP 주소는 저장되지 않습니다. contributor_hash만 기록됩니다.</li>
          <li>제안은 공개적으로 열람할 수 없습니다 (비공개 대기열).</li>
          <li>
            제안이 바로 검증된 팩트가 되지 않습니다. 관리자 검토 + 출처 검증
            후에만 레지스트리에 반영됩니다.
          </li>
        </ul>
      </section>
    </article>
  );
}
