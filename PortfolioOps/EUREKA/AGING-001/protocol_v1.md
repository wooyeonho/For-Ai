# AGING-001 — Midlife Modifiable-Precursor Protocol v1

RUN_TS: 2026-08-16T02:00:00+09:00
STATUS: ACTIVE — admitted, no result/novelty claim

## Problem
Neurocognitive aging trajectories are heterogeneous, while midlife is underrepresented in open longitudinal neuroimaging resources. A 2026 Scientific Data resource, MIVAC/NKI-RS, was explicitly designed to map aging trajectories beginning in midlife and includes modifiable factors such as cardiorespiratory fitness, sleep and mood.

## Frozen hypothesis class
A within-person change in a modifiable midlife factor (fitness, sleep, or mood), or its interaction with connectome change, predicts subsequent cognitive decline beyond age, sex, baseline cognition and prior cognitive trajectory.

This is a hypothesis class, not a discovery claim.

## Gate Goal
Determine whether an auditable MIVAC longitudinal endpoint and exposure definition supports leakage-safe temporal testing with enough repeated observations for held-out validation.

## Causal / statistical prespecification
1. Time order: exposure/change at t must precede cognitive endpoint at t+1.
2. Baseline comparator: age + sex + baseline cognition + prior cognitive trajectory.
3. Incremental model: baseline comparator + prespecified modifiable factor/connectome feature.
4. Negative controls: future exposure; shuffled within-age-band exposure; non-temporally ordered model.
5. Validation: participant-level split; no scan/session leakage; bootstrap uncertainty; multiplicity correction across hypothesis family.
6. Sensitivity: missingness/IPW or explicit missingness model; scanner/site effects if applicable; attrition analysis.
7. Promotion: effect direction stable in held-out participants and negative controls fail as expected.

## Red-team vetoes
- cross-sectional association presented as longitudinal precursor;
- age confounding explains incremental signal;
- same participant/session appears across train/test;
- result depends on one scanner/site or high-leverage subgroup;
- outcome definition chosen after inspecting effect;
- multiple-testing correction removes signal;
- future-exposure negative control performs similarly.

## Data / provenance gate
Before analysis freeze exact MIVAC release/version, data dictionary, participant/session IDs, acquisition dates, cognitive endpoints, fitness/sleep/mood variables, imaging preprocessing provenance and dataset terms. Hash local analysis manifest and derived tables.

## Team verdicts
- Domain Lead: ADMIT ACTIVE — humanity-scale dementia/healthy-aging relevance and a newly available longitudinal resource.
- Causal/Statistical: PASS protocol, NO RESULT.
- Data Engineering/Provenance: BLOCK until exact release/data dictionary is frozen.
- Reproducibility QA: protocol is deterministic enough for next-gate implementation.
- Visualization/Design: figure deferred until a real longitudinal cohort-flow and endpoint audit exists.
- Novelty/Prior-Art: WATCH — exact precursor claim requires systematic prior-art matrix before testing survivors.
- Legal/Data Rights: dataset-specific terms must be frozen before download/analysis.
- Publication/Commercialization: potential methods/biomarker publication path only after external replication; no clinical diagnostic claims.
- Red Team: strongest risk is age/attrition/scanner confounding and temporal leakage.

## Next Gate
Freeze MIVAC release + dictionary; build executable cohort/temporal-leakage audit; compute eligible participant/session counts before any model fitting.
