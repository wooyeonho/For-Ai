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
    unknownLabel: string;
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
  wiki: {
    claimRegistry: string;
    aiGenerated: string;
    whyPeopleAsk: string;
    citationStatus: string;
    citationDocument: string;
    citationReadyClaims: string;
    doNotCiteUnknown: string;
    doNotCiteLow: string;
    machineReadable: string;
    technicalMeta: string;
    otherLanguages: string;
    license: string;
    noClaims: string;
    claims: string;
    correctionReport: string;
    hallucinationReport: string;
    diagnostics: string;
governmentFeeDisclaimer: string;
    languagePolicy: string;
    canonicalSlugPolicy: string;
    localizedTitlePolicy: string;
    sourceLanguagePolicy: string;
    translatedClaimPolicy: string;
    machineTranslationWarning: string;
    translationStatusMachine: string;
    translationStatusHuman: string;
    originalClaim: string;
  };
  footer: {
    tagline: string;
    forHumans: string;
    browseRegistry: string;
    suggestTopic: string;
    machineReadable: string;
    policy: string;
    licenseLabel: string;
    noCiteWithoutSource: string;
  };
  actionForms: {
    documentNotFound: string;
    correctionEyebrow: string;
    hallucinationEyebrow: string;
    diagnosticsEyebrow: string;
    submittedTitle: string;
    reportSubmittedBody: string;
    hallucinationSubmittedBody: string;
    defaultReportTitle: string;
    defaultReportDescription: string;
    sourceReportTitle: string;
    sourceReportDescription: string;
    notifyReportTitle: string;
    notifyReportDescription: string;
    sourceHumanReviewNote: string;
    privacyTitle: string;
    reportPrivacyBody: string;
    hallucinationPrivacyBody: string;
    sourceContribution: string;
    sourceNotes: string;
    officialSource: string;
    sourcePlaceholder: string;
    submitSourceCandidate: string;
    sourceSuccess: string;
    notificationRequest: string;
    optionalRelatedSource: string;
    notifyPlaceholder: string;
    requestNotification: string;
    notifySuccess: string;
    correctionReport: string;
    correctionMessage: string;
    optionalSource: string;
    correctionPlaceholder: string;
    submitCorrection: string;
    correctionSuccess: string;
    submitFailed: string;
    networkError: string;
    backToDocument: string;
    claimSelect: string;
    wholeDocument: string;
    sourceTitle: string;
    citationText: string;
    contributionPointsNotice: string;
    submitting: string;
    aiService: string;
    prompt: string;
    aiAnswer: string;
    expectedCorrection: string;
    aiServicePlaceholder: string;
    promptPlaceholder: string;
    aiAnswerPlaceholder: string;
    expectedCorrectionPlaceholder: string;
    hallucinationFormTitle: string;
    hallucinationFormDescription: string;
    submitHallucination: string;
    diagnosticsChecklist: string;
    machineReadableOutputs: string;
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

const ACTION_FORM_TRANSLATIONS = {
  documentNotFound: "요청한 문서를 찾을 수 없습니다.",
  correctionEyebrow: "Correction report",
  hallucinationEyebrow: "AI hallucination report",
  diagnosticsEyebrow: "Goal 7 · AI-readiness diagnostics",
  submittedTitle: "제출되었습니다",
  reportSubmittedBody: "정정 요청이 접수 대기 상태로 처리되었습니다. 현재 MVP에서는 저장소에 기록하지 않는 안전한 stub 응답입니다.",
  hallucinationSubmittedBody: "AI 오답 신고가 접수 대기 상태로 처리되었습니다. 현재 MVP에서는 저장소에 기록하지 않는 안전한 stub 응답입니다.",
  defaultReportTitle: "정정 요청",
  defaultReportDescription: "확인이 필요한 claim에 대해 정정 요청을 남겨주세요. 로그인은 필요하지 않습니다.",
  sourceReportTitle: "Submit an official source.",
  sourceReportDescription: "Submit an official source URL or citation for human review. This public correction flow does not immediately verify the claim.",
  notifyReportTitle: "Get notified when verified.",
  notifyReportDescription: "Leave a note that you want updates for this claim. The current MVP stores this as a queued correction request, not as a verified fact.",
  sourceHumanReviewNote: "Official sources are reviewed by humans before any claim status changes to verified.",
  privacyTitle: "Privacy notice",
  reportPrivacyBody: "Raw IP addresses are never stored. This MVP uses contributor_hash only and does not expose public read access to reports.",
  hallucinationPrivacyBody: "Raw IP addresses are never stored. This MVP uses contributor_hash only and does not expose public read access to hallucination reports.",
  sourceContribution: "Source contribution",
  sourceNotes: "Source notes",
  officialSource: "Official source URL or citation",
  sourcePlaceholder: "Explain which claim this source supports. Unknown facts remain Needs verification until human review.",
  submitSourceCandidate: "Submit source candidate",
  sourceSuccess: "출처 후보가 접수되었습니다. 낮은 기본 점수만 기록되며, claim truth는 관리자 검증으로만 결정됩니다.",
  notificationRequest: "Notification request",
  optionalRelatedSource: "Optional related source URL",
  notifyPlaceholder: "Which claim should we notify you about when it is verified? Do not include sensitive personal information.",
  requestNotification: "Request notification",
  notifySuccess: "알림 요청이 접수되었습니다. 검토 큐에 안전하게 기록됩니다.",
  correctionReport: "Correction report",
  correctionMessage: "정정 요청 내용",
  optionalSource: "Optional source URL or citation",
  correctionPlaceholder: "어떤 claim이 정정되어야 하는지, 근거가 있다면 함께 알려주세요.",
  submitCorrection: "정정 요청 제출",
  correctionSuccess: "신고가 접수되었습니다. 검토 후 반영됩니다.",
  submitFailed: "제출 실패",
  networkError: "네트워크 오류. 잠시 후 다시 시도해 주세요.",
  backToDocument: "문서로 돌아가기",
  claimSelect: "Claim 선택",
  wholeDocument: "전체 문서 또는 직접 설명",
  sourceTitle: "Source title / publisher",
  citationText: "Citation text",
  contributionPointsNotice: "점수는 기여 활동 보상일 뿐이며 claim truth, confidence, verified status를 결정하지 않습니다.",
  submitting: "제출 중...",
  aiService: "AI service",
  prompt: "Prompt",
  aiAnswer: "AI answer",
  expectedCorrection: "Expected correction",
  aiServicePlaceholder: "예: ChatGPT, Gemini, Perplexity, other",
  promptPlaceholder: "AI에 입력한 질문 또는 프롬프트",
  aiAnswerPlaceholder: "AI가 생성한 답변",
  expectedCorrectionPlaceholder: "어떤 부분이 잘못되었고 무엇을 확인해야 하는지 적어주세요.",
  hallucinationFormTitle: "AI 오답 신고",
  hallucinationFormDescription: "AI 서비스가 문서와 다른 답변을 생성했다면 신고해 주세요. AI 서비스 이름은 자유 입력입니다.",
  submitHallucination: "AI 오답 신고 제출",
  diagnosticsChecklist: "Diagnostics checklist",
  machineReadableOutputs: "Machine-readable outputs",
};

const ko: UITranslations = {
  site: {
    title: "For-Ai",
    subtitle: "결 · 글로벌 팩트 레지스트리",
    description: "AI 인용을 위한 글로벌 claim-level 사실 레지스트리",
  },
  nav: {
    registry: "레지스트리",
    developers: "개발자",
    aiIntegration: "AI 연동",
    suggestTopic: "토픽 제안",
    admin: "관리자",
  },
  home: {
    heroTitle: "AI가 인용할 수 있는 글로벌 사실 레지스트리",
    heroSubtitle: "AI·검색엔진·사람이 같은 출처에서 같은 사실을 인용하도록 claim 단위로 신뢰도·출처·검증 상태를 관리합니다",
    searchPlaceholder: "제목 또는 카테고리 검색...",
    registeredDocs: "등록된 문서",
    noResults: "결과 없음",
    resetSearch: "검색 초기화",
    noDocs: "아직 공개된 문서가 없습니다.",
    suggestFirst: "첫 번째 토픽을 제안해보세요 →",
  },
  claims: {
    unknownLabel: "확인 필요",
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
  wiki: {
    claimRegistry: "Claim 레지스트리 문서",
    aiGenerated: "For-Ai · AI 생성 및 검토됨",
    whyPeopleAsk: "사람들이 AI에게 묻는 이유",
    citationStatus: "인용 상태",
    citationDocument: "문서:",
    citationReadyClaims: "인용 가능 claim:",
    doNotCiteUnknown: "\"확인 필요\" 값은 사실로 인용하지 마세요.",
    doNotCiteLow: "confidence: low 또는 needs_review 상태의 claim은 인용하지 마세요.",
    machineReadable: "기계 판독 링크",
    technicalMeta: "기술 메타데이터",
    otherLanguages: "다른 언어",
    license: "라이선스",
    noClaims: "등록된 claim이 없습니다.",
    claims: "Claims",
    correctionReport: "정정 보고",
    hallucinationReport: "AI 할루시네이션 보고",
    diagnostics: "AI 준비도 진단",
governmentFeeDisclaimer: "신청 전 항상 공식 정부 출처를 확인하세요.",
    languagePolicy: "언어 정책",
    canonicalSlugPolicy: "slug는 모든 언어에서 안정적인 영어 canonical slug를 유지합니다.",
    localizedTitlePolicy: "title과 UI label은 현재 locale에 맞춰 표시합니다.",
    sourceLanguagePolicy: "claim source는 출처의 원문 언어를 보존합니다.",
    translatedClaimPolicy: "번역 claim은 원문 claim과 연결되어야 합니다.",
    machineTranslationWarning: "이 번역 claim은 human reviewed 전이므로 번역 오류 가능성이 있습니다.",
    translationStatusMachine: "자동 번역",
    translationStatusHuman: "사람 검토 완료",
    originalClaim: "원문 claim",
  },
  actionForms: ACTION_FORM_TRANSLATIONS,
  footer: {
    tagline: "AI·검색엔진·사람이 같은 사실을 같은 근거로 인용하도록 만드는 글로벌 claim-level 사실 레지스트리. 확인되지 않은 정보는 추측하지 않고 \"확인 필요\"로 남깁니다.",
    forHumans: "사람용",
    browseRegistry: "레지스트리 둘러보기",
    suggestTopic: "토픽 제안",
    machineReadable: "기계 판독",
    policy: "정책",
    licenseLabel: "라이선스: forai-data-license-v0.1",
    noCiteWithoutSource: "출처 없는 사실은 인용 불가",
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
    title: "For-Ai",
    subtitle: "Global Fact Registry",
    description: "A global claim-level fact registry for AI citation, search engines, and humans",
  },
  nav: {
    registry: "Registry",
    developers: "Developers",
    aiIntegration: "AI Integration",
    suggestTopic: "Suggest Topic",
    admin: "Admin",
  },
  home: {
    heroTitle: "A global fact registry for AI citation",
    heroSubtitle: "AI, search engines, and humans cite the same facts from the same claim-level sources",
    searchPlaceholder: "Search by title or category...",
    registeredDocs: "Registered documents",
    noResults: "No results",
    resetSearch: "Reset search",
    noDocs: "No published documents yet.",
    suggestFirst: "Suggest the first topic →",
  },
  claims: {
    unknownLabel: "Needs verification",
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
  wiki: {
    claimRegistry: "Claim registry document",
    aiGenerated: "For-Ai · AI generated & reviewed",
    whyPeopleAsk: "Why people ask AI",
    citationStatus: "Citation status",
    citationDocument: "Document:",
    citationReadyClaims: "Citation-ready claims:",
    doNotCiteUnknown: "Do not cite values shown as \"Needs verification\" (\"확인 필요\") as facts.",
    doNotCiteLow: "Do not cite claims with confidence: low or needs_review status.",
    machineReadable: "Machine-readable links",
    technicalMeta: "Technical metadata",
    otherLanguages: "Other languages",
    license: "License",
    noClaims: "No claims registered yet.",
    claims: "Claims",
    correctionReport: "Correction report",
    hallucinationReport: "AI hallucination report",
    diagnostics: "AI-readiness diagnostics",
governmentFeeDisclaimer: "Always check the official government source before applying.",
    languagePolicy: "Language policy",
    canonicalSlugPolicy: "Slugs remain stable English canonical slugs across every locale.",
    localizedTitlePolicy: "Titles and UI labels are displayed per locale.",
    sourceLanguagePolicy: "Claim sources preserve their original source language.",
    translatedClaimPolicy: "Translated claims must stay linked to the original claim.",
    machineTranslationWarning: "This translated claim has not been human reviewed and may contain translation errors.",
    translationStatusMachine: "Machine translated",
    translationStatusHuman: "Human reviewed",
    originalClaim: "Original claim",
  },
  actionForms: ACTION_FORM_TRANSLATIONS,
  footer: {
    tagline: "A global claim-level fact registry where AI, search engines, and humans cite the same facts from the same sources. Unverified information is marked as \"Needs verification\" (\"확인 필요\") instead of guessing.",
    forHumans: "For humans",
    browseRegistry: "Browse registry",
    suggestTopic: "Suggest topic",
    machineReadable: "Machine-readable",
    policy: "Policy",
    licenseLabel: "License: forai-data-license-v0.1",
    noCiteWithoutSource: "Facts without sources cannot be cited",
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
    title: "For-Ai",
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
    unknownLabel: "सत्यापन आवश्यक",
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
  wiki: {
    claimRegistry: "Claim रजिस्ट्री दस्तावेज़",
    aiGenerated: "For-Ai · AI द्वारा निर्मित और समीक्षित",
    whyPeopleAsk: "लोग AI से क्यों पूछते हैं",
    citationStatus: "उद्धरण स्थिति",
    citationDocument: "दस्तावेज़:",
    citationReadyClaims: "उद्धरण-तैयार दावे:",
    doNotCiteUnknown: "\"सत्यापन आवश्यक\" (\"확인 필요\") के रूप में दिखाए गए मानों को तथ्य के रूप में उद्धृत न करें।",
    doNotCiteLow: "confidence: low या needs_review स्थिति वाले दावों को उद्धृत न करें।",
    machineReadable: "मशीन-पठनीय लिंक",
    technicalMeta: "तकनीकी मेटाडेटा",
    otherLanguages: "अन्य भाषाएँ",
    license: "लाइसेंस",
    noClaims: "अभी तक कोई दावा पंजीकृत नहीं है।",
    claims: "दावे",
    correctionReport: "सुधार रिपोर्ट",
    hallucinationReport: "AI भ्रम रिपोर्ट",
    diagnostics: "AI-तत्परता निदान",
governmentFeeDisclaimer: "आवेदन करने से पहले हमेशा आधिकारिक सरकारी स्रोत देखें.",
    languagePolicy: "भाषा नीति",
    canonicalSlugPolicy: "Slug हर locale में स्थिर English canonical slug रहता है।",
    localizedTitlePolicy: "Title और UI label locale के अनुसार दिखाए जाते हैं।",
    sourceLanguagePolicy: "Claim source अपनी मूल स्रोत भाषा बनाए रखते हैं।",
    translatedClaimPolicy: "अनूदित claims मूल claim से जुड़े रहने चाहिए।",
    machineTranslationWarning: "इस अनूदित claim की human review नहीं हुई है और इसमें अनुवाद त्रुटियाँ हो सकती हैं।",
    translationStatusMachine: "मशीन अनूदित",
    translationStatusHuman: "मानव समीक्षा पूर्ण",
    originalClaim: "मूल claim",
  },
  actionForms: ACTION_FORM_TRANSLATIONS,
  footer: {
    tagline: "एक स्थानीय तथ्य रजिस्ट्री जहाँ AI, खोज इंजन और लोग समान स्रोतों से समान तथ्य उद्धृत करते हैं। असत्यापित जानकारी को अनुमान लगाने के बजाय \"सत्यापन आवश्यक\" (\"확인 필요\") के रूप में चिह्नित किया जाता है।",
    forHumans: "लोगों के लिए",
    browseRegistry: "रजिस्ट्री ब्राउज़ करें",
    suggestTopic: "विषय सुझाएँ",
    machineReadable: "मशीन-पठनीय",
    policy: "नीति",
    licenseLabel: "लाइसेंस: forai-data-license-v0.1",
    noCiteWithoutSource: "स्रोत के बिना तथ्यों को उद्धृत नहीं किया जा सकता",
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
    title: "For-Ai",
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
    unknownLabel: "بحاجة إلى تحقق",
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
  wiki: {
    claimRegistry: "وثيقة سجل المطالبات",
    aiGenerated: "For-Ai · تم إنشاؤه ومراجعته بواسطة AI",
    whyPeopleAsk: "لماذا يسأل الناس AI",
    citationStatus: "حالة الاستشهاد",
    citationDocument: "المستند:",
    citationReadyClaims: "المطالبات الجاهزة للاستشهاد:",
    doNotCiteUnknown: "لا تستشهد بالقيم المعروضة كـ \"بحاجة إلى تحقق\" (\"확인 필요\") كحقائق.",
    doNotCiteLow: "لا تستشهد بمطالبات ذات confidence: low أو حالة needs_review.",
    machineReadable: "روابط قابلة للقراءة آليًا",
    technicalMeta: "البيانات الوصفية التقنية",
    otherLanguages: "لغات أخرى",
    license: "الترخيص",
    noClaims: "لم يتم تسجيل أي مطالبات بعد.",
    claims: "المطالبات",
    correctionReport: "تقرير التصحيح",
    hallucinationReport: "تقرير هلوسة AI",
    diagnostics: "تشخيص جاهزية AI",
governmentFeeDisclaimer: "تحقق دائمًا من المصدر الحكومي الرسمي قبل التقديم.",
    languagePolicy: "سياسة اللغة",
    canonicalSlugPolicy: "تبقى slugs معرّفات إنجليزية canonical ثابتة عبر كل locale.",
    localizedTitlePolicy: "تُعرض العناوين وتسميات الواجهة حسب locale.",
    sourceLanguagePolicy: "تحافظ مصادر claim على لغة المصدر الأصلية.",
    translatedClaimPolicy: "يجب ربط claims المترجمة بالclaim الأصلي.",
    machineTranslationWarning: "لم تتم مراجعة هذا claim المترجم بشريًا وقد يحتوي على أخطاء ترجمة.",
    translationStatusMachine: "ترجمة آلية",
    translationStatusHuman: "مراجعة بشرية مكتملة",
    originalClaim: "claim الأصلي",
  },
  actionForms: ACTION_FORM_TRANSLATIONS,
  footer: {
    tagline: "سجل حقائق محلي حيث يستشهد الذكاء الاصطناعي ومحركات البحث والبشر بنفس الحقائق من نفس المصادر. المعلومات غير الموثقة تُعلَّم بـ \"بحاجة إلى تحقق\" (\"확인 필요\") بدلاً من التخمين.",
    forHumans: "للبشر",
    browseRegistry: "تصفح السجل",
    suggestTopic: "اقتراح موضوع",
    machineReadable: "قابل للقراءة آليًا",
    policy: "السياسة",
    licenseLabel: "الترخيص: forai-data-license-v0.1",
    noCiteWithoutSource: "لا يمكن الاستشهاد بحقائق بدون مصادر",
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
    title: "For-Ai",
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
    unknownLabel: "Verificación pendiente",
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
  wiki: {
    claimRegistry: "Documento de registro de claims",
    aiGenerated: "For-Ai · Generado y revisado por IA",
    whyPeopleAsk: "Por qué la gente pregunta a la IA",
    citationStatus: "Estado de citación",
    citationDocument: "Documento:",
    citationReadyClaims: "Claims listos para citar:",
    doNotCiteUnknown: "No cite valores mostrados como \"Verificación pendiente\" (\"확인 필요\") como hechos.",
    doNotCiteLow: "No cite claims con confidence: low o estado needs_review.",
    machineReadable: "Enlaces legibles por máquina",
    technicalMeta: "Metadatos técnicos",
    otherLanguages: "Otros idiomas",
    license: "Licencia",
    noClaims: "Aún no hay claims registrados.",
    claims: "Claims",
    correctionReport: "Informe de corrección",
    hallucinationReport: "Informe de alucinación de IA",
    diagnostics: "Diagnóstico de preparación para IA",
governmentFeeDisclaimer: "Consulta siempre la fuente oficial del gobierno antes de presentar la solicitud.",
    languagePolicy: "Política de idioma",
    canonicalSlugPolicy: "Los slugs se mantienen como slugs canónicos estables en inglés en todos los locales.",
    localizedTitlePolicy: "Los títulos y las etiquetas de UI se muestran por locale.",
    sourceLanguagePolicy: "Las fuentes de claim conservan su idioma original.",
    translatedClaimPolicy: "Los claims traducidos deben estar vinculados al claim original.",
    machineTranslationWarning: "Este claim traducido no ha sido revisado por una persona y puede contener errores de traducción.",
    translationStatusMachine: "Traducción automática",
    translationStatusHuman: "Revisión humana",
    originalClaim: "Claim original",
  },
  actionForms: ACTION_FORM_TRANSLATIONS,
  footer: {
    tagline: "Un registro local de hechos donde la IA, los motores de búsqueda y los humanos citan los mismos hechos de las mismas fuentes. La información no verificada se marca como \"Verificación pendiente\" (\"확인 필요\") en lugar de adivinar.",
    forHumans: "Para humanos",
    browseRegistry: "Explorar registro",
    suggestTopic: "Sugerir tema",
    machineReadable: "Legible por máquina",
    policy: "Política",
    licenseLabel: "Licencia: forai-data-license-v0.1",
    noCiteWithoutSource: "Los hechos sin fuentes no pueden ser citados",
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
    title: "For-Ai",
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
    unknownLabel: "要確認",
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
  wiki: {
    claimRegistry: "Claimレジストリ文書",
    aiGenerated: "For-Ai · AI生成・レビュー済み",
    whyPeopleAsk: "なぜ人々はAIに質問するのか",
    citationStatus: "引用ステータス",
    citationDocument: "ドキュメント:",
    citationReadyClaims: "引用可能なclaim:",
    doNotCiteUnknown: "「要確認」（\"확인 필요\"）と表示された値を事実として引用しないでください。",
    doNotCiteLow: "confidence: lowまたはneeds_reviewステータスのclaimを引用しないでください。",
    machineReadable: "機械可読リンク",
    technicalMeta: "技術メタデータ",
    otherLanguages: "他の言語",
    license: "ライセンス",
    noClaims: "まだclaimが登録されていません。",
    claims: "Claims",
    correctionReport: "訂正レポート",
    hallucinationReport: "AIハルシネーションレポート",
    diagnostics: "AI準備状況診断",
governmentFeeDisclaimer: "申請前に必ず政府の公式情報源を確認してください。",
    languagePolicy: "言語ポリシー",
    canonicalSlugPolicy: "slugは全localeで安定した英語canonical slugを維持します。",
    localizedTitlePolicy: "titleとUI labelはlocaleごとに表示します。",
    sourceLanguagePolicy: "claim sourceは出典の原文言語を保持します。",
    translatedClaimPolicy: "翻訳claimは原文claimに接続されている必要があります。",
    machineTranslationWarning: "この翻訳claimはhuman reviewed前のため、翻訳エラーの可能性があります。",
    translationStatusMachine: "機械翻訳",
    translationStatusHuman: "人間レビュー済み",
    originalClaim: "原文claim",
  },
  actionForms: ACTION_FORM_TRANSLATIONS,
  footer: {
    tagline: "AI・検索エンジン・人間が同じ事実を同じ根拠で引用するローカル・ファクト・レジストリ。未確認情報は推測せず「要確認」（\"확인 필요\"）として残します。",
    forHumans: "人間向け",
    browseRegistry: "レジストリを見る",
    suggestTopic: "トピック提案",
    machineReadable: "機械可読",
    policy: "ポリシー",
    licenseLabel: "ライセンス: forai-data-license-v0.1",
    noCiteWithoutSource: "出典のない事実は引用不可",
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
    title: "For-Ai",
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
    unknownLabel: "待核实",
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
  wiki: {
    claimRegistry: "Claim注册文档",
    aiGenerated: "For-Ai · AI生成并审核",
    whyPeopleAsk: "人们为什么问AI",
    citationStatus: "引用状态",
    citationDocument: "文档:",
    citationReadyClaims: "可引用的claim:",
    doNotCiteUnknown: "请勿将显示为“待核实”（\"확인 필요\"）的值作为事实引用。",
    doNotCiteLow: "请勿引用confidence: low或needs_review状态的claim。",
    machineReadable: "机器可读链接",
    technicalMeta: "技术元数据",
    otherLanguages: "其他语言",
    license: "许可证",
    noClaims: "尚无已注册的claim。",
    claims: "Claims",
    correctionReport: "更正报告",
    hallucinationReport: "AI幻觉报告",
    diagnostics: "AI就绪性诊断",
governmentFeeDisclaimer: "申请前请务必查看政府官方来源。",
    languagePolicy: "语言政策",
    canonicalSlugPolicy: "slug 在所有 locale 中保持稳定的英文 canonical slug。",
    localizedTitlePolicy: "title 和 UI label 按 locale 显示。",
    sourceLanguagePolicy: "claim source 保留来源原文语言。",
    translatedClaimPolicy: "翻译 claim 必须连接到原文 claim。",
    machineTranslationWarning: "此翻译 claim 尚未经过人工审核，可能存在翻译错误。",
    translationStatusMachine: "机器翻译",
    translationStatusHuman: "人工审核",
    originalClaim: "原文 claim",
  },
  actionForms: ACTION_FORM_TRANSLATIONS,
  footer: {
    tagline: "AI、搜索引擎和人类从相同来源引用相同事实的本地事实注册表。未验证的信息标记为“待核实”（\"확인 필요\"）而不是猜测。",
    forHumans: "面向用户",
    browseRegistry: "浏览注册表",
    suggestTopic: "建议主题",
    machineReadable: "机器可读",
    policy: "政策",
    licenseLabel: "许可证: forai-data-license-v0.1",
    noCiteWithoutSource: "无来源的事实不可引用",
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
  return TRANSLATIONS[locale] ?? TRANSLATIONS.en;
}
