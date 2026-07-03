"use client";
import Link from "next/link";
import { useState } from "react";

const categories = [
  "Transport",
  "Commerce",
  "Government",
  "Healthcare",
  "Education",
  "Real estate",
  "Food & dining",
  "Events & venues",
  "Finance",
  "Technology",
  "Travel",
  "Other",
];

const languages = [
  { code: "en", label: "English" },
  { code: "ko", label: "한국어" },
  { code: "ja", label: "日本語" },
  { code: "zh", label: "中文" },
  { code: "es", label: "Español" },
  { code: "hi", label: "हिन्दी" },
  { code: "ar", label: "العربية" },
];

export default function SuggestTopicForm({ initialQuestion = "", initialLanguage = "en" }: { initialQuestion?: string; initialLanguage?: string }) {
  const [question, setQuestion] = useState(initialQuestion);
  const [country, setCountry] = useState("");
  const [cityRegion, setCityRegion] = useState("");
  const [category, setCategory] = useState(categories[0]);
  const [language, setLanguage] = useState(languages.some((item) => item.code === initialLanguage) ? initialLanguage : "en");
  const [sourceUrl, setSourceUrl] = useState("");
  const [whyThisMatters, setWhyThisMatters] = useState("");
  const [email, setEmail] = useState("");
  const [website, setWebsite] = useState("");
  const [submitted, setSubmitted] = useState(false);
  const [receiptUrl, setReceiptUrl] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  function resetForm() {
    setSubmitted(false);
    setQuestion("");
    setCountry("");
    setCityRegion("");
    setCategory(categories[0]);
    setLanguage("en");
    setSourceUrl("");
    setWhyThisMatters("");
    setEmail("");
    setWebsite("");
    setReceiptUrl("");
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!question.trim() || !country.trim() || !category.trim() || !language.trim() || !whyThisMatters.trim()) return;
    setLoading(true);
    setError("");
    try {
      const res = await fetch("/api/suggest-topic", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          question: question.trim(),
          country: country.trim(),
          city_region: cityRegion.trim() || null,
          category: category.trim(),
          language,
          source_url: sourceUrl.trim() || null,
          why_this_matters: whyThisMatters.trim(),
          email: email.trim() || null,
          website: website.trim() || null,
        }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setError("Submission failed: " + (data?.error ?? res.status));
      } else {
        const data = await res.json().catch(() => ({}));
        if (data?.contributor_hash && typeof window !== "undefined") {
          localStorage.setItem("contributor_hash_preview", data.contributor_hash);
        }
        setReceiptUrl(data?.receipt_url ?? "");
        setSubmitted(true);
      }
    } catch {
      setError("Network error. Please try again later.");
    } finally {
      setLoading(false);
    }
  }

  if (submitted) return (
    <article>
      <header className="registry-panel">
        <p className="eyebrow">Question review request</p>
        <h1>Request received</h1>
      </header>
      <section className="registry-panel semantic-panel semantic-panel-success">
        <h2>Thank you!</h2>
        <div className="semantic-alert semantic-alert-success sticky-success-feedback" role="status">
          <strong>Review pending.</strong> Next, moderators check whether the question maps to a real entity, claim, and traceable source. If accepted, it can become a claim-level candidate for human verification. Eligible accepted contributions may earn contributor points and badges.
        </div>
        <p>Your question was saved for review. It will not be shown as a trusted answer until a human checks reliable links or documents.</p>
        <div className="suggest-topic-actions success-cta-row">
          {receiptUrl && <a href={receiptUrl} className="cta-link">View my contribution receipt</a>}
          <button onClick={resetForm} className="semantic-button semantic-button-success">
            Submit another question
          </button>
          <Link href="/contribute" className="cta-link">Add a source to another claim</Link>
          <Link href="/contribute/mine" className="btn-secondary">Check my submissions →</Link>
          <Link href="/contribute/leaderboard" className="cta-link">View leaderboard</Link>
        </div>
      </section>
    </article>
  );

  return (
    <article>
      <header className="registry-panel">
        <p className="eyebrow">Question review request</p>
        <h1>Register a question For-Ai should answer</h1>
        <p>Paste the question or fact that AI might get wrong. For-Ai accepts global questions about places, institutions, events, products, services, policies, regulations, and other facts that need reliable review.</p>
      </header>
      <section className="registry-panel" aria-labelledby="suggest-form-title">
        <h2 id="suggest-form-title">Tell us what answer is missing</h2>
        {error && <div className="semantic-alert semantic-alert-danger sticky-success-feedback" role="alert">{error}</div>}
        <form onSubmit={handleSubmit} className="registry-form">
          <label>Question or fact AI might get wrong <span aria-label="required">*</span>
            <input type="text" value={question} onChange={e => setQuestion(e.target.value)} required minLength={5} maxLength={300} placeholder="Example: What documents are required for a Japan tourist visa from India?" />
          </label>
          <label>Country <span aria-label="required">*</span>
            <input type="text" value={country} onChange={e => setCountry(e.target.value)} required minLength={2} maxLength={120} placeholder="Example: Japan, India, United States, Global" />
          </label>
          <label>City / region (optional)
            <input type="text" value={cityRegion} onChange={e => setCityRegion(e.target.value)} maxLength={120} placeholder="Example: Tokyo, California, Seoul Metropolitan Area" />
          </label>
          <label>What is this about? <span aria-label="required">*</span>
            <select value={category} onChange={e => setCategory(e.target.value)} required>
              {categories.map((item) => <option key={item} value={item}>{item}</option>)}
            </select>
          </label>
          <label>Preferred answer language <span aria-label="required">*</span>
            <select value={language} onChange={e => setLanguage(e.target.value)} required>
              {languages.map((item) => <option key={item.code} value={item.code}>{item.label}</option>)}
            </select>
          </label>
          <label>Helpful link or document (optional)
            <input type="url" value={sourceUrl} onChange={e => setSourceUrl(e.target.value)} placeholder="https://official-site.example/..." />
          </label>
          <label>Why should For-Ai check this? <span aria-label="required">*</span>
            <textarea value={whyThisMatters} onChange={e => setWhyThisMatters(e.target.value)} required minLength={10} maxLength={1000} placeholder="Explain who asks this, why AI gets it wrong, or why the answer changes by location, policy, price, schedule, or date." />
          </label>
          <label>Email (optional)
            <input type="email" value={email} onChange={e => setEmail(e.target.value)} maxLength={254} placeholder="Only for follow-up during review; never public." />
          </label>
          <label className="visually-hidden" aria-hidden="true">Leave this field empty
            <input type="text" value={website} onChange={e => setWebsite(e.target.value)} tabIndex={-1} autoComplete="off" />
          </label>
          <button type="submit" disabled={loading}>{loading ? "Submitting..." : "Send for review"}</button>
        </form>
      </section>
      <section className="registry-panel" aria-labelledby="privacy-notice">
        <h2 id="privacy-notice">What happens after you send it</h2>
        <ul>
          <li>Public submissions are saved as unreviewed requests first, with low confidence and Needs verification status.</li>
          <li>Raw IP addresses are never stored. For-Ai records only contributor_hash for abuse prevention and review context.</li>
          <li>Spam checks and rate limits protect the review queue before admin review.</li>
          <li>Submitted questions are not publicly readable from this form and are reviewed before they can become public fact records.</li>
        </ul>
      </section>
    </article>
  );
}
