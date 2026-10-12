# /audit — Technical quality checks (a11y, perf, responsive, theming)

> Code-level audit, not a design critique. Check what is measurable and verifiable in the implementation. Do not fix — document for other commands to address.

## Setup

1. Read `.agent/PROJECT_MAP.md` if it exists, then `DESIGN.md`, `PRODUCT.md`, and `frontend/app/globals.css`.
2. Resolve the target: file path, route, or component directory. If none given, show the routing menu — do not auto-run.

## Diagnostic scan

Score each dimension **0–4**. Be specific — cite file, selector, or computed value.

### 1. Accessibility (A11y) — 0–4

Check: contrast (< 4.5:1 text, < 3:1 large), `prefers-reduced-motion`, missing ARIA roles/labels/states, keyboard nav (focus indicators, tab order, traps), semantic HTML (heading hierarchy, landmarks, `button` vs `div`), `alt` text, form labels and error messaging.

- 0 = Inaccessible (fails WCAG A) · 1 = Major gaps · 2 = Partial · 3 = Good (AA mostly met) · 4 = Excellent (AA fully met)

### 2. Performance — 0–4

Check: layout thrashing, expensive animations (unbounded blur/filter/shadow, layout-property animation), missing `loading="lazy"` / unoptimized images, `will-change` overuse, bundle size / unused deps, unnecessary re-renders.

- 0 = Severe · 1 = Major · 2 = Partial · 3 = Good · 4 = Excellent

### 3. Theming — 0–4

Check: hard-coded colors (not using `globals.css` tokens), broken dark mode variants, inconsistent tokens, values that do not update on theme switch.

- 0 = No theming · 1 = Minimal · 2 = Partial · 3 = Good · 4 = Excellent

### 4. Responsive — 0–4

Check: fixed widths that break on mobile, touch targets < 44×44px, horizontal scroll at 375px, text-scaling breakage, missing breakpoints.

- 0 = Desktop-only · 1 = Major issues · 2 = Partial · 3 = Good · 4 = Excellent

### 5. Implementation Integrity — 0–4 (CRITICAL)

Check: repeated shortcuts, design-system drift (`DESIGN.md` vs code), decorative fake data, structure interchangeable with an unrelated product. Keep deterministic findings separate from visual judgment.

- 0 = Systemic drift · 1 = Major · 2 = Several issues · 3 = Minor · 4 = Coherent and intentional

## Report format

```md
## Audit — <target>

| # | Dimension | Score | Key finding |
|---|-----------|-------|-------------|
| 1 | Accessibility | ?/4 | ... |
| 2 | Performance | ?/4 | ... |
| 3 | Responsive | ?/4 | ... |
| 4 | Theming | ?/4 | ... |
| 5 | Implementation Integrity | ?/4 | ... |
| **Total** | | **??/20** | **Rating** |

Rating bands: 18–20 Excellent · 14–17 Good · 10–13 Acceptable · 6–9 Poor · 0–5 Critical

### Verdict
Pass/fail: does the implementation express a coherent product-specific system? Cite evidence.

### Findings by dimension
#### 1. Accessibility — ?/4
- [P0/P1/P2] <finding> — `file:line` or selector

#### 2. Performance — ?/4
...

### Recommended fix order
1. P0 — ...
2. P1 — ...
```

Severity: **P0** = blocks access or task · **P1** = degrades quality significantly · **P2** = polish.

End with one question: what should be fixed next, or whether to run `/polish` / `/critique` on the weakest dimension.

## Notes for EyeLearning

- Contrast checks: `brand-navy` on white passes; `brand-cyan` on white does not — flag when cyan is used for body text.
- Responsive: verify at **375**, **768**, **1280**. Calibrate, learn, and heatmap flows are especially sensitive.
- Theming: `globals.css` defines light + `.dark` tokens — verify both. No hard-coded hex when a semantic token exists.
- Integrity: flag AI-looking patterns from `DESIGN.md` §10 (purple gradients, glassmorphism, identical-card grids, sparklines, `backdrop-blur` hero).
