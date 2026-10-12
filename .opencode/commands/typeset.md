# /typeset — Typography hierarchy and font system

> Typography carries information, hierarchy, and voice. Improve it inside the established visual world; do not replace the identity unless the user asked to.

## Setup

1. Read `.agent/PROJECT_MAP.md` if it exists, then `DESIGN.md`, `PRODUCT.md`, and `frontend/app/globals.css`.
2. Resolve the target: file path, route, or component. If none given, show the routing menu.
3. Inspect representative pages and `globals.css` tokens (`--font-sans`, `--font-heading`, `--font-geist-mono`, `--radius`, color tokens).

## Assessment (answer with file, selector, or computed value)

- **Authority and fit:** Which faces, weights, and roles are established? Do they fit EyeLearning (precise, calm, credible) or are they unexamined defaults?
- **Hierarchy:** Can display, headline, title, body, small, eyebrow, and mono be distinguished at a glance? Are adjacent sizes/weights too close to carry different jobs?
- **Scale and consistency:** Is there a deliberate role scale, or arbitrary values? Do repeated roles stay identical across screens?
- **Reading:** Does body copy stay within 45–75ch? Are line-height (1.7–1.8), paragraph rhythm, contrast, and tracking tuned to the face, width, and surface?
- **Stress:** What happens with long headings, localization expansion, zoom, narrow containers, missing weights, and fallback?
- **Delivery:** Are only used font assets loaded? Do fallback metrics and loading avoid invisible text and layout shift?

Also run a mechanical check: search for hard-coded `font-size`, `font-family`, or `line-height` values that bypass `globals.css` tokens.

## Set the system

Before editing, state:

- Roles the interface needs and intended contrast between them.
- Reading measure and density for body surfaces.
- Which existing families/weights are authoritative — do not add a second family without a clear role it alone can perform.
- Constraints: performance, localization, accessibility.

Use the fewest roles and families that make hierarchy unmistakable. Combine size, weight, space, and tone — do not ask size alone to do all the work. Token names should describe purpose, not values.

EyeLearning scale: `12 · 13 · 14 · 15 · 16 · 18 · 20 · 24 · 28 · 32 · 40 · 48 · 56` (no other sizes). Hierarchy: **display** (`clamp` hero) > **headline** (section) > **title** (card/panel) > **body** (1rem, 1.7–1.8) > **small** (0.875rem) > **eyebrow/mono** (caps, tracked).

## Apply

- Keep body at `1rem / 16px` floor; prose within 45–75ch; line-height 1.7–1.8 for `foreground` on white, slightly more on dark.
- Keep repeated roles consistent across screens and states.
- Use tabular/numeric features where data benefits.
- Load only used font assets; provide metric-compatible fallbacks; do not block text rendering.
- Preserve browser zoom and user font settings.
- Use paragraph spacing **or** first-line indentation — not both.
- Letter-spacing: eyebrow `0.14em` uppercase, mono `0.06em`. Do not write full sentences in tracked caps.

If replacement would create a new identity, route through redesign and update `DESIGN.md` — do not silently swap families.

## Verify

- [ ] Hierarchy legible at a glance across the target.
- [ ] Body measure 45–75ch; no overflow at 375px.
- [ ] No hard-coded font values bypassing tokens.
- [ ] Long headings and localization expansion handled.
- [ ] Zoom and fallback rendering checked.

## Output

Summarize the role scale, what changed, and where hierarchy now reads. Note any `DESIGN.md` update if the font system changed.
