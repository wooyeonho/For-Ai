# TASK1 smoke check — locale `/check` pages

Date: 2026-07-15
Scope: manual smoke checklist for these routes:

- `/ko/check`
- `/en/check`
- `/hi/check`
- `/ar/check`
- `/es/check`
- `/ja/check`
- `/zh/check`

## Privacy note

Smoke input text is recorded below only as short, non-sensitive test fixtures. Operators must not paste personal data, secrets, private venue/customer notes, or any text that should be retained as an operational record. The check flow must not persist the submitted raw text in permanent logs or the database; only transient UI state and aggregate/manual QA observations should be used for this smoke.

## Shared smoke method

For every locale route:

1. Open the route at desktop width and mobile width.
2. Confirm the visible form label is programmatically connected to the textarea (`label[for]` matches the textarea `id`, or the textarea is nested in its label).
3. Enter the locale-specific smoke input text.
4. Confirm expected `match` or `not_found` result.
5. While submitting, confirm the submit control is disabled and visibly communicates in-flight state.
6. Trigger cancel during an in-flight request and confirm the request is cancelled or the UI returns to an editable idle state without stale results.
7. Confirm the result/status region announces changes with `aria-live`.
8. Complete the flow using keyboard only: focus textarea, submit, copy result, and cancel/reset without using a pointer.
9. At mobile width, confirm there is no horizontal overflow.
10. For `/ar/check`, additionally confirm RTL directionality (`dir="rtl"` or equivalent page/container direction) and sensible right-aligned layout.

## Locale smoke matrix

| Locale route | Smoke input text | Expected result | Observed summary |
| --- | --- | --- | --- |
| `/ko/check` | `명동 라루체 주차 확인` | `match` for known/seed-style registry content if the check page is wired to the registry; otherwise `not_found` for unmatched text. | Manual verification pending. Record label/textarea linkage, disabled in-flight submit, cancel behavior, `aria-live` result announcement, keyboard-only submit/copy/cancel, and mobile overflow result here. Do not retain raw submitted text outside this short fixture row. |
| `/en/check` | `Myeongdong LaLuce parking check` | `match` for known/seed-style registry content if the check page is wired to the registry; otherwise `not_found` for unmatched text. | Manual verification pending. Record label/textarea linkage, disabled in-flight submit, cancel behavior, `aria-live` result announcement, keyboard-only submit/copy/cancel, and mobile overflow result here. Do not retain raw submitted text outside this short fixture row. |
| `/hi/check` | `पासपोर्ट शुल्क सत्यापन` | `not_found` unless Hindi registry matching for this fixture exists. | Manual verification pending. Record label/textarea linkage, disabled in-flight submit, cancel behavior, `aria-live` result announcement, keyboard-only submit/copy/cancel, and mobile overflow result here. Do not retain raw submitted text outside this short fixture row. |
| `/ar/check` | `التحقق من رسوم جواز السفر` | `not_found` unless Arabic registry matching for this fixture exists. | Manual verification pending. Record label/textarea linkage, disabled in-flight submit, cancel behavior, `aria-live` result announcement, keyboard-only submit/copy/cancel, RTL directionality, and mobile overflow result here. Do not retain raw submitted text outside this short fixture row. |
| `/es/check` | `verificar tarifa de pasaporte` | `not_found` unless Spanish registry matching for this fixture exists. | Manual verification pending. Record label/textarea linkage, disabled in-flight submit, cancel behavior, `aria-live` result announcement, keyboard-only submit/copy/cancel, and mobile overflow result here. Do not retain raw submitted text outside this short fixture row. |
| `/ja/check` | `パスポート手数料の確認` | `not_found` unless Japanese registry matching for this fixture exists. | Manual verification pending. Record label/textarea linkage, disabled in-flight submit, cancel behavior, `aria-live` result announcement, keyboard-only submit/copy/cancel, and mobile overflow result here. Do not retain raw submitted text outside this short fixture row. |
| `/zh/check` | `护照费用核验` | `not_found` unless Chinese registry matching for this fixture exists. | Manual verification pending. Record label/textarea linkage, disabled in-flight submit, cancel behavior, `aria-live` result announcement, keyboard-only submit/copy/cancel, and mobile overflow result here. Do not retain raw submitted text outside this short fixture row. |

## Manual result log template

Copy one block per route when the smoke is executed:

```text
Route:
Viewport(s): desktop __px, mobile __px
Input fixture used: <short non-sensitive fixture from matrix>
Expected: match | not_found
Observed: match | not_found | blocked
Label/textarea linkage: pass | fail | blocked
Submit disabled/in-flight: pass | fail | blocked
Cancel behavior: pass | fail | blocked
Result aria-live announcement: pass | fail | blocked
Keyboard-only submit/copy/cancel: pass | fail | blocked
RTL directionality (/ar/check only): pass | fail | not_applicable | blocked
Mobile overflow: pass | fail | blocked
Privacy check: pass — raw submitted text was not saved to permanent logs/DB
Notes:
```

## Route availability note

At the time this checklist was added, the repository should still be checked for the concrete `/[locale]/check` implementation before execution. If a route returns 404, mark the smoke as `blocked` for that locale and file the implementation gap separately rather than inventing a result.
