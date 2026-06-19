export function VerificationMeta({
  lastVerifiedAt,
  sourceCount,
}: {
  lastVerifiedAt: string | null;
  sourceCount: number;
}) {
  return (
    <div className="verification-meta">
      <span className="meta-label">최종 검증</span>
      <span className="verification-value">
        {lastVerifiedAt ?? "확인 필요"}
      </span>
      <span className="meta-label">출처 수</span>
      <span className="verification-value">{sourceCount}</span>
    </div>
  );
}
