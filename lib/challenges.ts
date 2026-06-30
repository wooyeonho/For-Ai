export type ChallengeStatus = "draft" | "active" | "completed" | "archived";

export type CommunityChallenge = {
  challenge_id: string;
  title: string;
  description: string;
  category: string;
  country?: string;
  target_metric: string;
  target_count: number;
  starts_at: string;
  ends_at: string;
  status: ChallengeStatus;
  sponsor_label?: string;
};

export type ChallengeProgress = {
  challenge_id: string;
  accepted_count: number;
  updated_at: string;
};

export type ChallengeWithProgress = CommunityChallenge & {
  progress: ChallengeProgress;
  progress_percent: number;
};

const communityChallenges: CommunityChallenge[] = [
  {
    challenge_id: "global-ai-citation-seed-2026",
    title: "Global AI citation seed challenge",
    description:
      "Add accepted, source-backed contribution candidates for high-impact facts that AI systems frequently answer from stale or incomplete information.",
    category: "global",
    target_metric: "accepted_contributions",
    target_count: 1000,
    starts_at: "2026-06-01T00:00:00Z",
    ends_at: "2026-12-31T23:59:59Z",
    status: "active",
  },
  {
    challenge_id: "transport-fare-claims-2026",
    title: "Transport fare claims challenge",
    description:
      "Collect accepted contribution candidates for fare, transfer, and ticketing claims that need human review before they can become verified facts.",
    category: "transport",
    country: "GLOBAL",
    target_metric: "accepted_contributions",
    target_count: 250,
    starts_at: "2026-06-15T00:00:00Z",
    ends_at: "2026-09-30T23:59:59Z",
    status: "active",
    sponsor_label: "Sponsored by For-Ai launch partners",
  },
  {
    challenge_id: "healthcare-hours-claims-2026",
    title: "Healthcare service-hours challenge",
    description:
      "Surface accepted contribution candidates about facility hours and service availability. This is not medical advice and does not verify care recommendations.",
    category: "healthcare",
    country: "GLOBAL",
    target_metric: "accepted_contributions",
    target_count: 150,
    starts_at: "2026-07-01T00:00:00Z",
    ends_at: "2026-10-31T23:59:59Z",
    status: "draft",
  },
];

const challengeProgress: ChallengeProgress[] = [
  {
    challenge_id: "global-ai-citation-seed-2026",
    accepted_count: 126,
    updated_at: "2026-06-29T00:00:00Z",
  },
  {
    challenge_id: "transport-fare-claims-2026",
    accepted_count: 38,
    updated_at: "2026-06-29T00:00:00Z",
  },
  {
    challenge_id: "healthcare-hours-claims-2026",
    accepted_count: 0,
    updated_at: "2026-06-29T00:00:00Z",
  },
];

function progressFor(challenge: CommunityChallenge): ChallengeProgress {
  return challengeProgress.find((progress) => progress.challenge_id === challenge.challenge_id) ?? {
    challenge_id: challenge.challenge_id,
    accepted_count: 0,
    updated_at: challenge.starts_at,
  };
}

export function getCommunityChallenges(): ChallengeWithProgress[] {
  return communityChallenges.map((challenge) => {
    const progress = progressFor(challenge);
    const progressPercent = challenge.target_count > 0
      ? Math.min(100, Math.round((progress.accepted_count / challenge.target_count) * 100))
      : 0;

    return {
      ...challenge,
      progress,
      progress_percent: progressPercent,
    };
  });
}

export function getCommunityChallenge(challengeId: string): ChallengeWithProgress | null {
  return getCommunityChallenges().find((challenge) => challenge.challenge_id === challengeId) ?? null;
}
