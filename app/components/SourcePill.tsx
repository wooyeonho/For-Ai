import type { ClaimSource } from "../../lib/types";

const SOURCE_TYPE_LABELS: Record<string, string> = {
  official: "공식",
  platform: "플랫폼",
  review: "리뷰",
  user: "사용자",
  phone: "전화 확인",
  photo: "사진",
  document: "문서",
  web: "웹",
  other: "기타",
  unknown: "미분류",
};

export function SourcePill({ source }: { source: ClaimSource }) {
  const label = SOURCE_TYPE_LABELS[source.source_type] ?? source.source_type;
  const title = source.title ?? source.url ?? source.citation ?? "출처";
  const titleClassName = source.url && title === source.url
    ? "source-title source-url long-text"
    : source.citation && title === source.citation
      ? "source-title source-citation long-text"
      : "source-title long-text";
  const sourceLanguage = source.lang ? ` · ${source.lang}` : "";

  if (source.url) {
    return (
      <a href={source.url} className="source-pill" target="_blank" rel="noopener noreferrer">
        <span className="source-type">{label}</span>
        <span className={titleClassName}>{title}{sourceLanguage}</span>
      </a>
    );
  }

  return (
    <span className="source-pill">
      <span className="source-type">{label}</span>
      <span className={titleClassName}>{title}{sourceLanguage}</span>
    </span>
  );
}
