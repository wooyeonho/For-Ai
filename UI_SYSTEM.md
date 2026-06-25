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

| Color | Meaning |
|-------|---------|
| Green (#15613a) | Verified, citation-ready |
| Yellow (#7a4c00) | Needs review, uncertain |
| Red (#9f1b1e) | Disputed, do not cite |
| Blue (#24415f) | Accent, interactive |
| Gray (#5f6b7a) | Metadata, secondary |

## Typography

- Body: system fonts (-apple-system, etc.)
- Monospace: for entity IDs, field paths, technical metadata
- Headings: 700 weight, restrained sizing
- Claims: slightly larger (1.1rem), emphasizing the fact itself
