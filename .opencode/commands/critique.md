# /critique — Heuristic UX review with scoring

> Resolve one target, run a structured design review, synthesize a critique, and ask what to improve next. The report is the deliverable.

## Setup

1. Resolve the target to a concrete file path, route, or component. Prefer a source path over a dev-server URL (ports drift, paths do not).
   - "homepage" → `frontend/app/page.tsx`
   - "teacher dashboard" → `frontend/app/teacher/(dashboard)/courses/page.tsx`
   - "heatmap" → `frontend/app/teacher/(viewer)/courses/[courseId]/lessons/[lessonId]/heatmap/page.tsx`
2. Read `.agent/PROJECT_MAP.md` if it exists, then `DESIGN.md`, `PRODUCT.md`, and `frontend/app/globals.css`.
3. Read the relevant reference for context: `PRODUCT.md` mode (Persuade/Operate/Read) drives heuristics.

## Heuristic review

Score each heuristic **0–4** (0 = fails, 1 = major gaps, 2 = partial, 3 = good, 4 = excellent). Cite a file, selector, or observed behavior for every score.

### Persuade surfaces (landing, marketing)

- **Clarity of value** — can a first-time visitor state what the product does in one sentence?
- **Visual hierarchy** — is the primary CTA and key message unmistakable without flattening everything?
- **Credibility** — does the page earn trust (real proof, not hedging or fake metrics)?
- **Flow to action** — is the path to CTA obvious and unobstructed?

### Operate surfaces (dashboards, viewers, tools)

- **Task clarity** — is the primary task and current state obvious?
- **Scanability** — can the user find the right row/card/control at a glance?
- **Consistency** — do terminology, controls, and patterns match neighboring flows?
- **Error & empty states** — are loading/empty/error/success/disabled states present and helpful?

### Read surfaces (docs, heatmap analysis)

- **Structure for comprehension** — does the layout guide understanding, not just display data?
- **Measure and rhythm** — is body copy within 45–75ch with comfortable line-height?
- **Signal vs noise** — does decoration support the data or compete with it?

Always also check (any mode):

- **Accessibility perception** — focus visibility, contrast, and semantic cues as a user experiences them.
- **Responsive behavior** — does the composition hold at 375, 768, and 1280?
- **Anti-patterns** — flag any `DESIGN.md` §10 AI-looking patterns.

## Report format

```md
## Critique — <target> (Mode: Persuade|Operate|Read)

| Heuristic | Score | Evidence |
|-----------|-------|----------|
| ... | ?/4 | `file:line` or observed behavior |
| **Total** | **??/20** | **Rating** |

Rating: 18–20 Excellent · 14–17 Good · 10–13 Acceptable · 6–9 Poor · 0–5 Critical

### Strengths
- ...

### Issues
- [P0] <issue> — why it matters, where it appears
- [P1] ...

### Recommended next step
One concrete command to run next (e.g. `/polish teacher dashboard` or `@designer redesign landing hero`).
```

Severity: **P0** = blocks understanding or task · **P1** = meaningfully degrades experience · **P2** = polish.

## Close

The question is the **last** line of the response. Write the entire report first, then ask — nothing follows the question. End with either targeted questions or:

```
Questions skipped: <reason>
```

A run that ends with neither is incomplete.

## Notes for EyeLearning

- Do not invent claims, metrics, or testimonials. Keep copy factual.
- For teacher/student flows, verify the change does not regress the neighboring flow (landing → try → calibrate → learn → heatmap).
- Honor `PRODUCT.md` brand personality (precise, calm, credible) even when it conflicts with a heuristic.
