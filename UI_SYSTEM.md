# UI_SYSTEM.md

## Visual Direction

For-Ai must look like a credible, global fact registry.
Users must feel trust. AI must find structure.

## It Must Not Look Like

- a blog
- a community wiki
- a wedding platform
- a marketing landing page
- a generic CMS
- a Korean-only local service

## Design Feel

- Government fact database
- Stripe Docs — clean, structured, authoritative
- Data dashboard — metrics visible
- Wikipedia infobox — structured facts
- Legal registry — certified, timestamped

## Layout Rules

- max width 960px
- mobile-first responsive
- quiet neutral design with trust-signaling accent colors
- simple, professional typography
- no heavy UI library
- no decorative or promotional UI
- green = verified, yellow = needs review, red = disputed
- global-ready: RTL support, language selector prominent

## Required Components

- `RegistryHeader`
- `DirectAnswerBox`
- `ConfidenceBadge`
- `StatusBadge`
- `ClaimTable`
- `ClaimCard`
- `SourcePill`
- `VerificationMeta`
- `MachineReadablePanel`
- `CorrectionCTA`
- `HallucinationCTA`
- `LicenseNotice`
- `CitationBlock` — copy-ready citation for AI/humans
- `TrustIndicator` — visual trust score per document
- `BusinessBadge` — for verified business profiles (future)

## UI Principles

- Claim is the hero, not the article.
- Uncertainty must be visible — never hide "확인 필요".
- Every claim must show confidence, source count, and verification state.
- Correction and AI hallucination report links must be visible.
- The interface must feel calm, credible, and data-focused.
- Trust signals: verification count, source count, last-verified date.
- Global-first: English by default, multi-language navigation clear.
- AI-citation-friendly: structured data visible, copy-citation easy.
- Monetization labels must be transparent (e.g., "Verified by business", "Sponsored").

## Color Semantics

| Color | Meaning | Token |
|-------|---------|-------|
| Green (#15613a) | Verified, citation-ready | `--status-verified` |
| Yellow/Brown (#8a5a14) | Needs review, uncertain | `--status-review` |
| Red (#9f1b1e) | Disputed, do not cite | `--status-disputed` |
| Gray (#526276) | Candidate or low-confidence until reviewed | `--status-candidate` |
| Blue/Navy (#24415f) | Accent, interactive only; never verified status | `--accent` |
| Muted Gray (#5f6b7a) | Metadata, secondary | `--muted` |

### Status Color Rules

- Status badges must use semantic status tokens instead of ad hoc hex values.
- Verified states use the green `--status-verified` token. Do not use cyan or bright blue for verified claims because those colors read as generic interactive accents rather than trust signals.
- Needs-review states use `--status-review` and must remain visibly distinct from verified states.
- Disputed or dangerous-to-cite states use `--status-disputed`.
- Candidate, low-confidence, or unreviewed states use `--status-candidate` unless the UI explicitly marks them as needs-review.
- Active filter controls share the same ink/paper inversion rule across ghost buttons, community chips, and admin filters.

## Typography

- Body: system fonts (-apple-system, etc.)
- Monospace: for entity IDs, field paths, technical metadata
- Headings: 700 weight, restrained sizing
- Claims: slightly larger (1.1rem), emphasizing the fact itself
