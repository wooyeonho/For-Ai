// lib/i18n/translations.ts
// UI translation strings for all supported languages

import { DEFAULT_LOCALE, isValidLocale } from "./locales";
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
    api: string;
    community: string;
    contribute: string;
    suggestTopic: string;
    admin: string;
    check: string;
  };
  home: {
    heroTitle: string;
    heroSubtitle: string;
    heroEyebrow?: string;
    primaryCta?: string;
    secondaryCta?: string;
    explainerEyebrow?: string;
    explainerTitle?: string;
    explainerBody?: string;
    explainerRegistryBundle?: string;
    explainerCandidate?: string;
    explainerSourceTrust?: string;
    searchPlaceholder: string;
    registeredDocs: string;
    noResults: string;
    resetSearch: string;
    noDocs: string;
    suggestFirst: string;
    aiWrongTitle: string;
    aiWrongCardCta: string;
    aiWrongQuestions: string[];
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
    askAboutFact: string;
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

  topics: {
    [key: string]: string;
    claimLevelTopicRegistry: string; factsSuffix: string; documents: string; verified: string; needsReview: string; stale: string; countryIndex: string; popularFactsByCountry: string; noCountryFacts: string; citableClaims: string; verifiedFacts: string; noVerifiedFacts: string; verificationQueue: string; needsReviewTopics: string; noNeedsReviewTopics: string; freshnessMonitoring: string; staleFacts: string; noStaleFacts: string; missingFact: string; submitMissingFact: string; submitMissingFactDescription: string; submitMissingFactButton: string; otherLanguages: string; oldest: string; verificationDateNeeded: string; topicNotFound: string;
  };
  country: {
    countryRegistry: string; dashboardDescription: string; verifiedFacts: string; needsReviewFacts: string; staleFacts: string; targetFacts: string; questProgress: string; currentCountryTarget: string; progressNote: string; categoryProgress: string; verified: string; stale: string; topNeededSources: string; noMissingSources: string; recentContributors: string; noContributors: string; contribution: string; contributions: string; lastSeen: string; recentlyVerifiedFacts: string; noStaleFacts: string; oldestVerified: string; popularQuestions: string; documents: string; verifiedStatus: string; needsReviewStatus: string; submitSourceCta: string; knowOfficialSource: string; submitSourceDescription: string; submitSource: string; global: string; needsVerification: string; claimCount: string; needsReview: string;
  };
  bounties: {
    [key: string]: string;
    notFound: string; metadataTitle: string; metadataDescription: string; eyebrow: string; title: string; description: string; open: string; sponsoredLabeled: string; contributorsSubmitSourcesOnly: string; policyEyebrow: string; policyTitle: string; availableTasks: string; bountyQueue: string; target: string; sponsoredBounty: string; unsponsoredTask: string; points: string; otherLanguages: string;
  };
  challenges: {
    [key: string]: string;
    metadataTitle: string; metadataDescription: string; eyebrow: string; title: string; directAnswer: string; description: string; rulesTitle: string; ruleAcceptedOnly: string; ruleNoAutoVerification: string; ruleSponsoredLabeled: string; listLabel: string; sponsored: string; challengeId: string; category: string; country: string; window: string; completeSuffix: string; viewDetails: string;
  };
  leaderboard: {
    notFound: string; metadataTitle: string; metadataDescription: string; eyebrow: string; title: string; description: string; acceptedSources: string; verifiedClaims: string; staleFixes: string; countryCoverage: string; rankingEyebrow: string; currentRanking: string; liveDataNotice: string; noEligibleActivity: string; countries: string; categories: string; abuseAdjustedScore: string; acceptedHallucinationReports: string; points: string; moderationPenalties: string; duplicateUrlCap: string; scoringEyebrow: string; criteriaTitle: string; acceptedSourcesRule: string; verifiedClaimsRule: string; staleFixesRule: string; hallucinationReportsRule: string; countryCoverageRule: string; categoryContributionsRule: string; abuseEyebrow: string; spamTitle: string; spamRuleNoRawCount: string; spamRuleRejected: string; spamRuleDuplicate: string; spamRuleHashOnly: string; spamRulePublicPseudonym: string; rewardRules: string; sourceSubmitted: string; sourceAccepted: string; claimVerified: string; hallucinationAccepted: string; viewQuests: string; actionsTitle: string; actionsDescription: string; submitMissingFact: string; liveDataRequired: string; rankingNotYetEnabled: string;
  };
  quests: { [key: string]: string; title: string; };
  compare: { [key: string]: string; title: string; };
  aiWrongAbout: { [key: string]: string; title: string; };
  contributors: {
    [key: string]: string;
    notFound: string; metadataTitle: string; metadataDescription: string; eyebrow: string; title: string; description: string; viewLeaderboard: string; submitMissingFact: string;
  };
  streak: {
    [key: string]: string;
    title: string; current: string; longest: string; activeToday: string; continueToday: string; startToday: string; maxed: string; timezoneNote: string;
  };
  citation: {
    [key: string]: string;
    citationStatusVerified: string; citationStatusNeedsReview: string; citationStatusDisputed: string; citationStatusUnknownValue: string; citationStatusUnavailable: string;
  };
  check: {
    [key: string]: string;
    title: string; description: string; inputLabel: string; inputPlaceholder: string; privacyNote: string; submit: string; submitting: string; cancel: string; resultsHeading: string; summaryVerified: string; summaryNeedsReview: string; summaryDisputed: string; summaryNotFound: string; noMatchNoCandidates: string; noMatchBelowThreshold: string; noMatchNegationMismatch: string; noMatchQuantityMismatch: string; noMatchPolarityMismatch: string; viewSource: string; copySummary: string; copySuccess: string; copyFailure: string; statusIdle: string; statusChecking: string; statusDone: string; errorGeneric: string; errorTextTooLong: string; errorTooManySentences: string; errorNoAnalyzableSentences: string; errorRateLimited: string;
  };
  changelog: {
    [key: string]: string;
    eyebrow: string; title: string; description: string; metadataTitle: string; metadataDescription: string; rssLink: string; verifiedRssLink: string; jsonApiLink: string; eventsHeading: string; noEvents: string; utcNote: string; loadMore: string; fieldLabel: string;
  };
  footer: {
    tagline: string;
    forHumans: string;
    browseRegistry: string;
    suggestTopic: string;
    machineReadable: string;
    community: string;
    apiDocs: string;
    contribute: string;
    sitemap: string;
    robots: string;
    changelog: string;
    feed: string;
    policy: string;
    noCiteWithoutSource: string;
    unknownNeedsVerification: string;
    licenseLabel: string;
    copyrightSuffix: string;
    claimSourceVerified: string;
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


const PAGE_TRANSLATIONS_EN = {
  topics: { claimLevelTopicRegistry: "Claim-level topic registry", factsSuffix: "facts", documents: "documents", verified: "verified", needsReview: "needs review", stale: "stale", countryIndex: "Country index", popularFactsByCountry: "Popular facts by country", noCountryFacts: "No country-specific facts are registered for this category yet. Unknown facts remain Needs verification until a source-backed claim is added.", citableClaims: "Citable claims", verifiedFacts: "Verified facts", noVerifiedFacts: "No fully verified facts are available in this category yet.", verificationQueue: "Verification queue", needsReviewTopics: "Needs review topics", noNeedsReviewTopics: "No topics currently need review in this category.", freshnessMonitoring: "Freshness monitoring", staleFacts: "Stale facts", noStaleFacts: "No stale verified facts are flagged in this category.", missingFact: "Missing fact?", submitMissingFact: "Submit missing fact", submitMissingFactDescription: "If a fact is missing, submit the topic without logging in. For-Ai will keep it as Needs verification until a traceable source and human review are added.", submitMissingFactButton: "Submit a missing {topic} fact", otherLanguages: "Other languages", oldest: "oldest", verificationDateNeeded: "verification date needed", topicNotFound: "Topic not found" },
  country: { countryRegistry: "Country registry", dashboardDescription: "A static-first country dashboard for source-backed For-Ai documents. Counts are derived from the registry index; Supabase-backed rows can be included when the optional index connection is configured.", verifiedFacts: "Verified facts", needsReviewFacts: "Needs review facts", staleFacts: "Stale facts", targetFacts: "Target facts", questProgress: "Quest progress", currentCountryTarget: "to the current country target", progressNote: "Progress = verified claims / target claims. It is a participation signal only; it never replaces source quality, confidence, freshness, or human verification.", categoryProgress: "Category progress", verified: "verified", stale: "stale", topNeededSources: "Top needed sources", noMissingSources: "No missing source needs detected in this country index.", recentContributors: "Recent contributors", noContributors: "Contributor hashes are not yet available for this country. Raw IP addresses are never stored.", contribution: "contribution", contributions: "contributions", lastSeen: "last seen", recentlyVerifiedFacts: "Recently verified facts", noStaleFacts: "No stale facts in this country index.", oldestVerified: "oldest verified", popularQuestions: "Popular questions", documents: "Documents", verifiedStatus: "verified", needsReviewStatus: "needs review", submitSourceCta: "Submit source CTA", knowOfficialSource: "Know an official source for a needed {country} fact?", submitSourceDescription: "Submit a source or topic for {country}. Public submissions start as needs-review candidates and must be human verified before citation.", submitSource: "Submit a source", global: "Global", needsVerification: "Needs verification", claimCount: "claims", needsReview: "needs review" },
  bounties: { notFound: "Bounties not found", metadataTitle: "Claim bounties — For-Ai", metadataDescription: "Source-finding bounties for claim-level facts. Contributors submit source candidates; independent verification decides verified status.", eyebrow: "Claim-level source bounties", title: "Source bounties for verifiable facts", description: "Bounties help contributors find source candidates for claims or topic candidates. They do not buy verification, rankings, or factual conclusions.", open: "open", sponsoredLabeled: "sponsored labeled", contributorsSubmitSourcesOnly: "contributors submit sources only", policyEyebrow: "Non-negotiable policy", policyTitle: "Sponsorship is separate from verification", availableTasks: "Available tasks", bountyQueue: "Bounty queue", target: "target", sponsoredBounty: "Sponsored bounty", unsponsoredTask: "Unsponsored community verification task", points: "pts", otherLanguages: "Other languages" },
  challenges: { metadataTitle: "Community Challenges | For-Ai", metadataDescription: "Community challenges for collecting accepted contribution candidates for claim-level facts without implying automatic verification.", eyebrow: "Community challenges", title: "Collect source-backed candidates without shortcutting verification.", directAnswer: "Challenge progress counts accepted contributions only. Completion never means claims are automatically verified.", description: "Each challenge is a structured intake goal for the For-Ai fact registry. Accepted contributions can help reviewers create or update claims, but verified status still requires source-backed human approval.", rulesTitle: "Non-negotiable progress rules", ruleAcceptedOnly: "Only accepted contributions are reflected in progress.", ruleNoAutoVerification: "Challenge completion is not automatic claim verification.", ruleSponsoredLabeled: "Sponsored challenges are labeled clearly and cannot compromise fact integrity.", listLabel: "Challenge list", sponsored: "Sponsored", challengeId: "Challenge ID", category: "Category", country: "Country", window: "Window", completeSuffix: "complete from accepted contributions only.", viewDetails: "View challenge details" },
  leaderboard: { notFound: "Leaderboard not found", metadataTitle: "Contributor leaderboard | For-Ai", metadataDescription: "For-Ai contributor leaderboard design based on accepted sources, verified claim work, stale claim fixes, accepted hallucination reports, and coverage breadth — never raw submission volume.", eyebrow: "Contributor trust leaderboard", title: "For-Ai leaderboard", description: "This leaderboard rewards accepted, source-backed, claim-level work. It intentionally excludes raw submission count so spam, repeated URLs, and noisy public intake cannot outrank verified contributions.", acceptedSources: "accepted sources", verifiedClaims: "verified claims", staleFixes: "stale fixes", countryCoverage: "country coverage", rankingEyebrow: "Ranked by accepted impact, not volume", currentRanking: "Current ranking", liveDataNotice: "Live contributor rows require the server-side Supabase service role. The public page still renders the scoring policy statically without exposing edits, reports, hallucination_reports, or raw contributor hashes.", noEligibleActivity: "No accepted contributor activity is eligible for ranking yet.", countries: "countries", categories: "categories", abuseAdjustedScore: "abuse-adjusted score", acceptedHallucinationReports: "accepted hallucination reports", points: "pts", moderationPenalties: "moderation penalties", duplicateUrlCap: "duplicate URL cap", scoringEyebrow: "Scoring design", criteriaTitle: "Leaderboard criteria", acceptedSourcesRule: "claim_sources that pass review or are attached to a verified claim. Repeated identical URLs from the same contributor are capped after {limit} credits.", verifiedClaimsRule: "contributor_hash values on verification_events that move claims to verified or record human review of a verified claim.", staleFixesRule: "high-value verification_events that restore stale or low-confidence facts to current verified claims.", hallucinationReportsRule: "only moderated hallucination_reports with status accepted are counted.", countryCoverageRule: "unique countries touched by eligible accepted contributions.", categoryContributionsRule: "unique registry categories touched by eligible accepted contributions.", abuseEyebrow: "Abuse resistance", spamTitle: "Spam prevention rules", spamRuleNoRawCount: "Raw submission count is never part of the score.", spamRuleRejected: "Rejected or spam submissions are excluded and subtract {penalty} points each when visible to server-side moderation queries.", spamRuleDuplicate: "Identical URL submissions by the same contributor_hash receive limited credit to prevent repeated-source farming.", spamRuleHashOnly: "Abuse detection uses contributor_hash only. Raw IP addresses are not stored or displayed.", spamRulePublicPseudonym: "Public output shows pseudonymous contributor labels, not full hashes or private submission rows.", rewardRules: "Reward rules", sourceSubmitted: "Source submitted: 1 point, pending review.", sourceAccepted: "Source accepted: 5 points after admin acceptance.", claimVerified: "Claim verified from contribution: 20 points after admin verification approval.", hallucinationAccepted: "Hallucination report accepted: 10 points after admin acceptance.", viewQuests: "View country quests and badge progress", actionsTitle: "Contribute source-backed facts", actionsDescription: "Submit missing facts without logging in. They remain Needs verification until a traceable source and human approval are recorded.", submitMissingFact: "Submit a missing fact", liveDataRequired: "Live contributor data requires the server-side Supabase service role.", rankingNotYetEnabled: "Ranked scoring is not enabled yet. The criteria and rules below describe how ranking will work once it launches — contribute now and your accepted work will count." },
  quests: { title: "Country quests and badges" },
  compare: { title: "Compare facts" },
  aiWrongAbout: { title: "AI wrong-answer correction route" },
  contributors: { notFound: "Contributors page not found", metadataTitle: "Contributors | For-Ai", metadataDescription: "How For-Ai contributors submit sources, fix stale claims, and earn ranked, abuse-resistant credit for accepted work.", eyebrow: "For-Ai contributor program", title: "Contributors", description: "For-Ai facts stay accurate because contributors submit sources, flag stale claims, and report hallucinated answers. Every credited action is accepted-work only — raw submission volume never counts.", viewLeaderboard: "View the contributor leaderboard", submitMissingFact: "Submit a missing fact" },
  streak: { title: "Your accepted-contribution streak", current: "{days}-day current streak", longest: "{days}-day longest streak", activeToday: "Active today", continueToday: "Continue your streak today", startToday: "Start a streak today", maxed: "Milestone maxed out", timezoneNote: "Streak days are counted by UTC calendar date, not your local time." },
  citation: { citationStatusVerified: "Verified", citationStatusNeedsReview: "Needs review", citationStatusDisputed: "Disputed", citationStatusUnknownValue: "Unknown", citationStatusUnavailable: "Unavailable" },
  check: { title: "Check an AI answer", description: "Paste text from an AI answer to see which sentences match a registry claim and what its current verification status is. This does not judge whether a sentence is true — it only matches sentences against existing registry claims.", inputLabel: "Text to check", inputPlaceholder: "Paste one or more sentences here...", privacyNote: "Your text and the sentences extracted from it are never stored or logged.", submit: "Check text", submitting: "Checking...", cancel: "Cancel", resultsHeading: "Results", summaryVerified: "{count} verified", summaryNeedsReview: "{count} needs review", summaryDisputed: "{count} disputed", summaryNotFound: "{count} not found", noMatchNoCandidates: "No related registry claim was found.", noMatchBelowThreshold: "No registry claim matched closely enough to connect safely.", noMatchNegationMismatch: "A negation difference kept this from being safely connected.", noMatchQuantityMismatch: "A numeric difference kept this from being safely connected.", noMatchPolarityMismatch: "An increase/decrease difference kept this from being safely connected.", viewSource: "View source claim", copySummary: "Copy summary", copySuccess: "Copied", copyFailure: "Copy failed", statusIdle: "Ready", statusChecking: "Checking your text...", statusDone: "Check complete", errorGeneric: "Something went wrong. Please try again.", errorTextTooLong: "Text is too long. Please shorten it and try again.", errorTooManySentences: "Too many sentences. Please check a shorter passage.", errorNoAnalyzableSentences: "No checkable sentences were found in this text.", errorRateLimited: "Too many checks in a short time. Please wait and try again." },
  changelog: { eyebrow: "Discovery metadata", title: "Claim changelog", description: "Every row is a claim-level verification transition. Previous status is computed across the complete event stream before status filters or pagination are applied.", metadataTitle: "Claim changelog | For-Ai", metadataDescription: "Multi-status claim-level verification changelog for For-Ai discovery.", rssLink: "Changelog RSS", verifiedRssLink: "Verified-only RSS", jsonApiLink: "JSON API", eventsHeading: "Events", noEvents: "No changelog events are available yet.", utcNote: "Timestamps are shown in UTC.", loadMore: "Load older events", fieldLabel: "Field" },
};

const PAGE_TRANSLATIONS_KO = {
  ...PAGE_TRANSLATIONS_EN,
  topics: { ...PAGE_TRANSLATIONS_EN.topics, claimLevelTopicRegistry: "Claim-level 토픽 레지스트리", factsSuffix: "facts", documents: "문서", verified: "검증됨", needsReview: "검토 필요", stale: "오래됨", countryIndex: "국가 인덱스", popularFactsByCountry: "국가별 인기 facts", otherLanguages: "다른 언어", topicNotFound: "토픽을 찾을 수 없음" },
  country: { ...PAGE_TRANSLATIONS_EN.country, countryRegistry: "국가 레지스트리", verifiedFacts: "검증된 facts", needsReviewFacts: "검토 필요 facts", staleFacts: "오래된 facts", targetFacts: "목표 facts", categoryProgress: "카테고리 진행률", topNeededSources: "필요한 주요 출처", recentContributors: "최근 기여자", recentlyVerifiedFacts: "최근 검증된 facts", popularQuestions: "인기 질문", documents: "문서", submitSource: "출처 제출", needsVerification: "확인 필요" },
  bounties: { ...PAGE_TRANSLATIONS_EN.bounties, notFound: "바운티를 찾을 수 없음", eyebrow: "Claim-level 출처 바운티", title: "검증 가능한 facts를 위한 출처 바운티", open: "진행 중", sponsoredLabeled: "스폰서 표시됨", otherLanguages: "다른 언어" },
  streak: { ...PAGE_TRANSLATIONS_EN.streak, title: "내 accepted-contribution 스트릭", current: "현재 {days}일 연속", longest: "최장 {days}일 연속", activeToday: "오늘 활동함", continueToday: "오늘 스트릭을 이어가세요", startToday: "오늘 스트릭을 시작하세요", maxed: "마일스톤 최대 달성", timezoneNote: "스트릭 일수는 로컬 시간이 아닌 UTC 기준 날짜로 계산됩니다." },
  citation: { ...PAGE_TRANSLATIONS_EN.citation, citationStatusVerified: "검증됨", citationStatusNeedsReview: "검토 필요", citationStatusDisputed: "이의 제기됨", citationStatusUnknownValue: "알 수 없음", citationStatusUnavailable: "확인 불가" },
  check: { ...PAGE_TRANSLATIONS_EN.check, title: "AI 답변 확인", description: "AI 답변의 문장을 붙여넣으면 레지스트리의 claim과 일치하는지, 현재 검증 상태가 무엇인지 보여줍니다. 문장이 사실인지 판정하지 않습니다 — 기존 레지스트리 claim과의 매칭만 수행합니다.", inputLabel: "확인할 텍스트", inputPlaceholder: "문장을 여기에 붙여넣으세요...", privacyNote: "입력하신 텍스트와 추출된 문장은 저장되거나 기록되지 않습니다.", submit: "텍스트 확인", submitting: "확인 중...", cancel: "취소", resultsHeading: "결과", summaryVerified: "검증됨 {count}건", summaryNeedsReview: "검토 필요 {count}건", summaryDisputed: "이의 제기 {count}건", summaryNotFound: "찾지 못함 {count}건", noMatchNoCandidates: "관련된 레지스트리 claim을 찾지 못했습니다.", noMatchBelowThreshold: "안전하게 연결할 만큼 일치하는 claim이 없습니다.", noMatchNegationMismatch: "부정 표현 차이로 안전하게 연결하지 못했습니다.", noMatchQuantityMismatch: "숫자 표현이 달라 안전하게 연결하지 못했습니다.", noMatchPolarityMismatch: "증가/감소 방향 차이로 안전하게 연결하지 못했습니다.", viewSource: "출처 claim 보기", copySummary: "요약 복사", copySuccess: "복사됨", copyFailure: "복사 실패", statusIdle: "대기 중", statusChecking: "텍스트 확인 중...", statusDone: "확인 완료", errorGeneric: "오류가 발생했습니다. 다시 시도해 주세요.", errorTextTooLong: "텍스트가 너무 깁니다. 줄여서 다시 시도해 주세요.", errorTooManySentences: "문장이 너무 많습니다. 더 짧은 텍스트로 시도해 주세요.", errorNoAnalyzableSentences: "확인할 수 있는 문장을 찾지 못했습니다.", errorRateLimited: "짧은 시간 안에 너무 많이 확인했습니다. 잠시 후 다시 시도해 주세요." },
  changelog: { ...PAGE_TRANSLATIONS_EN.changelog, eyebrow: "검색 메타데이터", title: "Claim 변경 이력", description: "각 행은 claim 단위 검증 상태 전이입니다. 이전 상태는 상태 필터나 페이지네이션을 적용하기 전, 전체 이벤트 스트림 기준으로 계산됩니다.", metadataTitle: "Claim 변경 이력 | For-Ai", metadataDescription: "For-Ai 검색 노출을 위한 다중 상태 claim 단위 검증 변경 이력입니다.", rssLink: "변경 이력 RSS", verifiedRssLink: "검증됨 전용 RSS", jsonApiLink: "JSON API", eventsHeading: "이벤트", noEvents: "아직 표시할 변경 이력 이벤트가 없습니다.", utcNote: "시각은 UTC 기준으로 표시됩니다.", loadMore: "이전 이벤트 더 보기", fieldLabel: "필드" },
};

const CHECK_TRANSLATIONS_HI: UITranslations["check"] = {
  ...PAGE_TRANSLATIONS_EN.check,
  title: "AI उत्तर जाँचें",
  description: "AI उत्तर का पाठ चिपकाएँ और देखें कि कौन-से वाक्य रजिस्ट्री के दावों से मेल खाते हैं तथा उनकी वर्तमान सत्यापन स्थिति क्या है। यह वाक्य की सत्यता तय नहीं करता—सिर्फ मौजूदा रजिस्ट्री दावों से मिलान करता है।",
  inputLabel: "जाँचने के लिए पाठ",
  inputPlaceholder: "यहाँ एक या अधिक वाक्य चिपकाएँ...",
  privacyNote: "आपका पाठ और उससे निकाले गए वाक्य कभी संग्रहीत या लॉग नहीं किए जाते।",
  submit: "पाठ जाँचें", submitting: "जाँच जारी है...", cancel: "रद्द करें", resultsHeading: "परिणाम",
  summaryVerified: "{count} सत्यापित", summaryNeedsReview: "{count} को समीक्षा चाहिए", summaryDisputed: "{count} विवादित", summaryNotFound: "{count} नहीं मिला",
  noMatchNoCandidates: "रजिस्ट्री में कोई संबंधित दावा नहीं मिला।",
  noMatchBelowThreshold: "सुरक्षित रूप से जोड़ने लायक कोई पर्याप्त समान दावा नहीं मिला।",
  noMatchNegationMismatch: "नकार के अंतर के कारण इसे सुरक्षित रूप से नहीं जोड़ा गया।",
  noMatchQuantityMismatch: "संख्या के अंतर के कारण इसे सुरक्षित रूप से नहीं जोड़ा गया।",
  noMatchPolarityMismatch: "बढ़ने या घटने की दिशा अलग होने के कारण इसे सुरक्षित रूप से नहीं जोड़ा गया।",
  viewSource: "स्रोत दावा देखें", copySummary: "सारांश कॉपी करें", copySuccess: "कॉपी हो गया", copyFailure: "कॉपी नहीं हुआ",
  statusIdle: "तैयार", statusChecking: "आपका पाठ जाँचा जा रहा है...", statusDone: "जाँच पूरी हुई",
  errorGeneric: "कुछ गलत हुआ। कृपया फिर प्रयास करें।",
  errorTextTooLong: "पाठ बहुत लंबा है। इसे छोटा करके फिर प्रयास करें।",
  errorTooManySentences: "वाक्य बहुत अधिक हैं। कृपया छोटा पाठ जाँचें।",
  errorNoAnalyzableSentences: "इस पाठ में जाँचने योग्य वाक्य नहीं मिले।",
  errorRateLimited: "कम समय में बहुत अधिक जाँचें हुईं। कृपया थोड़ी देर बाद प्रयास करें।",
};

const CHECK_TRANSLATIONS_AR: UITranslations["check"] = {
  ...PAGE_TRANSLATIONS_EN.check,
  title: "تحقق من إجابة الذكاء الاصطناعي",
  description: "الصق نصًا من إجابة الذكاء الاصطناعي لمعرفة الجمل التي تطابق مطالبة في السجل وحالة التحقق الحالية منها. هذه الأداة لا تحكم على صحة الجملة، بل تطابقها مع المطالبات الموجودة في السجل فقط.",
  inputLabel: "النص المراد التحقق منه", inputPlaceholder: "الصق جملة أو أكثر هنا...",
  privacyNote: "لا يتم تخزين نصك أو الجمل المستخرجة منه أو تسجيلها.",
  submit: "تحقق من النص", submitting: "جارٍ التحقق...", cancel: "إلغاء", resultsHeading: "النتائج",
  summaryVerified: "تم التحقق من {count}", summaryNeedsReview: "{count} بحاجة إلى مراجعة", summaryDisputed: "{count} متنازع عليها", summaryNotFound: "لم يتم العثور على {count}",
  noMatchNoCandidates: "لم يتم العثور على مطالبة مرتبطة في السجل.",
  noMatchBelowThreshold: "لا توجد مطالبة متطابقة بما يكفي للربط الآمن.",
  noMatchNegationMismatch: "حال اختلاف النفي دون الربط الآمن.",
  noMatchQuantityMismatch: "حال اختلاف القيمة الرقمية دون الربط الآمن.",
  noMatchPolarityMismatch: "حال اختلاف اتجاه الزيادة أو النقصان دون الربط الآمن.",
  viewSource: "عرض مطالبة المصدر", copySummary: "نسخ الملخص", copySuccess: "تم النسخ", copyFailure: "تعذر النسخ",
  statusIdle: "جاهز", statusChecking: "جارٍ التحقق من النص...", statusDone: "اكتمل التحقق",
  errorGeneric: "حدث خطأ. يرجى المحاولة مرة أخرى.",
  errorTextTooLong: "النص طويل جدًا. اختصره ثم حاول مرة أخرى.",
  errorTooManySentences: "عدد الجمل كبير جدًا. تحقق من نص أقصر.",
  errorNoAnalyzableSentences: "لم يتم العثور على جمل قابلة للتحقق في هذا النص.",
  errorRateLimited: "تم إجراء عمليات تحقق كثيرة خلال وقت قصير. انتظر قليلًا ثم حاول مرة أخرى.",
};

const CHECK_TRANSLATIONS_ES: UITranslations["check"] = {
  ...PAGE_TRANSLATIONS_EN.check,
  title: "Verificar una respuesta de IA",
  description: "Pega texto de una respuesta de IA para ver qué frases coinciden con una afirmación del registro y cuál es su estado de verificación actual. Esto no decide si una frase es verdadera; solo la compara con afirmaciones existentes en el registro.",
  inputLabel: "Texto para verificar", inputPlaceholder: "Pega una o más frases aquí...",
  privacyNote: "Tu texto y las frases extraídas nunca se almacenan ni se registran.",
  submit: "Verificar texto", submitting: "Verificando...", cancel: "Cancelar", resultsHeading: "Resultados",
  summaryVerified: "{count} verificadas", summaryNeedsReview: "{count} necesitan revisión", summaryDisputed: "{count} disputadas", summaryNotFound: "{count} no encontradas",
  noMatchNoCandidates: "No se encontró ninguna afirmación relacionada en el registro.",
  noMatchBelowThreshold: "Ninguna afirmación coincide lo suficiente para enlazarla con seguridad.",
  noMatchNegationMismatch: "Una diferencia de negación impidió enlazarla con seguridad.",
  noMatchQuantityMismatch: "Una diferencia numérica impidió enlazarla con seguridad.",
  noMatchPolarityMismatch: "Una diferencia en la dirección del aumento o descenso impidió enlazarla con seguridad.",
  viewSource: "Ver afirmación fuente", copySummary: "Copiar resumen", copySuccess: "Copiado", copyFailure: "No se pudo copiar",
  statusIdle: "Listo", statusChecking: "Verificando tu texto...", statusDone: "Verificación completada",
  errorGeneric: "Algo salió mal. Inténtalo de nuevo.",
  errorTextTooLong: "El texto es demasiado largo. Acórtalo e inténtalo de nuevo.",
  errorTooManySentences: "Hay demasiadas frases. Verifica un texto más corto.",
  errorNoAnalyzableSentences: "No se encontraron frases verificables en este texto.",
  errorRateLimited: "Se hicieron demasiadas verificaciones en poco tiempo. Espera e inténtalo de nuevo.",
};

const CHECK_TRANSLATIONS_JA: UITranslations["check"] = {
  ...PAGE_TRANSLATIONS_EN.check,
  title: "AI回答をチェック",
  description: "AI回答の文章を貼り付けると、レジストリのどのclaimに一致するかと、現在の検証ステータスを確認できます。文が正しいかを判定する機能ではなく、既存のレジストリclaimとの照合のみを行います。",
  inputLabel: "チェックする文章", inputPlaceholder: "ここに1つ以上の文を貼り付けてください...",
  privacyNote: "入力した文章と抽出された文は保存も記録もされません。",
  submit: "文章をチェック", submitting: "チェック中...", cancel: "キャンセル", resultsHeading: "結果",
  summaryVerified: "検証済み {count}件", summaryNeedsReview: "要レビュー {count}件", summaryDisputed: "異議あり {count}件", summaryNotFound: "該当なし {count}件",
  noMatchNoCandidates: "関連するレジストリclaimが見つかりませんでした。",
  noMatchBelowThreshold: "安全に関連付けられるほど一致するclaimがありませんでした。",
  noMatchNegationMismatch: "否定表現の違いにより安全に関連付けられませんでした。",
  noMatchQuantityMismatch: "数値の違いにより安全に関連付けられませんでした。",
  noMatchPolarityMismatch: "増減方向の違いにより安全に関連付けられませんでした。",
  viewSource: "出典claimを見る", copySummary: "要約をコピー", copySuccess: "コピーしました", copyFailure: "コピーできませんでした",
  statusIdle: "準備完了", statusChecking: "文章をチェックしています...", statusDone: "チェック完了",
  errorGeneric: "エラーが発生しました。もう一度お試しください。",
  errorTextTooLong: "文章が長すぎます。短くしてもう一度お試しください。",
  errorTooManySentences: "文が多すぎます。短い文章でお試しください。",
  errorNoAnalyzableSentences: "チェックできる文が見つかりませんでした。",
  errorRateLimited: "短時間にチェックが集中しました。しばらく待ってからお試しください。",
};

const CHECK_TRANSLATIONS_ZH: UITranslations["check"] = {
  ...PAGE_TRANSLATIONS_EN.check,
  title: "核查 AI 答案",
  description: "粘贴 AI 答案中的文本，查看哪些句子与注册表中的声明匹配，以及它们当前的验证状态。本功能不判断句子是否正确，只会与注册表中已有的声明进行匹配。",
  inputLabel: "要核查的文本", inputPlaceholder: "在此粘贴一个或多个句子...",
  privacyNote: "您输入的文本和提取出的句子不会被存储或记录。",
  submit: "核查文本", submitting: "正在核查...", cancel: "取消", resultsHeading: "结果",
  summaryVerified: "已验证 {count} 条", summaryNeedsReview: "待审核 {count} 条", summaryDisputed: "有争议 {count} 条", summaryNotFound: "未找到 {count} 条",
  noMatchNoCandidates: "未找到相关的注册表声明。",
  noMatchBelowThreshold: "没有足够匹配、可安全关联的注册表声明。",
  noMatchNegationMismatch: "否定表达不同，无法安全关联。",
  noMatchQuantityMismatch: "数值不同，无法安全关联。",
  noMatchPolarityMismatch: "增减方向不同，无法安全关联。",
  viewSource: "查看来源声明", copySummary: "复制摘要", copySuccess: "已复制", copyFailure: "复制失败",
  statusIdle: "就绪", statusChecking: "正在核查文本...", statusDone: "核查完成",
  errorGeneric: "出现错误，请重试。",
  errorTextTooLong: "文本过长，请缩短后重试。",
  errorTooManySentences: "句子过多，请使用较短的文本。",
  errorNoAnalyzableSentences: "未在文本中找到可核查的句子。",
  errorRateLimited: "短时间内核查次数过多，请稍后重试。",
};

const CHANGELOG_TRANSLATIONS_HI: UITranslations["changelog"] = {
  ...PAGE_TRANSLATIONS_EN.changelog,
  eyebrow: "खोज मेटाडेटा", title: "Claim परिवर्तन इतिहास",
  description: "हर पंक्ति एक claim-स्तरीय सत्यापन स्थिति परिवर्तन है। स्थिति फ़िल्टर या पेजिनेशन लागू करने से पहले, पिछली स्थिति पूरी इवेंट श्रृंखला के आधार पर परिकलित की जाती है।",
  metadataTitle: "Claim परिवर्तन इतिहास | For-Ai", metadataDescription: "For-Ai खोज के लिए बहु-स्थिति claim-स्तरीय सत्यापन परिवर्तन इतिहास।",
  rssLink: "परिवर्तन इतिहास RSS", verifiedRssLink: "केवल सत्यापित RSS", jsonApiLink: "JSON API",
  eventsHeading: "इवेंट", noEvents: "अभी तक कोई परिवर्तन इतिहास इवेंट उपलब्ध नहीं है।",
  utcNote: "समय UTC में दिखाया गया है।", loadMore: "पुराने इवेंट देखें", fieldLabel: "फ़ील्ड",
};

const CHANGELOG_TRANSLATIONS_AR: UITranslations["changelog"] = {
  ...PAGE_TRANSLATIONS_EN.changelog,
  eyebrow: "بيانات وصفية للاكتشاف", title: "سجل تغييرات المطالبات",
  description: "يمثل كل صف تحوّل حالة تحقق على مستوى المطالبة. تُحسب الحالة السابقة عبر سلسلة الأحداث الكاملة قبل تطبيق مرشحات الحالة أو الترقيم.",
  metadataTitle: "سجل تغييرات المطالبات | For-Ai", metadataDescription: "سجل تغييرات تحقق متعدد الحالات على مستوى المطالبة لاكتشاف For-Ai.",
  rssLink: "خلاصة RSS لسجل التغييرات", verifiedRssLink: "خلاصة RSS للمُتحقَّق منه فقط", jsonApiLink: "واجهة JSON",
  eventsHeading: "الأحداث", noEvents: "لا توجد أحداث سجل تغييرات متاحة بعد.",
  utcNote: "تُعرض الأوقات بتوقيت UTC.", loadMore: "عرض الأحداث الأقدم", fieldLabel: "الحقل",
};

const CHANGELOG_TRANSLATIONS_ES: UITranslations["changelog"] = {
  ...PAGE_TRANSLATIONS_EN.changelog,
  eyebrow: "Metadatos de descubrimiento", title: "Registro de cambios de claims",
  description: "Cada fila es una transición de estado de verificación a nivel de claim. El estado anterior se calcula sobre todo el flujo de eventos antes de aplicar filtros de estado o paginación.",
  metadataTitle: "Registro de cambios de claims | For-Ai", metadataDescription: "Registro de cambios de verificación a nivel de claim con múltiples estados para el descubrimiento de For-Ai.",
  rssLink: "RSS del registro de cambios", verifiedRssLink: "RSS solo verificados", jsonApiLink: "API JSON",
  eventsHeading: "Eventos", noEvents: "Todavía no hay eventos de registro de cambios disponibles.",
  utcNote: "Las horas se muestran en UTC.", loadMore: "Cargar eventos anteriores", fieldLabel: "Campo",
};

const CHANGELOG_TRANSLATIONS_JA: UITranslations["changelog"] = {
  ...PAGE_TRANSLATIONS_EN.changelog,
  eyebrow: "検出用メタデータ", title: "Claim変更履歴",
  description: "各行はclaim単位の検証ステータス遷移です。以前のステータスは、ステータスフィルターやページネーションを適用する前に、イベントストリーム全体を基に計算されます。",
  metadataTitle: "Claim変更履歴 | For-Ai", metadataDescription: "For-Aiの検出用の複数ステータスclaim単位検証変更履歴です。",
  rssLink: "変更履歴RSS", verifiedRssLink: "検証済みのみRSS", jsonApiLink: "JSON API",
  eventsHeading: "イベント", noEvents: "表示できる変更履歴イベントはまだありません。",
  utcNote: "時刻はUTCで表示されます。", loadMore: "過去のイベントを読み込む", fieldLabel: "フィールド",
};

const CHANGELOG_TRANSLATIONS_ZH: UITranslations["changelog"] = {
  ...PAGE_TRANSLATIONS_EN.changelog,
  eyebrow: "发现元数据", title: "声明变更日志",
  description: "每一行都是一次声明级别的验证状态转换。在应用状态过滤或分页之前，先前状态是基于完整事件流计算得出的。",
  metadataTitle: "声明变更日志 | For-Ai", metadataDescription: "用于 For-Ai 发现的多状态声明级别验证变更日志。",
  rssLink: "变更日志 RSS", verifiedRssLink: "仅已验证 RSS", jsonApiLink: "JSON API",
  eventsHeading: "事件", noEvents: "暂无可显示的变更日志事件。",
  utcNote: "时间以 UTC 显示。", loadMore: "加载更早的事件", fieldLabel: "字段",
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
    api: "API",
    community: "커뮤니티",
    contribute: "기여",
    suggestTopic: "토픽 제안",
    admin: "관리자",
    check: "AI 답변 확인",
  },
  home: {
    heroTitle: "AI가 인용할 facts. 사람이 검증할 claims.",
    heroSubtitle: "AI·검색엔진·사람이 같은 출처를 인용하도록 claim 단위로 신뢰도·출처·검증 상태를 관리합니다.",
    heroEyebrow: "Global claim-level fact registry",
    primaryCta: "Search verified claims",
    secondaryCta: "Submit a source",
    explainerEyebrow: "Registry explainer",
    explainerTitle: "내부 용어는 검증 워크플로를 설명할 때만 사용합니다",
    explainerBody: "For-Ai는 홈 상단에서는 간단한 약속을 말하고, 상세 영역에서 registry bundle, candidate, source trust 같은 운영 용어를 설명합니다.",
    explainerRegistryBundle: "Registry bundle: entity, document, claims, sources, verification events를 함께 읽는 단위입니다.",
    explainerCandidate: "Candidate: 아직 검증되지 않은 claim 또는 topic이며, 확인 필요와 낮은 confidence로 유지됩니다.",
    explainerSourceTrust: "Source trust: 출처 유형, 관찰 시점, 검토 이력을 기준으로 citation readiness를 판단하는 신호입니다.",
    searchPlaceholder: "제목 또는 카테고리 검색...",
    registeredDocs: "등록된 문서",
    noResults: "결과 없음",
    resetSearch: "검색 초기화",
    noDocs: "아직 공개된 문서가 없습니다.",
    suggestFirst: "첫 번째 토픽을 제안해보세요 →",
    aiWrongTitle: "AI가 자주 틀리는 질문으로 시작하기",
    aiWrongCardCta: "이 클레임을 제안하거나 검증하기 →",
    aiWrongQuestions: [
      "여권 재발급 수수료가 지금 얼마야?",
      "전입신고는 며칠 안에 해야 해?",
      "주민등록증 재발급 수수료는 무료야?",
      "자동차세 납부 기간은 언제야?",
    ],
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
    askAboutFact: "이 팩트에 대해 질문하기",
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
  ...PAGE_TRANSLATIONS_KO,
  footer: {
    tagline: "AI·검색엔진·사람이 같은 사실을 같은 근거로 인용하도록 만드는 글로벌 claim-level 사실 레지스트리. 확인되지 않은 정보는 추측하지 않고 \"확인 필요\"로 남깁니다.",
    forHumans: "사람용",
    browseRegistry: "레지스트리 둘러보기",
    suggestTopic: "토픽 제안",
    machineReadable: "기계 판독",
    community: "커뮤니티",
    apiDocs: "API 문서",
    contribute: "기여",
    sitemap: "사이트맵",
    robots: "robots.txt",
    changelog: "변경 이력",
    feed: "RSS 피드",
    policy: "정책",
    noCiteWithoutSource: "출처 없는 사실은 인용 불가",
    unknownNeedsVerification: "Unknown = \"확인 필요\"",
    licenseLabel: "라이선스: forai-data-license-v0.1",
    copyrightSuffix: "글로벌 팩트 레지스트리",
    claimSourceVerified: "claim · confidence · source · verified_at",
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
    api: "API",
    community: "Community",
    contribute: "Contribute",
    suggestTopic: "Suggest Topic",
    admin: "Admin",
    check: "Check an AI answer",
  },
  home: {
    heroTitle: "Facts AI can cite. Claims humans can verify.",
    heroSubtitle: "For-Ai keeps facts at claim level with confidence, sources, and verification status so AI, search engines, and humans can cite the same evidence.",
    heroEyebrow: "Global claim-level fact registry",
    primaryCta: "Search verified claims",
    secondaryCta: "Submit a source",
    explainerEyebrow: "Registry explainer",
    explainerTitle: "Operational terms belong below the headline",
    explainerBody: "The hero states the promise in plain language. The explainer can define registry bundle, candidate, and source trust for people who want the workflow details.",
    explainerRegistryBundle: "Registry bundle: the entity, document, claims, sources, and verification events read together.",
    explainerCandidate: "Candidate: an unverified claim or topic that stays Needs verification with low confidence until reviewed.",
    explainerSourceTrust: "Source trust: signals from source type, observation time, and review history that inform citation readiness.",
    searchPlaceholder: "Search by title or category...",
    registeredDocs: "Registered documents",
    noResults: "No results",
    resetSearch: "Reset search",
    noDocs: "No published documents yet.",
    suggestFirst: "Suggest the first topic →",
    aiWrongTitle: "Start from questions AI often gets wrong",
    aiWrongCardCta: "Submit or verify this claim →",
    aiWrongQuestions: [
      "How much is a passport reissue fee right now?",
      "How many days do I have to file a move-in report?",
      "Is a resident ID card reissue free?",
      "When is the vehicle tax payment window?",
    ],
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
    askAboutFact: "Ask a question about this fact",
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
  ...PAGE_TRANSLATIONS_EN,
  footer: {
    tagline: "A global claim-level fact registry where AI, search engines, and humans cite the same facts from the same sources. Unverified information is marked as \"Needs verification\" (\"확인 필요\") instead of guessing.",
    forHumans: "For humans",
    browseRegistry: "Browse registry",
    suggestTopic: "Suggest topic",
    machineReadable: "Machine-readable",
    community: "Community",
    apiDocs: "API docs",
    contribute: "Contribute",
    sitemap: "sitemap.xml",
    robots: "robots.txt",
    changelog: "Changelog",
    feed: "RSS feed",
    policy: "Policy",
    noCiteWithoutSource: "Facts without sources cannot be cited",
    unknownNeedsVerification: "Unknown = \"Needs verification\"",
    licenseLabel: "License: forai-data-license-v0.1",
    copyrightSuffix: "Global Fact Registry",
    claimSourceVerified: "claim · confidence · source · verified_at",
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
    api: "API",
    community: "समुदाय",
    contribute: "योगदान दें",
    suggestTopic: "विषय सुझाएँ",
    admin: "प्रशासक",
    check: "AI उत्तर जाँचें",
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
    aiWrongTitle: "उन सवालों से शुरू करें जिनमें AI अक्सर गलत होता है",
    aiWrongCardCta: "यह दावा सुझाएँ या सत्यापित करें →",
    aiWrongQuestions: [
      "पासपोर्ट पुनः जारी करने का शुल्क अभी कितना है?",
      "निवास परिवर्तन की सूचना कितने दिनों में देनी होती है?",
      "क्या पहचान पत्र पुनः जारी करना निःशुल्क है?",
      "वाहन कर भुगतान की अवधि कब है?",
    ],
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
    askAboutFact: "इस तथ्य के बारे में प्रश्न पूछें",
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
  ...PAGE_TRANSLATIONS_EN,
  check: CHECK_TRANSLATIONS_HI,
  changelog: CHANGELOG_TRANSLATIONS_HI,
  footer: {
    tagline: "एक स्थानीय तथ्य रजिस्ट्री जहाँ AI, खोज इंजन और लोग समान स्रोतों से समान तथ्य उद्धृत करते हैं। असत्यापित जानकारी को अनुमान लगाने के बजाय \"सत्यापन आवश्यक\" (\"확인 필요\") के रूप में चिह्नित किया जाता है।",
    forHumans: "लोगों के लिए",
    browseRegistry: "रजिस्ट्री ब्राउज़ करें",
    suggestTopic: "विषय सुझाएँ",
    machineReadable: "मशीन-पठनीय",
    community: "समुदाय",
    apiDocs: "API दस्तावेज़",
    contribute: "योगदान करें",
    sitemap: "sitemap.xml",
    robots: "robots.txt",
    changelog: "परिवर्तन इतिहास",
    feed: "RSS फीड",
    policy: "नीति",
    noCiteWithoutSource: "स्रोत के बिना तथ्यों को उद्धृत नहीं किया जा सकता",
    unknownNeedsVerification: "Unknown = \"सत्यापन आवश्यक\"",
    licenseLabel: "लाइसेंस: forai-data-license-v0.1",
    copyrightSuffix: "वैश्विक तथ्य रजिस्ट्री",
    claimSourceVerified: "claim · confidence · source · verified_at",
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
    api: "API",
    community: "المجتمع",
    contribute: "المساهمة",
    suggestTopic: "اقتراح موضوع",
    admin: "المسؤول",
    check: "تحقق من إجابة AI",
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
    aiWrongTitle: "ابدأ من الأسئلة التي يخطئ فيها الذكاء الاصطناعي غالبًا",
    aiWrongCardCta: "اقترح هذا الادعاء أو تحقق منه ←",
    aiWrongQuestions: [
      "كم تبلغ رسوم إعادة إصدار جواز السفر الآن؟",
      "خلال كم يومًا يجب الإبلاغ عن تغيير السكن؟",
      "هل إعادة إصدار بطاقة الهوية مجانية؟",
      "متى فترة سداد ضريبة المركبات؟",
    ],
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
    askAboutFact: "اطرح سؤالًا حول هذه الحقيقة",
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
  ...PAGE_TRANSLATIONS_EN,
  check: CHECK_TRANSLATIONS_AR,
  changelog: CHANGELOG_TRANSLATIONS_AR,
  footer: {
    tagline: "سجل حقائق محلي حيث يستشهد الذكاء الاصطناعي ومحركات البحث والبشر بنفس الحقائق من نفس المصادر. المعلومات غير الموثقة تُعلَّم بـ \"بحاجة إلى تحقق\" (\"확인 필요\") بدلاً من التخمين.",
    forHumans: "للبشر",
    browseRegistry: "تصفح السجل",
    suggestTopic: "اقتراح موضوع",
    machineReadable: "قابل للقراءة آليًا",
    community: "المجتمع",
    apiDocs: "وثائق API",
    contribute: "المساهمة",
    sitemap: "sitemap.xml",
    robots: "robots.txt",
    changelog: "سجل التغييرات",
    feed: "خلاصة RSS",
    policy: "السياسة",
    noCiteWithoutSource: "لا يمكن الاستشهاد بحقائق بدون مصادر",
    unknownNeedsVerification: "Unknown = \"بحاجة إلى تحقق\"",
    licenseLabel: "الترخيص: forai-data-license-v0.1",
    copyrightSuffix: "سجل الحقائق العالمي",
    claimSourceVerified: "claim · confidence · source · verified_at",
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
    api: "API",
    community: "Comunidad",
    contribute: "Contribuir",
    suggestTopic: "Sugerir tema",
    admin: "Administrador",
    check: "Verificar respuesta de IA",
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
    aiWrongTitle: "Empieza por las preguntas que la IA suele responder mal",
    aiWrongCardCta: "Propón o verifica esta afirmación →",
    aiWrongQuestions: [
      "¿Cuánto cuesta ahora reponer un pasaporte?",
      "¿En cuántos días debo declarar el cambio de domicilio?",
      "¿Es gratuita la reposición del documento de identidad?",
      "¿Cuándo es el plazo para pagar el impuesto vehicular?",
    ],
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
    askAboutFact: "Haz una pregunta sobre este hecho",
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
  ...PAGE_TRANSLATIONS_EN,
  check: CHECK_TRANSLATIONS_ES,
  changelog: CHANGELOG_TRANSLATIONS_ES,
  footer: {
    tagline: "Un registro local de hechos donde la IA, los motores de búsqueda y los humanos citan los mismos hechos de las mismas fuentes. La información no verificada se marca como \"Verificación pendiente\" (\"확인 필요\") en lugar de adivinar.",
    forHumans: "Para humanos",
    browseRegistry: "Explorar registro",
    suggestTopic: "Sugerir tema",
    machineReadable: "Legible por máquina",
    community: "Comunidad",
    apiDocs: "Documentación API",
    contribute: "Contribuir",
    sitemap: "sitemap.xml",
    robots: "robots.txt",
    changelog: "Registro de cambios",
    feed: "Feed RSS",
    policy: "Política",
    noCiteWithoutSource: "Los hechos sin fuentes no pueden ser citados",
    unknownNeedsVerification: "Unknown = \"Verificación pendiente\"",
    licenseLabel: "Licencia: forai-data-license-v0.1",
    copyrightSuffix: "Registro Global de Hechos",
    claimSourceVerified: "claim · confidence · source · verified_at",
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
    api: "API",
    community: "コミュニティ",
    contribute: "貢献",
    suggestTopic: "トピック提案",
    admin: "管理者",
    check: "AI回答をチェック",
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
    aiWrongTitle: "AIがよく間違える質問から始める",
    aiWrongCardCta: "このクレームを提案・検証する →",
    aiWrongQuestions: [
      "パスポート再発行の手数料は今いくら?",
      "転入届は何日以内に必要?",
      "住民登録証の再発行は無料?",
      "自動車税の納付期間はいつ?",
    ],
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
    askAboutFact: "このファクトについて質問する",
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
  ...PAGE_TRANSLATIONS_EN,
  check: CHECK_TRANSLATIONS_JA,
  changelog: CHANGELOG_TRANSLATIONS_JA,
  footer: {
    tagline: "AI・検索エンジン・人間が同じ事実を同じ根拠で引用するローカル・ファクト・レジストリ。未確認情報は推測せず「要確認」（\"확인 필요\"）として残します。",
    forHumans: "人間向け",
    browseRegistry: "レジストリを見る",
    suggestTopic: "トピック提案",
    machineReadable: "機械可読",
    community: "コミュニティ",
    apiDocs: "APIドキュメント",
    contribute: "貢献",
    sitemap: "sitemap.xml",
    robots: "robots.txt",
    changelog: "変更履歴",
    feed: "RSSフィード",
    policy: "ポリシー",
    noCiteWithoutSource: "出典のない事実は引用不可",
    unknownNeedsVerification: "Unknown = \"要確認\"",
    licenseLabel: "ライセンス: forai-data-license-v0.1",
    copyrightSuffix: "グローバル・ファクト・レジストリ",
    claimSourceVerified: "claim · confidence · source · verified_at",
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
    api: "API",
    community: "社区",
    contribute: "贡献",
    suggestTopic: "建议主题",
    admin: "管理员",
    check: "核查AI答案",
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
    aiWrongTitle: "从 AI 常答错的问题开始",
    aiWrongCardCta: "提交或验证此声明 →",
    aiWrongQuestions: [
      "现在护照补办费用是多少?",
      "迁入登记需要在几天内办理?",
      "居民身份证补办免费吗?",
      "车辆税的缴纳期限是什么时候?",
    ],
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
    askAboutFact: "就此事实提问",
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
  ...PAGE_TRANSLATIONS_EN,
  check: CHECK_TRANSLATIONS_ZH,
  changelog: CHANGELOG_TRANSLATIONS_ZH,
  footer: {
    tagline: "AI、搜索引擎和人类从相同来源引用相同事实的本地事实注册表。未验证的信息标记为“待核实”（\"확인 필요\"）而不是猜测。",
    forHumans: "面向用户",
    browseRegistry: "浏览注册表",
    suggestTopic: "建议主题",
    machineReadable: "机器可读",
    community: "社区",
    apiDocs: "API 文档",
    contribute: "贡献",
    sitemap: "sitemap.xml",
    robots: "robots.txt",
    changelog: "变更日志",
    feed: "RSS 订阅",
    policy: "政策",
    noCiteWithoutSource: "无来源的事实不可引用",
    unknownNeedsVerification: "Unknown = “待核实”",
    licenseLabel: "许可证: forai-data-license-v0.1",
    copyrightSuffix: "全球事实注册表",
    claimSourceVerified: "claim · confidence · source · verified_at",
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


export function getLocaleFromPathname(pathname: string): SupportedLocale {
  const firstSegment = pathname.split("/").filter(Boolean)[0];
  return firstSegment && isValidLocale(firstSegment) ? firstSegment : DEFAULT_LOCALE;
}

const LOCALE_ROUTE_ROOTS = new Set([
  "ai-wrong-about",
  "compare",
  "contributors",
  "country",
  "entity",
  "leaderboard",
  "topics",
  "wiki",
]);

function hasLocaleRoute(pathname: string): boolean {
  const firstSegment = pathname.split("/").filter(Boolean)[0];
  return Boolean(firstSegment && LOCALE_ROUTE_ROOTS.has(firstSegment));
}

export function withLocaleLink(pathname: string, href: string): string {
  if (!href.startsWith("/")) return href;

  const locale = getLocaleFromPathname(pathname);
  const hrefUrl = new URL(href, "https://for-ai.local");
  const hrefSegments = hrefUrl.pathname.split("/").filter(Boolean);

  if (hrefSegments[0] && isValidLocale(hrefSegments[0])) {
    return `${hrefUrl.pathname}${hrefUrl.search}${hrefUrl.hash}`;
  }

  if (hasLocaleRoute(hrefUrl.pathname)) {
    return `/${locale}${hrefUrl.pathname}${hrefUrl.search}${hrefUrl.hash}`;
  }

  hrefUrl.searchParams.set("lang", locale);
  return `${hrefUrl.pathname}${hrefUrl.search}${hrefUrl.hash}`;
}
