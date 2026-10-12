# /polish — Final quality pass before shipping

> Refinement, never concealed redesign. Preserve the incumbent visual world, content, behavior, and everything outside scope. If the concept itself is wrong, recommend redesign instead of smuggling in a replacement.

## Setup

1. Read `.agent/PROJECT_MAP.md` if it exists, then `DESIGN.md`, `PRODUCT.md`, and `frontend/app/globals.css`.
2. Read the target route/component and at least one neighboring flow (landing → try → calibrate → learn → heatmap).
3. Resolve the target: file path, route, or component. If ambiguous, ask which surface to polish.
4. If a prior `/critique` snapshot exists, incorporate its P0/P1 findings — but run an independent pass either way.

## Gather evidence

Use the feature at its representative sizes: **desktop (1280–1440) and mobile (375–390) together**.

- Is the path functionally complete?
- What is the quality bar and time available?
- Which states will real users encounter (loading, empty, error, success, disabled, permission-limited, long content, offline)?
- What did the critique (if any) flag?

## Triage (fix in this order)

1. Broken/blocked tasks, data loss, misleading state, inaccessible paths
2. Missing loading / empty / error / success / disabled / permission states
3. Flow, hierarchy, responsive, and design-system drift
4. Visual and motion inconsistencies
5. Code and asset cleanup

Do not perfect one corner while leaving the rest below the same quality bar.

## Polish the whole path

### Flow and hierarchy

- Match neighboring mental models, terminology, disclosure, routing, and save behavior.
- Make the primary task and current state obvious without flattening every element to equal weight.
- Ensure arrival → transition → empty → recovery paths connect.

### Layout and type

- Align to the **8px spacing scale** (`4·8·12·16·24·32·48·64·80·112`) and the project's grid. Fix optical as well as mathematical alignment.
- Group related content tightly (`gap-4/6`), separate distinct groups generously (`gap-8/12`).
- Keep same-role typography consistent (display > headline > title > body > eyebrow). Test wrapping, localization expansion, and zoom.
- Verify every supported viewport — not just the current screenshot.

### Color, imagery, and icons

- Use semantic tokens from `globals.css` (`brand-navy`, `brand-cyan`, `border`, `muted`). No hard-coded hex when a token exists.
- Verify text/control/focus contrast in every state (4.5:1 text, 3:1 large).
- Keep icon families, stroke weight, and optical alignment coherent (Remix Icon per `components.json`).
- Prevent image layout shift; use correct aspect ratios and useful `alt` text.

### Interaction and state

- Every control needs `default`, `hover`, `focus` (visible `ring`), `active`, `disabled`, `loading`, `error`, `success`.
- Preserve keyboard focus, logical tab order, and `44×44px` touch targets.
- Motion coherent, interruptible, `prefers-reduced-motion` respected. Do not add animation to make polish visible.
- Validate long / missing / localized / slow / permission-limited content.

### Content and code

- Terminology, capitalization, and punctuation consistent. Ask before changing factual claims.
- Reuse `components/ui/*` — extract if a pattern repeats. No per-page button/card duplication.
- Remove dead code, unused imports, and placeholder copy.

## Verify

- [ ] Desktop (1280–1440) and mobile (375–390) inspected together — no overflow, no fixed-width breakage.
- [ ] Keyboard navigation + visible focus + one landmark pass.
- [ ] All states present: loading, empty, error, success, disabled (where applicable).
- [ ] No `DESIGN.md` drift — or `DESIGN.md` updated explicitly if the system changed.
- [ ] Neighboring flows still coherent.

## Output

Summarize what was polished (grouped by triage tier), what was left intentionally, and how it was verified. Include before/after notes for visible changes.
