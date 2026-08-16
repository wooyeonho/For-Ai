import type { SupportedLocale } from "./locales";

export type MethodologyStepId = "atomic_claim" | "source_observation" | "human_verification";

type MethodologyLocale = "ko" | "en";

type MethodologyCopy = {
  eyebrow: string;
  title: string;
  intro: string;
  steps: Record<MethodologyStepId, { title: string; body: string }>;
  statusTitle: string;
  statusBody: string;
};

export const METHODOLOGY_STEP_IDS: MethodologyStepId[] = [
  "atomic_claim",
  "source_observation",
  "human_verification",
];

const COPY: Record<MethodologyLocale, MethodologyCopy> = {
  ko: {
    eyebrow: "For-Ai 검증 방법",
    title: "AI가 인용하기 전에, 사람이 검증할 수 있어야 합니다.",
    intro: "For-Ai는 점수보다 claim, source, observation time, review state의 연결을 기본 단위로 삼습니다.",
    steps: {
      atomic_claim: { title: "Claim을 원문 단위로 분리", body: "한 문장에 여러 사실을 섞지 않고 검증 가능한 단위로 나눕니다." },
      source_observation: { title: "출처와 관찰 시점을 함께 저장", body: "출처 URL뿐 아니라 관찰 시점과 어떤 claim을 지지하는지 연결합니다." },
      human_verification: { title: "검증 전에는 verified라고 부르지 않음", body: "출처가 없거나 충돌하면 needs review로 남기고 사람 검토 근거가 있을 때만 verified로 승격합니다." },
    },
    statusTitle: "모르는 것은 모른다고 표시합니다.",
    statusBody: "Needs review, Verified, Stale / conflict를 서로 다른 상태로 유지합니다.",
  },
  en: {
    eyebrow: "For-Ai verification method",
    title: "A claim should be human-verifiable before an AI cites it.",
    intro: "For-Ai connects each claim to its source, observation time, and review state instead of relying on an opaque score.",
    steps: {
      atomic_claim: { title: "Split statements into atomic claims", body: "Do not bundle multiple facts into one statement; keep each claim independently verifiable." },
      source_observation: { title: "Store source and observation time together", body: "Keep the source URL, when it was observed, and which claim it supports." },
      human_verification: { title: "Do not call it verified before review", body: "Missing or conflicting evidence stays in needs review until a human reviews the supporting source." },
    },
    statusTitle: "Unknown stays explicitly unknown.",
    statusBody: "Needs review, Verified, and Stale / conflict remain distinct states.",
  },
};

export function getMethodologyContent(locale: SupportedLocale) {
  const contentLocale: MethodologyLocale = locale === "ko" ? "ko" : "en";
  const copy = COPY[contentLocale];
  return {
    requestedLocale: locale,
    contentLocale,
    fallback: locale !== contentLocale,
    ...copy,
    orderedSteps: METHODOLOGY_STEP_IDS.map((id) => ({ id, ...copy.steps[id] })),
  };
}
