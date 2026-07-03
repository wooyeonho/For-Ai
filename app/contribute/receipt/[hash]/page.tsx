import Link from 'next/link';
import { notFound } from 'next/navigation';
import { createServerClient, isSupabaseConfigured } from '@/lib/supabase-server';
import { getContributorReceipt, ReceiptStatus } from '@/lib/contributor-receipt';

const STATUS_LABEL: Record<ReceiptStatus, string> = {
  pending: 'pending',
  accepted: 'accepted',
  rejected: 'rejected',
  'verified-linked': 'verified-linked',
};

const TYPE_LABEL: Record<string, string> = {
  source_suggestion: 'Source suggestion',
  topic_suggestion: 'Topic suggestion',
  community_post: 'Community post',
  contribution_event: 'Contribution event',
};

export default async function ContributorReceiptPage({ params }: { params: Promise<{ hash: string }> }) {
  const { hash } = await params;
  if (!/^[a-f0-9]{8,64}$/i.test(hash)) notFound();

  const receipt = isSupabaseConfigured()
    ? await getContributorReceipt(createServerClient(), hash)
    : { contributor_hash: hash, totals: { points: 0, pending: 0, accepted: 0, rejected: 0, 'verified-linked': 0 }, items: [], privacy: { raw_ip_stored: false, message: 'For-Ai never stores or exposes raw IP addresses for public submissions. This receipt is keyed only by contributor_hash.' } };

  return (
    <main className="container" style={{ padding: '32px 16px' }}>
      <section className="registry-panel">
        <p className="eyebrow">Contributor receipt</p>
        <h1>내 기여 보기</h1>
        <p>
          Public-safe receipt for contributor hash <code>{receipt.contributor_hash}</code>. 이 페이지는 제출자의 raw IP를 표시하지 않으며, For-Ai는 public submission에서 raw IP를 저장하지 않습니다.
        </p>
        <p style={{ color: '#4b5563' }}>{receipt.privacy.message}</p>
        <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginTop: 16 }}>
          <strong>Points: {receipt.totals.points}</strong>
          <span>Pending: {receipt.totals.pending}</span>
          <span>Accepted: {receipt.totals.accepted}</span>
          <span>Rejected: {receipt.totals.rejected}</span>
          <span>Verified-linked: {receipt.totals['verified-linked']}</span>
        </div>
      </section>

      <section className="registry-panel" style={{ marginTop: 18 }}>
        <h2>Contribution items</h2>
        {receipt.items.length === 0 ? (
          <p>No contribution items found for this hash yet. 제출 직후라면 검토 대기열 반영까지 잠시 걸릴 수 있습니다.</p>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table className="claim-table">
              <thead>
                <tr>
                  <th>Type</th>
                  <th>Item</th>
                  <th>Status</th>
                  <th>Points</th>
                  <th>Submitted</th>
                </tr>
              </thead>
              <tbody>
                {receipt.items.map((item) => (
                  <tr key={`${item.type}-${item.id}`}>
                    <td>{TYPE_LABEL[item.type] ?? item.type}</td>
                    <td>
                      <strong>{item.title}</strong>
                      {item.detail && <div style={{ color: '#6b7280', fontSize: 12 }}>{item.detail}</div>}
                    </td>
                    <td><span className={`status-badge status-${item.status}`}>{STATUS_LABEL[item.status]}</span></td>
                    <td>{item.points > 0 ? `+${item.points}` : item.points}</td>
                    <td>{new Date(item.created_at).toLocaleString('ko-KR')}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section className="registry-panel" style={{ marginTop: 18 }}>
        <h2>Privacy notice</h2>
        <ul>
          <li>Receipt lookup uses only <code>contributor_hash</code>.</li>
          <li>Raw IP addresses are not stored, exposed, or shown on this page.</li>
          <li>Statuses are review states only; verified facts still require source-backed human approval.</li>
        </ul>
        <Link href="/contribute" className="btn btn-primary">Back to contribute</Link>
      </section>
    </main>
  );
}
