# ESLint warning baseline

The current legacy ESLint warning baseline is **39 warnings**.

This baseline exists only to keep pre-Task 1 stabilization small while preventing new warnings from entering the branch. It is not a quality target.

## Enforcement

`npm run lint` runs `eslint .` and then `scripts/check-eslint-warnings.mjs`.

The guard fails when the warning count rises above 39. If future cleanup lowers the count, update both:

1. `BASELINE_WARNING_COUNT` in `scripts/check-eslint-warnings.mjs`
2. this document

## Current warning categories

- React hook dependency warnings in admin/client components.
- Unused variables/imports in admin, API, and UI surfaces.
- One unused variable in visibility report rendering.

New work should either avoid adding warnings or fix existing warnings while lowering this baseline.
