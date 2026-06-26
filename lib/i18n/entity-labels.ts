import type { SupportedLocale } from "./locales";

// Labels for the entity profile surface. Kept in a small dedicated module rather
// than the strict UITranslations interface so the entity feature stays
// self-contained while remaining fully localized for all supported locales.
export type EntityLabels = {
  profile: string;
  trustSummary: string;
  documents: string;
  allFacts: string;
  citableDocuments: string;
  verifiedClaims: string;
  freshness: string;
  machineReadable: string;
};

const LABELS: Record<SupportedLocale, EntityLabels> = {
  ko: {
    profile: "엔티티 프로필",
    trustSummary: "신뢰 요약",
    documents: "문서",
    allFacts: "이 엔티티의 모든 사실 보기",
    citableDocuments: "인용 가능 문서",
    verifiedClaims: "검증된 claim",
    freshness: "신선도",
    machineReadable: "기계 판독용",
  },
  en: {
    profile: "Entity profile",
    trustSummary: "Trust summary",
    documents: "Documents",
    allFacts: "All facts about this entity",
    citableDocuments: "Citable documents",
    verifiedClaims: "Verified claims",
    freshness: "Freshness",
    machineReadable: "Machine-readable",
  },
  hi: {
    profile: "इकाई प्रोफ़ाइल",
    trustSummary: "विश्वास सारांश",
    documents: "दस्तावेज़",
    allFacts: "इस इकाई के बारे में सभी तथ्य",
    citableDocuments: "उद्धरण-योग्य दस्तावेज़",
    verifiedClaims: "सत्यापित दावे",
    freshness: "ताज़गी",
    machineReadable: "मशीन-पठनीय",
  },
  ar: {
    profile: "ملف الكيان",
    trustSummary: "ملخص الموثوقية",
    documents: "المستندات",
    allFacts: "كل الحقائق عن هذا الكيان",
    citableDocuments: "مستندات قابلة للاقتباس",
    verifiedClaims: "ادعاءات موثّقة",
    freshness: "الحداثة",
    machineReadable: "قابل للقراءة آليًا",
  },
  es: {
    profile: "Perfil de entidad",
    trustSummary: "Resumen de confianza",
    documents: "Documentos",
    allFacts: "Todos los datos sobre esta entidad",
    citableDocuments: "Documentos citables",
    verifiedClaims: "Afirmaciones verificadas",
    freshness: "Actualidad",
    machineReadable: "Legible por máquina",
  },
  ja: {
    profile: "エンティティプロフィール",
    trustSummary: "信頼サマリー",
    documents: "ドキュメント",
    allFacts: "このエンティティに関するすべての事実",
    citableDocuments: "引用可能なドキュメント",
    verifiedClaims: "検証済みの主張",
    freshness: "鮮度",
    machineReadable: "機械可読",
  },
  zh: {
    profile: "实体档案",
    trustSummary: "可信度摘要",
    documents: "文档",
    allFacts: "关于该实体的所有事实",
    citableDocuments: "可引用文档",
    verifiedClaims: "已验证的声明",
    freshness: "新鲜度",
    machineReadable: "机器可读",
  },
};

export function getEntityLabels(locale: SupportedLocale): EntityLabels {
  return LABELS[locale] ?? LABELS.en;
}
