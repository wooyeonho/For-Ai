"use client";

import { useEffect, useState } from "react";
import { getTranslations } from "../../../lib/i18n";
import type { SupportedLocale } from "../../../lib/i18n";
import { streakMilestoneProgress } from "../../../lib/contributor-streaks";

type StreakResponse = {
  streak: { currentDays: number; longestDays: number; activeOn: string | null } | null;
};

function todayUtc(): string {
  return new Date().toISOString().slice(0, 10);
}

function formatTemplate(template: string, days: number): string {
  return template.replace("{days}", String(days));
}

export default function ContributorStreakWidget({ locale }: { locale: SupportedLocale }) {
  const [streak, setStreak] = useState<StreakResponse["streak"] | "loading">("loading");

  useEffect(() => {
    let cancelled = false;

    fetch("/api/contributions/streak", { cache: "no-store" })
      .then((res) => (res.ok ? (res.json() as Promise<StreakResponse>) : { streak: null }))
      .then((data) => {
        if (!cancelled) setStreak(data.streak);
      })
      .catch(() => {
        if (!cancelled) setStreak(null);
      });

    return () => {
      cancelled = true;
    };
  }, []);

  if (streak === "loading" || streak === null) return null;

  const t = getTranslations(locale).streak;
  const activeToday = streak.activeOn === todayUtc();
  const { progressPercent, maxed } = streakMilestoneProgress(streak.currentDays);
  const statusText = activeToday ? t.activeToday : streak.currentDays > 0 ? t.continueToday : t.startToday;

  return (
    <section className="registry-panel" aria-labelledby="streak-widget-title">
      <div className="streak-widget-header">
        <h2 id="streak-widget-title" style={{ margin: 0 }}>
          {t.title}
        </h2>
        <details className="streak-tooltip">
          <summary aria-label={t.timezoneNote}>UTC</summary>
          <p className="streak-tooltip-note" role="tooltip">
            {t.timezoneNote}
          </p>
        </details>
      </div>

      <div className="streak-status" style={{ marginTop: 8 }}>
        <span className="streak-status-dot" data-active={activeToday} aria-hidden="true" />
        <span>{statusText}</span>
      </div>

      <p style={{ marginTop: 8 }}>
        {formatTemplate(t.current, streak.currentDays)} · {formatTemplate(t.longest, streak.longestDays)}
      </p>

      {maxed ? (
        <p>{t.maxed}</p>
      ) : (
        <div
          className="streak-progress-track"
          role="progressbar"
          aria-valuenow={progressPercent}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-label={t.title}
        >
          <div className="streak-progress-fill" style={{ width: `${progressPercent}%` }} />
        </div>
      )}
    </section>
  );
}
