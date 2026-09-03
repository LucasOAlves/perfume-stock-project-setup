# Frontend Conventions

Status: living convention, not an ADR — file organization is easily reversible and doesn't warrant the ceremony of a full architecture decision record. Update this file directly when the convention changes; no need to preserve history the way an ADR would.

## Template/style co-location: inline until it hurts, then split

Angular components in this app default to inline `template`/`styles` in the `@Component` decorator (single `.ts` file), not `templateUrl`/`styleUrls` pointing at separate `.html`/`.css` files. This was an unstated default through Slices 1–5 — worth writing down now that it was flagged in review.

**Why inline by default:**

- Fewer files to navigate for the small, single-purpose components this app is built from (`.agents/angular-frontend-expert.md` — "small feature-focused components").
- A code review sees markup, styles, and logic together in one diff.
- No `templateUrl` path to get wrong or leave stale after a rename.

**When to split into `templateUrl` + a separate `.html` (and `.css` if the styles are non-trivial):** once a component's combined `template` string + `styles` array exceeds roughly **150 lines**. Past that point, inline stops being a convenience and starts hiding the component's actual shape — the TypeScript logic gets buried under HTML, and diffs mixing markup tweaks with logic changes get harder to read.

Applied retroactively (2026-09) to the three components that had grown past this threshold: `product-list-page.component.ts` (was 283 lines), `product-form-page.component.ts` (was 260 lines), `stock-movements-panel.component.ts` (was 329 lines) — each split into `.component.ts` + `.component.html` (+ `.component.css` where the inline styles were non-trivial). Smaller components (`app.component.ts`, `login-page.component.ts`, `networks-page.component.ts`, `members-page.component.ts`, `my-reservations-page.component.ts`, all under 180 lines) were left inline — splitting them would add files without adding clarity.

If a component crosses ~150 lines again, split it the same way rather than letting it grow — don't wait for another review to flag it.
