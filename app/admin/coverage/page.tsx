import Link from "next/link";
import { getCoverageSummary } from "../../../lib/registry-index";

export const revalidate = 60;

function NumberCard({ label, value }: { label: string; value: number }) {
  return (
    <div className="claim-card">
      <p className="eyebrow">{label}</p>
      <p style={{ fontSize: 28, fontWeight: 800, margin: 0 }}>{value.toLocaleString()}</p>
    </div>
  );
}

export default async function AdminCoveragePage() {
  const summary = await getCoverageSummary();

  return (
    <main style={{ maxWidth: 1180, margin: "0 auto", padding: "40px 20px" }}>
      <nav style={{ marginBottom: 24, fontSize: 13 }}>
        <Link href="/admin">← Admin</Link>
      </nav>

      <header className="registry-panel">
        <p className="eyebrow">Admin coverage</p>
        <h1>Country/category expansion status</h1>
        <p style={{ maxWidth: 820 }}>
          Operational view of For-Ai coverage by country and category. Metrics are claim-level and source-aware: documents are only the container;
          verified claims, stale claims, review needs, and missing sources drive expansion priority.
        </p>
      </header>

      <section className="registry-panel" aria-labelledby="coverage-totals">
        <h2 id="coverage-totals">Global totals</h2>
        <div className="meta-grid">
          <NumberCard label="Total documents" value={summary.totals.total_documents} />
          <NumberCard label="Verified claims" value={summary.totals.verified_claims} />
          <NumberCard label="Needs review" value={summary.totals.needs_review} />
          <NumberCard label="Stale claims" value={summary.totals.stale_claims} />
          <NumberCard label="Missing sources" value={summary.totals.missing_source_count} />
        </div>
      </section>

      <section className="registry-panel" aria-labelledby="coverage-recommendations">
        <h2 id="coverage-recommendations">다음으로 확장할 국가/카테고리</h2>
        {summary.recommendations.length === 0 ? (
          <p>No expansion gaps detected. Continue monitoring freshness and new submissions.</p>
        ) : (
          <ol className="link-list">
            {summary.recommendations.map((item) => (
              <li key={`${item.country}-${item.category}`}>
                <strong>{item.country} / {item.category}</strong>
                <span className="meta-label"> · priority {item.priority_score} · {item.reason}</span>
              </li>
            ))}
          </ol>
        )}
      </section>

      <section className="registry-panel" aria-labelledby="coverage-table">
        <h2 id="coverage-table">Country/category coverage</h2>
        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead>
              <tr>
                {['Country', 'Category', 'Total documents', 'Verified claims', 'Needs review', 'Stale claims', 'Missing sources'].map((head) => (
                  <th key={head} style={{ textAlign: "left", borderBottom: "1px solid #e5e7eb", padding: 10 }}>{head}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {summary.rows.map((row) => (
                <tr key={`${row.country}-${row.category}`}>
                  <td style={{ borderBottom: "1px solid #f1f5f9", padding: 10 }}><Link href={`/en/country/${row.country.toLowerCase()}`}>{row.country}</Link></td>
                  <td style={{ borderBottom: "1px solid #f1f5f9", padding: 10 }}>{row.category}</td>
                  <td style={{ borderBottom: "1px solid #f1f5f9", padding: 10 }}>{row.total_documents}</td>
                  <td style={{ borderBottom: "1px solid #f1f5f9", padding: 10 }}>{row.verified_claims}</td>
                  <td style={{ borderBottom: "1px solid #f1f5f9", padding: 10 }}>{row.needs_review}</td>
                  <td style={{ borderBottom: "1px solid #f1f5f9", padding: 10 }}>{row.stale_claims}</td>
                  <td style={{ borderBottom: "1px solid #f1f5f9", padding: 10 }}>{row.missing_source_count}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </main>
  );
}
