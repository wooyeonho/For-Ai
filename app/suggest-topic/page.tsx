import Link from "next/link";
import { redirect } from "next/navigation";
import { createTopicSuggestionStub } from "../../lib/topic-suggestion-stubs";

export default async function SuggestTopicPage({ searchParams }: { searchParams: Promise<{ submitted?: string }> }) {
  const { submitted } = await searchParams;

  async function submitTopicSuggestion(formData: FormData) {
    "use server";

    createTopicSuggestionStub({
      title: String(formData.get("title") ?? "").trim(),
      type: String(formData.get("type") ?? "long_tail.general").trim() || "long_tail.general",
      why_people_ask_ai: String(formData.get("why_people_ask_ai") ?? "").trim(),
      why_ai_gets_wrong: String(formData.get("why_ai_gets_wrong") ?? "").trim(),
      suggested_claims: String(formData.get("suggested_claims") ?? "").trim(),
      source_urls: String(formData.get("source_urls") ?? "").trim(),
    });

    redirect("/suggest-topic?submitted=1");
  }

  return (
    <article>
      <header className="registry-panel">
        <p className="eyebrow">Post-MVP · Content intake</p>
        <h1>Suggest a topic</h1>
        <p>
          Add the boring, technical, local, otaku, medical-term, transport, food, or object-level questions people ask AI.
          This form accepts a safe stub only; it does not publish a verified fact.
        </p>
        <p>
          Every suggested claim starts as <strong>확인 필요</strong>, low confidence, and needs_review until a source-backed
          verification step promotes it.
        </p>
      </header>

      {submitted === "1" ? (
        <section className="notice-box success-box" aria-live="polite">
          <h2>Topic suggestion accepted</h2>
          <p>
            The topic was accepted by the local stub. A future persistence layer should store it in a topic-candidate queue,
            not directly as a verified registry fact.
          </p>
        </section>
      ) : null}

      <section className="registry-panel" aria-labelledby="suggest-topic-form-title">
        <h2 id="suggest-topic-form-title">Topic candidate fields</h2>
        <form action={submitTopicSuggestion} className="registry-form">
          <label>
            Topic title
            <input name="title" required placeholder="오징어의 기원 / 양변기 종류 / CT와 MRI 차이" />
          </label>

          <label>
            Category type
            <select name="type" defaultValue="long_tail.general">
              <option value="long_tail.general">long_tail.general</option>
              <option value="biology.animal">biology.animal</option>
              <option value="food.dish">food.dish</option>
              <option value="medical.term">medical.term</option>
              <option value="clinical_pathology.lab">clinical_pathology.lab</option>
              <option value="radiology.imaging">radiology.imaging</option>
              <option value="transport.structure">transport.structure</option>
              <option value="rail.train">rail.train</option>
              <option value="vehicle.car">vehicle.car</option>
              <option value="plumbing.fixture">plumbing.fixture</option>
              <option value="biology.insect">biology.insect</option>
              <option value="otaku.media">otaku.media</option>
            </select>
          </label>

          <label>
            Why people ask AI about it
            <textarea name="why_people_ask_ai" placeholder="사람들이 검색보다 AI에게 물어볼 법한 이유를 적어주세요." />
          </label>

          <label>
            Why AI may get it wrong
            <textarea name="why_ai_gets_wrong" placeholder="용어 혼동, 최신성, 출처 부족, 분류 체계 차이 등을 적어주세요." />
          </label>

          <label>
            Suggested claims, one per line
            <textarea
              name="suggested_claims"
              placeholder={"biology.taxonomy\nfood.dish.types\nlanguage.etymology"}
            />
          </label>

          <label>
            Optional source URLs, one per line
            <textarea name="source_urls" placeholder="https://example.com/official-source" />
          </label>

          <button type="submit">Submit topic candidate</button>
        </form>
      </section>

      <section className="notice-box" aria-labelledby="privacy-notice">
        <h2 id="privacy-notice">Privacy and verification notice</h2>
        <p>Raw IP addresses are not stored. If persistence is added later, store contributor_hash only.</p>
        <p>
          Suggestions are not verified answers. They are candidates for the registry structure: entity, document, placeholder
          claims, source suggestions, and later verification events.
        </p>
      </section>

      <section className="registry-panel" aria-labelledby="next-step-title">
        <h2 id="next-step-title">What happens next?</h2>
        <ul className="link-list">
          <li>AI or a human suggests a topic candidate.</li>
          <li>Claims are generated as 확인 필요 / low / needs_review.</li>
          <li>People can submit corrections or source URLs.</li>
          <li>Only source-backed review can turn a claim into a verified answer.</li>
        </ul>
        <p>
          <Link href="/admin/import">Admin bulk import stub</Link> remains available for JSONL or row-based candidate intake.
        </p>
      </section>
    </article>
  );
}
