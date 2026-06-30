import type { Metadata } from "next";
import Link from "next/link";
import { getDailyMissionPlan, getMissionRewardForStatus } from "@/lib/gamification";

export const dynamic = "force-static";

export const metadata: Metadata = {
  title: "Daily Missions",
  description:
    "Daily For-Ai missions for source-backed claim contributions with separate submission and approval completion rules.",
};

export default async function MissionsPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  const plan = getDailyMissionPlan();

  return (
    <article className="goal-dashboard" aria-labelledby="missions-title">
      <header className="registry-panel goal-hero">
        <p className="eyebrow">Daily mission generator</p>
        <h1 id="missions-title">오늘의 미션: fake facts 없이 검증 큐를 성장시키기</h1>
        <p className="direct-answer-text">
          Missions reward useful submissions lightly, but approval-based rewards are larger and rejected submissions always receive 0 points.
        </p>
        <p>
          Generated for <strong>{plan.date}</strong>. These missions route contributors toward official sources, AI hallucination reports, missing facts, stale-claim fixes, and country/category quests without turning unreviewed submissions into verified truth.
        </p>
      </header>

      <section className="registry-panel" aria-labelledby="reward-policy-title">
        <h2 id="reward-policy-title">Reward policy</h2>
        <div className="goal-metric-grid">
          <div className="goal-metric-card">
            <span>Submission</span>
            <strong>small</strong>
            <small>{plan.rewardPolicy.submission}</small>
          </div>
          <div className="goal-metric-card">
            <span>Approval</span>
            <strong>larger</strong>
            <small>{plan.rewardPolicy.approval}</small>
          </div>
          <div className="goal-metric-card">
            <span>Rejected</span>
            <strong>0</strong>
            <small>{plan.rewardPolicy.rejected}</small>
          </div>
          <div className="goal-metric-card">
            <span>Truth boundary</span>
            <strong>review</strong>
            <small>Mission completion never bypasses claim_sources or verification_events.</small>
          </div>
        </div>
      </section>

      <section className="registry-panel" aria-labelledby="mission-list-title">
        <h2 id="mission-list-title">Daily mission set</h2>
        <div className="mission-grid">
          {plan.missions.map((mission) => (
            <article className="mission-card" key={mission.id}>
              <div className="mission-card-header">
                <span className="badge badge-review">{mission.type.replaceAll("_", " ")}</span>
                <span className="badge badge-pass">target: {mission.targetLabel}</span>
              </div>
              <h3>{mission.title}</h3>
              <p>{mission.description}</p>
              <dl className="meta-grid">
                <div className="meta-item">
                  <dt>Submission completion</dt>
                  <dd>{mission.submissionCompletion}</dd>
                </div>
                <div className="meta-item">
                  <dt>Approval completion</dt>
                  <dd>{mission.approvalCompletion}</dd>
                </div>
                <div className="meta-item">
                  <dt>Rewards</dt>
                  <dd>
                    +{getMissionRewardForStatus(mission, "submission")} submitted / +{getMissionRewardForStatus(mission, "approval")} approved / +{getMissionRewardForStatus(mission, "rejected")} rejected
                  </dd>
                </div>
                <div className="meta-item">
                  <dt>Anti-abuse</dt>
                  <dd>{mission.antiAbuseRule}</dd>
                </div>
              </dl>
              <Link className="btn btn-primary cta-correction" href={mission.actionHref.startsWith("/") ? mission.actionHref.replace("/ko/", `/${locale}/`) : mission.actionHref}>
                Start mission
              </Link>
            </article>
          ))}
        </div>
      </section>
    </article>
  );
}
