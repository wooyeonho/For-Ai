# AGING-001 — MIVAC Data/Provenance Gate v1

RUN_TS: 2026-08-16T03:00:00+09:00
STATUS: ACTIVE — provenance advanced; no result/novelty claim

## Gate Goal
Freeze the exact access, longitudinal-design, privacy, quality and rights constraints before any MIVAC model fitting.

## Verified source facts
Source: Scientific Data 2026 article `A longitudinal resource for mapping interindividual variation in the aging connectome` (s41597-026-07746-7) and its official data-access references.

- 400 participants enrolled; 348 completed baseline.
- Baseline ages 38–71 years.
- Repeated measures extend up to four years; COVID-19 interrupted the third annual follow-up period and caused substantial missingness at the fourth timepoint.
- Phenotypic data are long-format CSVs with `custom_ID` linking sessions.
- 77 MIVAC phenotypic instruments are described in downloadable data dictionaries.
- The static dataset used for the paper is referenced by DOI `10.15387/MIVAC`; archived static versions have cumulative changelogs.
- Lite release: de-identified imaging + limited phenotyping, no DUA.
- High-dimensional phenotypic data require the NKI-RS access process/DUA.
- Dataset license: Creative Commons Attribution-NonCommercial (CC BY-NC 4.0); high-dimensional phenotypic data additionally require DUA compliance.
- Data are released without study-specific QC exclusions; researchers must define QC/outlier rules.

## Frozen intake requirements
1. Record exact static MIVAC release/version and changelog.
2. Hash the downloaded phenotypic archive and frozen analysis manifest before transformation.
3. Require `custom_ID`, session/visit identifier, and day-lag/acquisition timing needed to prove exposure precedes outcome.
4. Build a participant × session availability matrix for cognition, VO2/fitness, sleep, mood and imaging.
5. Report eligible N for each hypothesis before model fitting; do not infer 348 longitudinally complete participants from baseline N.
6. Prespecify QC/outlier handling because source data intentionally retain quality variation.
7. Explicitly model/stratify pandemic-era missingness and attrition.

## Legal/Data Rights verdict
PASS FOR NONCOMMERCIAL RESEARCH ONLY, subject to exact release terms and DUA. Commercial reuse is BLOCKED unless separately licensed/authorized. No clinical diagnostic product claim from this dataset alone.

## Reproducibility QA verdict
PASS gate specification; DATA BYTES/VERSION NOT YET HASH-LOCKED.

## Red Team
Primary threats: attrition/COVID missingness, participant/session leakage, age confounding, practice effects, post-hoc endpoint choice, scanner/site or motion effects, and treating baseline N as longitudinal N.

## Publication/Commercialization
Methods/data-availability path is viable once exact release/version and cohort flow are frozen. Publication figures are deferred until a real cohort-flow/endpoint audit exists. Commercialization remains rights-blocked by CC BY-NC/DUA unless separate permission is obtained.

## Next Gate
Acquire/freeze exact MIVAC static release + data dictionary/version; create executable cohort/session temporal-leakage audit and eligible-N table before any predictive model.
