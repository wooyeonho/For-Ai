# Lint warning baseline

**Snapshot date:** 2026-07-15 (stabilization PR, pre-Task-1)
**Baseline count:** 39 warnings, 0 errors
**Enforcement:** `npm run lint` runs `eslint . --max-warnings 39`, so any PR that
adds a new warning fails CI. Fixing existing warnings is welcome; when the count
drops, lower the `--max-warnings` cap in `package.json` and update this file in
the same PR. Never raise the cap to admit new warnings.

These warnings are pre-existing baseline debt from the legacy admin/i18n
surface. Per the Bible v7 baseline rule, they are not treated as regressions in
later Task PRs, but no Task PR may add to them.

## Baseline warnings (39)

| File | Line | Rule | Detail |
|---|---|---|---|
| app/admin/AdminSecretProvider.tsx | 79:9 | react-hooks/exhaustive-deps | 'resetSecret' logical expression could change useCallback deps every render |
| app/admin/diagnostics/page.tsx | 52:6 | react-hooks/exhaustive-deps | useCallback has unnecessary dependency 'secret' |
| app/admin/inbox/page.tsx | 20:10 | @typescript-eslint/no-unused-vars | 'loading' assigned but never used |
| app/admin/new-document/page.tsx | 102:58 | @typescript-eslint/no-unused-vars | 'loginAdmin' assigned but never used |
| app/admin/new-document/page.tsx | 102:70 | @typescript-eslint/no-unused-vars | 'authMessage' assigned but never used |
| app/admin/page.tsx | 147:6 | react-hooks/exhaustive-deps | useMemo has unnecessary dependency 'data.recommendations.length' |
| app/admin/posts/page.tsx | 64:6 | react-hooks/exhaustive-deps | useCallback has unnecessary dependency 'adminSecret' |
| app/admin/review/page.tsx | 7:10 | @typescript-eslint/no-unused-vars | 'AdminSecretField' defined but never used |
| app/admin/review/page.tsx | 161:40 | @typescript-eslint/no-unused-vars | 'resetAdminSecret' assigned but never used |
| app/admin/review/page.tsx | 161:58 | @typescript-eslint/no-unused-vars | 'loginAdmin' assigned but never used |
| app/admin/review/page.tsx | 161:70 | @typescript-eslint/no-unused-vars | 'authMessage' assigned but never used |
| app/admin/review/page.tsx | 191:6 | react-hooks/exhaustive-deps | useCallback has unnecessary dependency 'adminSecret' |
| app/admin/verify-claim/page.tsx | 84:10 | @typescript-eslint/no-unused-vars | 'RecommendationPanel' defined but never used |
| app/admin/verify-claim/page.tsx | 143:31 | @typescript-eslint/no-unused-vars | 'setSelectedDocCategory' assigned but never used |
| app/admin/verify-claim/page.tsx | 144:38 | @typescript-eslint/no-unused-vars | 'setHighRiskSecondConfirmation' assigned but never used |
| app/admin/verify-claim/page.tsx | 205:6 | react-hooks/exhaustive-deps | useCallback has unnecessary dependency 'secret' |
| app/admin/verify-claim/page.tsx | 211:11 | @typescript-eslint/no-unused-vars | 'stale' assigned but never used |
| app/admin/verify-claim/page.tsx | 236:6 | react-hooks/exhaustive-deps | useEffect missing dependency 'openVerify' |
| app/admin/verify-claim/page.tsx | 386:12 | @typescript-eslint/no-unused-vars | 'isClaimStale' defined but never used |
| app/admin/verify-claim/page.tsx | 426:9 | @typescript-eslint/no-unused-vars | 'needsReviewCount' assigned but never used |
| app/admin/verify-claim/page.tsx | 595:15 | @typescript-eslint/no-unused-vars | 'quality' assigned but never used |
| app/api/admin/generate-candidates/route.ts | 68:10 | @typescript-eslint/no-unused-vars | 'selectDefaultProvider' defined but never used |
| app/api/admin/generate-candidates/route.ts | 408:9 | @typescript-eslint/no-unused-vars | 'fallbackUsed' assigned but never used |
| app/api/admin/verify-claim/route.ts | 4:10 | @typescript-eslint/no-unused-vars | 'recordContributionEvent' defined but never used |
| app/api/admin/verify-claim/route.ts | 7:10 | @typescript-eslint/no-unused-vars | 'hasOfficialOrRegulatorSource' defined but never used |
| app/api/admin/verify-claim/route.ts | 65:10 | @typescript-eslint/no-unused-vars | 'claimDate' defined but never used |
| app/api/cite/[slug]/route.ts | 112:9 | @typescript-eslint/no-unused-vars | 'citationPolicyText' assigned but never used |
| app/api/suggest-topic/route.ts | 29:10 | @typescript-eslint/no-unused-vars | 'slugify' defined but never used |
| app/components/ClaimCard.tsx | 30:9 | @typescript-eslint/no-unused-vars | 'readinessLabel' assigned but never used |
| app/components/CorrectionCTA.tsx | 11:9 | @typescript-eslint/no-unused-vars | 'reportHref' assigned but never used |
| app/components/CorrectionCTA.tsx | 12:9 | @typescript-eslint/no-unused-vars | 'sourceHref' assigned but never used |
| app/components/CorrectionCTA.tsx | 13:9 | @typescript-eslint/no-unused-vars | 'notifyHref' assigned but never used |
| app/components/HomePageContent.tsx | 334:10 | @typescript-eslint/no-unused-vars | 'HomeHero' defined but never used |
| app/components/HomePageContent.tsx | 455:9 | @typescript-eslint/no-unused-vars | 'hasCitationData' assigned but never used |
| app/components/LanguageSelector.tsx | 5:80 | @typescript-eslint/no-unused-vars | 'SupportedLocale' defined but never used |
| app/components/SiteHeader.tsx | 7:10 | @typescript-eslint/no-unused-vars | 'DEFAULT_LOCALE' defined but never used |
| app/components/SiteHeader.tsx | 7:26 | @typescript-eslint/no-unused-vars | 'isValidLocale' defined but never used |
| app/components/SiteHeader.tsx | 8:15 | @typescript-eslint/no-unused-vars | 'SupportedLocale' defined but never used |
| scripts/visibility/render-reports.mjs | 169:39 | @typescript-eslint/no-unused-vars | 'segment' defined but never used |
