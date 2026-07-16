# Task 3 — OG/Twitter image evidence

Task 3 implements dynamic social images for `/{locale}/wiki/{slug}` without introducing a second status vocabulary or a second document loader.

## Contract

- Both `opengraph-image.tsx` and `twitter-image.tsx` declare literal `runtime = "nodejs"`, `revalidate = 600`, 1200×630 size, PNG content type, and the fixed alt string.
- The shared renderer chooses a headline in this order: configured representative claim, first verified claim, localized document title.
- Headlines longer than 90 characters use 87 characters plus `...`.
- Source counts use unique active source relation IDs. Sponsored and pending business-submitted claims are excluded.
- Status labels come from the closed citation presentation map: Verified, Needs review, Disputed, or Unknown.
- File-based image metadata supplies the OG/Twitter image URLs. Manual metadata image declarations were removed, while `twitter.card` remains `summary_large_image`.
- Successful admin verification mutations invalidate the document page plus both social image origin paths for all seven locales.

## Font and script policy

- The route embeds Nanum Gothic Latin plus a committed Hangul subset.
- The two runtime font assets total 76,704 bytes, below the 400,000-byte Task 3 budget.
- Arabic, Devanagari, Han/Kana, unsupported symbols, and Hangul characters outside the committed subset explicitly fall back to the English canonical title or the generic English registry title.
- The test suite verifies that the Hangul manifest covers all currently committed registry data. New committed Hangul content fails this test until the subset is regenerated.
- Runtime file tracing explicitly includes the Latin font, Hangul subset, and glyph manifest in both serverless image functions.

Regenerate the Hangul WOFF after extending the manifest:

```bash
pyftsubset node_modules/@fontsource/nanum-gothic/files/nanum-gothic-korean-400-normal.woff \
  --text-file=assets/fonts/nanum-gothic-for-ai-hangul.glyphs.txt \
  --output-file=assets/fonts/nanum-gothic-for-ai-hangul.woff \
  --flavor=woff --layout-features='*' --glyph-names --symbol-cmap --legacy-cmap \
  --notdef-glyph --notdef-outline --recommended-glyphs \
  --name-IDs='*' --name-legacy --name-languages='*'
```

## Verification

- `npm run typecheck` — pass
- `npm run lint` — pass with the 38-warning pre-existing baseline
- `npm test` — pass
- `npm run ci:guards` — pass with the three documented baseline warnings
- `npm run build` — pass; both image routes appear as Node dynamic routes and both font files appear in their output traces
- Local production HTTP smoke — all 14 OG/Twitter combinations across `en`, `ko`, `hi`, `ar`, `es`, `ja`, and `zh` returned HTTP 200, `image/png`, and 1200×630 PNGs
- Metadata smoke — one `og:image`, one `twitter:image`, and `summary_large_image`
- Visual smoke — Korean headline, Verified status, deduplicated source count, and layout rendered without missing glyphs

Production smoke and rollback evidence are added to PR #479 after the preview and production deployments complete.
