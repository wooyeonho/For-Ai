// lib/i18n/translations.ts
// UI translation strings for all supported languages

import type { SupportedLocale } from "./locales";

export interface UITranslations {
  site: {
    title: string;
    subtitle: string;
    description: string;
  };
  nav: {
    registry: string;
    developers: string;
    aiIntegration: string;
    suggestTopic: string;
    admin: string;
  };
  home: {
    heroTitle: string;
    heroSubtitle: string;
    searchPlaceholder: string;
    registeredDocs: string;
    noResults: string;
    resetSearch: string;
    noDocs: string;
    suggestFirst: string;
  };
  claims: {
    needsReview: string;
    verified: string;
    disputed: string;
    confidence: string;
    sources: string;
    lastVerified: string;
    canCite: string;
    directAnswer: string;
    copyCitation: string;
    copied: string;
    confidenceLow: string;
    confidenceMedium: string;
    confidenceHigh: string;
    notVerified: string;
    statusAiDraft: string;
    statusPublished: string;
    statusArchived: string;
    statusUnknown: string;
    verificationDate: string;
    sourceCount: string;
  };
  common: {
    loading: string;
    error: string;
    submit: string;
    cancel: string;
    save: string;
    delete: string;
    edit: string;
    back: string;
  };
}

const ko: UITranslations = {
  site: {
    title: "GYEOL",
    subtitle: "결 · 글로벌 팩트 레지스트리",
    description: "AI·검색·사람이 같은 사실을 같은 근거로 인용하는 글로벌 팩트 레지스트리",
  },
  nav: {
    registry: "레지스트리",
    developers: "개발자",
    aiIntegration: "AI 연동",
    suggestTopic: "토픽 제안",
    admin: "관리자",
  },
  home: {
    heroTitle: "AI·검색·사람이 같은 사실을 인용하는 레지스트리",
    heroSubtitle: "claim 단위로 신뢰도·출처·검증일을 관리합니다",
    searchPlaceholder: "제목 또는 카테고리 검색...",
    registeredDocs: "등록된 문서",
    noResults: "결과 없음",
    resetSearch: "검색 초기화",
    noDocs: "아직 공개된 문서가 없습니다.",
    suggestFirst: "첫 번째 토픽을 제안해보세요 →",
  },
  claims: {
    needsReview: "확인 필요",
    verified: "검증됨",
    disputed: "이의 제기",
    confidence: "신뢰도",
    sources: "출처",
    lastVerified: "마지막 검증일",
    canCite: "✓ AI 인용 가능",
    directAnswer: "직접 답변",
    copyCitation: "인용 복사",
    copied: "복사됨!",
    confidenceLow: "낮음",
    confidenceMedium: "보통",
    confidenceHigh: "높음",
    notVerified: "미검증",
    statusAiDraft: "AI 초안",
    statusPublished: "게시됨",
    statusArchived: "보관됨",
    statusUnknown: "알 수 없음",
    verificationDate: "최종 검증",
    sourceCount: "출처 수",
  },
  common: {
    loading: "로딩 중...",
    error: "오류가 발생했습니다",
    submit: "제출",
    cancel: "취소",
    save: "저장",
    delete: "삭제",
    edit: "수정",
    back: "뒤로",
  },
};

const en: UITranslations = {
  site: {
    title: "GYEOL",
    subtitle: "Global Fact Registry",
    description: "A global fact registry where AI, search engines, and humans cite the same facts from the same sources",
  },
  nav: {
    registry: "Registry",
    developers: "Developers",
    aiIntegration: "AI Integration",
    suggestTopic: "Suggest Topic",
    admin: "Admin",
  },
  home: {
    heroTitle: "A registry where AI, search, and humans cite the same facts",
    heroSubtitle: "Managing confidence, sources, and verification dates at the claim level",
    searchPlaceholder: "Search by title or category...",
    registeredDocs: "Registered documents",
    noResults: "No results",
    resetSearch: "Reset search",
    noDocs: "No published documents yet.",
    suggestFirst: "Suggest the first topic →",
  },
  claims: {
    needsReview: "Needs review",
    verified: "Verified",
    disputed: "Disputed",
    confidence: "Confidence",
    sources: "Sources",
    lastVerified: "Last verified",
    canCite: "✓ Citable by AI",
    directAnswer: "Direct Answer",
    copyCitation: "Copy Citation",
    copied: "Copied!",
    confidenceLow: "Low",
    confidenceMedium: "Medium",
    confidenceHigh: "High",
    notVerified: "Unverified",
    statusAiDraft: "AI Draft",
    statusPublished: "Published",
    statusArchived: "Archived",
    statusUnknown: "Unknown",
    verificationDate: "Last verified",
    sourceCount: "Sources",
  },
  common: {
    loading: "Loading...",
    error: "An error occurred",
    submit: "Submit",
    cancel: "Cancel",
    save: "Save",
    delete: "Delete",
    edit: "Edit",
    back: "Back",
  },
};

const hi: UITranslations = {
  site: {
    title: "GYEOL",
    subtitle: "वैश्विक तथ्य रजिस्ट्री",
    description: "एक वैश्विक तथ्य रजिस्ट्री जहाँ AI, खोज इंजन और लोग समान स्रोतों से समान तथ्य उद्धृत करते हैं",
  },
  nav: {
    registry: "रजिस्ट्री",
    developers: "डेवलपर्स",
    aiIntegration: "AI एकीकरण",
    suggestTopic: "विषय सुझाएँ",
    admin: "प्रशासक",
  },
  home: {
    heroTitle: "एक रजिस्ट्री जहाँ AI, खोज और मानव समान तथ्य उद्धृत करते हैं",
    heroSubtitle: "दावा स्तर पर विश्वसनीयता, स्रोत और सत्यापन तिथियों का प्रबंधन",
    searchPlaceholder: "शीर्षक या श्रेणी से खोजें...",
    registeredDocs: "पंजीकृत दस्तावेज़",
    noResults: "कोई परिणाम नहीं",
    resetSearch: "खोज रीसेट करें",
    noDocs: "अभी तक कोई प्रकाशित दस्तावेज़ नहीं।",
    suggestFirst: "पहला विषय सुझाएँ →",
  },
  claims: {
    needsReview: "समीक्षा आवश्यक",
    verified: "सत्यापित",
    disputed: "विवादित",
    confidence: "विश्वसनीयता",
    sources: "स्रोत",
    lastVerified: "अंतिम सत्यापन",
    canCite: "✓ AI द्वारा उद्धृत",
    directAnswer: "सीधा जवाब",
    copyCitation: "उद्धरण कॉपी करें",
    copied: "कॉपी हो गया!",
    confidenceLow: "कम",
    confidenceMedium: "मध्यम",
    confidenceHigh: "उच्च",
    notVerified: "असत्यापित",
    statusAiDraft: "AI मसौदा",
    statusPublished: "प्रकाशित",
    statusArchived: "संग्रहीत",
    statusUnknown: "अज्ञात",
    verificationDate: "अंतिम सत्यापन",
    sourceCount: "स्रोत संख्या",
  },
  common: {
    loading: "लोड हो रहा है...",
    error: "एक त्रुटि हुई",
    submit: "जमा करें",
    cancel: "रद्द करें",
    save: "सहेजें",
    delete: "हटाएँ",
    edit: "संपादित करें",
    back: "वापस",
  },
};

const ar: UITranslations = {
  site: {
    title: "GYEOL",
    subtitle: "سجل الحقائق العالمي",
    description: "سجل حقائق عالمي حيث يستشهد الذكاء الاصطناعي ومحركات البحث والبشر بنفس الحقائق من نفس المصادر",
  },
  nav: {
    registry: "السجل",
    developers: "المطورون",
    aiIntegration: "تكامل AI",
    suggestTopic: "اقتراح موضوع",
    admin: "المسؤول",
  },
  home: {
    heroTitle: "سجل حيث يستشهد الذكاء الاصطناعي والبحث والبشر بنفس الحقائق",
    heroSubtitle: "إدارة الثقة والمصادر وتواريخ التحقق على مستوى المطالبة",
    searchPlaceholder: "البحث حسب العنوان أو الفئة...",
    registeredDocs: "المستندات المسجلة",
    noResults: "لا توجد نتائج",
    resetSearch: "إعادة تعيين البحث",
    noDocs: "لا توجد مستندات منشورة بعد.",
    suggestFirst: "اقترح الموضوع الأول →",
  },
  claims: {
    needsReview: "يحتاج مراجعة",
    verified: "تم التحقق",
    disputed: "متنازع عليه",
    confidence: "الثقة",
    sources: "المصادر",
    lastVerified: "آخر تحقق",
    canCite: "✓ قابل للاستشهاد",
    directAnswer: "الإجابة المباشرة",
    copyCitation: "نسخ الاستشهاد",
    copied: "تم النسخ!",
    confidenceLow: "منخفض",
    confidenceMedium: "متوسط",
    confidenceHigh: "عالٍ",
    notVerified: "غير موثق",
    statusAiDraft: "مسودة AI",
    statusPublished: "منشور",
    statusArchived: "مؤرشف",
    statusUnknown: "غير معروف",
    verificationDate: "آخر تحقق",
    sourceCount: "عدد المصادر",
  },
  common: {
    loading: "جاري التحميل...",
    error: "حدث خطأ",
    submit: "إرسال",
    cancel: "إلغاء",
    save: "حفظ",
    delete: "حذف",
    edit: "تعديل",
    back: "رجوع",
  },
};

const es: UITranslations = {
  site: {
    title: "GYEOL",
    subtitle: "Registro Global de Hechos",
    description: "Un registro global de hechos donde la IA, los motores de búsqueda y los humanos citan los mismos hechos de las mismas fuentes",
  },
  nav: {
    registry: "Registro",
    developers: "Desarrolladores",
    aiIntegration: "Integración AI",
    suggestTopic: "Sugerir tema",
    admin: "Administrador",
  },
  home: {
    heroTitle: "Un registro donde la IA, la búsqueda y los humanos citan los mismos hechos",
    heroSubtitle: "Gestionando confianza, fuentes y fechas de verificación a nivel de afirmación",
    searchPlaceholder: "Buscar por título o categoría...",
    registeredDocs: "Documentos registrados",
    noResults: "Sin resultados",
    resetSearch: "Restablecer búsqueda",
    noDocs: "Aún no hay documentos publicados.",
    suggestFirst: "Sugiere el primer tema →",
  },
  claims: {
    needsReview: "Necesita revisión",
    verified: "Verificado",
    disputed: "Disputado",
    confidence: "Confianza",
    sources: "Fuentes",
    lastVerified: "Última verificación",
    canCite: "✓ Citable por IA",
    directAnswer: "Respuesta directa",
    copyCitation: "Copiar cita",
    copied: "¡Copiado!",
    confidenceLow: "Bajo",
    confidenceMedium: "Medio",
    confidenceHigh: "Alto",
    notVerified: "No verificado",
    statusAiDraft: "Borrador IA",
    statusPublished: "Publicado",
    statusArchived: "Archivado",
    statusUnknown: "Desconocido",
    verificationDate: "Última verificación",
    sourceCount: "Fuentes",
  },
  common: {
    loading: "Cargando...",
    error: "Ocurrió un error",
    submit: "Enviar",
    cancel: "Cancelar",
    save: "Guardar",
    delete: "Eliminar",
    edit: "Editar",
    back: "Atrás",
  },
};

const ja: UITranslations = {
  site: {
    title: "GYEOL",
    subtitle: "グローバル・ファクト・レジストリ",
    description: "AI・検索・人間が同じ事実を同じ根拠で引用するグローバル・ファクト・レジストリ",
  },
  nav: {
    registry: "レジストリ",
    developers: "開発者",
    aiIntegration: "AI連携",
    suggestTopic: "トピック提案",
    admin: "管理者",
  },
  home: {
    heroTitle: "AI・検索・人間が同じ事実を引用するレジストリ",
    heroSubtitle: "クレーム単位で信頼度・出典・検証日を管理します",
    searchPlaceholder: "タイトルまたはカテゴリで検索...",
    registeredDocs: "登録済みドキュメント",
    noResults: "結果なし",
    resetSearch: "検索リセット",
    noDocs: "まだ公開されたドキュメントはありません。",
    suggestFirst: "最初のトピックを提案する →",
  },
  claims: {
    needsReview: "確認必要",
    verified: "検証済み",
    disputed: "異議あり",
    confidence: "信頼度",
    sources: "出典",
    lastVerified: "最終検証日",
    canCite: "✓ AI引用可能",
    directAnswer: "直接回答",
    copyCitation: "引用をコピー",
    copied: "コピーしました!",
    confidenceLow: "低",
    confidenceMedium: "中",
    confidenceHigh: "高",
    notVerified: "未検証",
    statusAiDraft: "AI下書き",
    statusPublished: "公開済み",
    statusArchived: "アーカイブ",
    statusUnknown: "不明",
    verificationDate: "最終検証日",
    sourceCount: "出典数",
  },
  common: {
    loading: "読み込み中...",
    error: "エラーが発生しました",
    submit: "送信",
    cancel: "キャンセル",
    save: "保存",
    delete: "削除",
    edit: "編集",
    back: "戻る",
  },
};

const zh: UITranslations = {
  site: {
    title: "GYEOL",
    subtitle: "全球事实注册表",
    description: "AI、搜索引擎和人类从相同来源引用相同事实的全球事实注册表",
  },
  nav: {
    registry: "注册表",
    developers: "开发者",
    aiIntegration: "AI集成",
    suggestTopic: "建议主题",
    admin: "管理员",
  },
  home: {
    heroTitle: "AI、搜索和人类引用相同事实的注册表",
    heroSubtitle: "在声明级别管理可信度、来源和验证日期",
    searchPlaceholder: "按标题或类别搜索...",
    registeredDocs: "已注册文档",
    noResults: "无结果",
    resetSearch: "重置搜索",
    noDocs: "暂无已发布文档。",
    suggestFirst: "建议第一个主题 →",
  },
  claims: {
    needsReview: "待确认",
    verified: "已验证",
    disputed: "有争议",
    confidence: "可信度",
    sources: "来源",
    lastVerified: "最后验证",
    canCite: "✓ 可被AI引用",
    directAnswer: "直接答案",
    copyCitation: "复制引用",
    copied: "已复制!",
    confidenceLow: "低",
    confidenceMedium: "中",
    confidenceHigh: "高",
    notVerified: "未验证",
    statusAiDraft: "AI草稿",
    statusPublished: "已发布",
    statusArchived: "已归档",
    statusUnknown: "未知",
    verificationDate: "最后验证",
    sourceCount: "来源数量",
  },
  common: {
    loading: "加载中...",
    error: "发生错误",
    submit: "提交",
    cancel: "取消",
    save: "保存",
    delete: "删除",
    edit: "编辑",
    back: "返回",
  },
};

const TRANSLATIONS: Record<SupportedLocale, UITranslations> = {
  ko, en, hi, ar, es, ja, zh,
};

export function getTranslations(locale: SupportedLocale): UITranslations {
  return TRANSLATIONS[locale] ?? TRANSLATIONS.ko;
}
