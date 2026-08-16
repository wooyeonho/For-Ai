# CDR-001 — Scale-up Bottleneck Transition Program v1

RUN_TS: 2026-08-16T03:00:00+09:00
STATUS: ACTIVE — newly admitted; no result/novelty claim
DOMAIN: climate / energy / carbon dioxide removal

## Humanity-scale problem
Carbon dioxide removal must scale substantially while methods differ in maturity, cost, durability, resource needs and deployment constraints. The 2026 State of CDR provides downloadable indicators for R&D, demonstration/upscaling, current deployment, Paris-consistent scenarios and the CDR gap. Carbon Gap separately maintains an evolving database of explicit CDR research gaps.

## Frozen hypothesis class
Across CDR method families, a reproducible transition signature in R&D activity + demonstration/upscaling indicators may precede subsequent durable deployment growth or scale-up failure beyond method maturity and broad policy/demand trends.

This is a hypothesis class, not a causal or discovery claim.

## Gate Goal
Determine whether the 2026 State of CDR downloadable chapter data can be joined into an auditable method × time panel with a temporally ordered deployment endpoint and enough historical depth for held-out validation.

## Data/Provenance
Primary candidate source: State of Carbon Dioxide Removal, 3rd Edition (2026) Data Portal. The portal exposes downloadable CSVs for Research & Development (Ch.2), Demonstration & Upscaling (Ch.3), Current Levels of CDR (Ch.7), Paris-consistent scenarios (Ch.8) and the CDR Gap (Ch.9). Reports are stated as CC BY 4.0; exact dataset/download terms must be snapshotted before analysis.

Secondary prior-art/gap source: Carbon Gap CDR research-gaps database. Use for gap classification/prior-art only unless its exact data terms and provenance are frozen.

## Causal/Statistical prespecification
1. Exposure window must precede deployment endpoint; no contemporaneous leakage.
2. Baseline comparator: method family + maturity + lagged deployment + broad time trend.
3. Incremental candidate signals: prespecified R&D and demonstration/upscaling indicators.
4. Negative controls: future R&D/demonstration values; shuffled method labels within maturity bands; non-temporal model.
5. Validation: leave-one-method-family-out where feasible plus temporal holdout.
6. Multiplicity: control across indicator families; no p-value-only promotion.
7. Sensitivity: alternative deployment definitions, policy/demand adjustment, missing-data mechanism, and extreme-project influence.

## Admission criteria / current verdicts
- Domain Lead: ADMIT ACTIVE — direct climate-scale relevance and a current open data portal.
- Causal/Statistical Lead: PASS protocol; endpoint identifiability not yet proven.
- Data Engineering/Provenance: PASS source route; BLOCK until CSV bytes/schema/version are frozen.
- Reproducibility QA: protocol deterministic enough for intake implementation.
- Visualization/Design: defer figure until real method×time coverage matrix exists.
- Novelty/Prior-Art: WATCH INSIDE ACTIVE — exact transition signature must be compared against State of CDR analyses and Carbon Gap research-gap database before any survivor claim.
- Legal/Data Rights: reports CC BY 4.0; exact downloadable-data terms must be frozen separately.
- Publication/Commercialization: potential climate-methods/decision-support publication; no credit/investment recommendation claim.
- Red Team: strongest risks are circular indicators, inconsistent method taxonomies, sparse temporal depth, policy/demand confounding and survivorship bias.

## Kill criteria
Kill or return to WATCH if the downloadable data lack method-level temporal depth, endpoint is definitionally constructed from the same indicators, or prior art already answers the exact temporal-transition question.

## Next Gate
Download/freeze Ch.2/3/7 CSV schemas and terms; build method-taxonomy crosswalk and coverage matrix; test whether a non-circular temporally ordered endpoint is identifiable before model fitting.
