# /distill — Strip to essence, remove complexity

> Remove anything that does not earn its place: redundant elements, repeated information, decorative noise, cosmetic complexity. Simplicity is not removing features — it is removing obstacles between users and their goals.

## Setup

1. Read `.agent/PROJECT_MAP.md` if it exists, then `DESIGN.md`, `PRODUCT.md`, and `frontend/app/globals.css`.
2. Resolve the target: file path, route, or component. If ambiguous, ask which surface to distill.
3. Inspect the target at desktop and mobile. Identify what makes it feel complex or cluttered — do not guess from code alone.

## Assess current state

**Complexity sources:**

- Too many elements competing for attention
- Excessive variation (too many colors, fonts, sizes without purpose)
- Information overload (everything visible at once, no progressive disclosure)
- Visual noise (unnecessary borders, shadows, backgrounds, decorations)
- Confusing hierarchy (unclear what matters most)
- Feature creep (too many options, actions, or paths)

**Find the essence:**

- What is the ONE primary user goal on this surface?
- What is necessary vs nice-to-have?
- What can be removed, hidden, or combined?
- What is the 20% that delivers 80% of value?

If any answer is unclear from the codebase, ask — do not guess.

## Plan simplification

State before editing:

- **Core purpose** — the ONE thing this surface must accomplish.
- **Essential elements** — what is truly necessary to achieve that purpose.
- **Progressive disclosure** — what can be hidden until needed.
- **Consolidation** — what can be combined or integrated.

Simplification is hard — it requires saying no to good ideas to make room for great execution. Be ruthless.

## Simplify the design

### Information architecture

- Reduce scope — remove secondary actions, optional features, redundant information.
- Progressive disclosure — hide complexity behind clear entry points (accordions, modals, step-through flows).
- Combine related actions — merge similar buttons, consolidate forms, group related content.
- Clear hierarchy — ONE primary action, few secondary, everything else tertiary or hidden.
- Remove redundancy — if it is said elsewhere, do not repeat it.

### Visual simplification

- Reduce palette to **1–2 colors + neutrals** — not 5–7.
- Limit typography to **one family, 3–4 sizes max, 2–3 weights**.
- Remove decorations — eliminate borders, shadows, backgrounds that do not serve hierarchy or function.
- Flatten structure — reduce nesting, remove unnecessary containers; never nest cards inside cards.
- Remove unnecessary cards — use spacing and alignment instead of boxing every group.
- Consistent spacing — one **8px scale** (`4·8·12·16·24·32·48·64·80·112`), no arbitrary gaps.

### Layout simplification

- Prefer linear vertical flow over complex grids where possible.
- Move secondary content inline or hide it behind disclosure.
- Use dividers and whitespace before adding another container.
- Ensure the primary content and action are above the fold.

### Interaction simplification

- Reduce steps to complete the primary task.
- Remove confirmation dialogs for reversible actions.
- Combine related form fields; remove optional fields that are rarely used.
- Make the happy path obvious — hide edge-case paths.

## Verify

- [ ] The primary goal is unmistakable at first glance (desktop + mobile).
- [ ] No `DESIGN.md` drift — tokens respected; palette and type still within the system.
- [ ] Loading / empty / error states still present where needed (do not distill away required feedback).
- [ ] Neighboring flows (landing → try → calibrate → learn → heatmap) still coherent.
- [ ] Accessibility preserved — focus, landmarks, and contrast still pass.

## Output

Summarize the core purpose, what was removed or consolidated (grouped by IA / visual / layout), and what was kept intentionally. Explain how the distilled surface now serves the primary goal faster.
