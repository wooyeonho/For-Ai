import type { ContributorBadge as ContributorBadgeModel } from "../../lib/gamification";

const tierClassName: Record<ContributorBadgeModel["tier"], string> = {
  bronze: "badge badge-review",
  silver: "badge badge-medium",
  gold: "badge badge-verified",
};

export function ContributorBadge({ badge }: { badge: ContributorBadgeModel }) {
  const status = badge.earned ? "earned" : "locked";

  return (
    <li className="registry-panel" style={{ opacity: badge.earned ? 1 : 0.68 }}>
      <div style={{ display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
        <h3 style={{ margin: 0 }}>{badge.label}</h3>
        <span className={badge.earned ? tierClassName[badge.tier] : "badge"}>
          {badge.tier} · {status}
        </span>
      </div>
      <p style={{ marginBottom: 8 }}>{badge.description}</p>
      <p className="meta-label" style={{ margin: 0 }}>
        {badge.metric}: {badge.currentValue}/{badge.threshold}
      </p>
    </li>
  );
}
