# /animate — Motion and micro-interactions

> Use motion to explain state, relationship, and hierarchy — or to create one authored moment the surface has earned. Decoration without purpose is animation debt.

## Setup

1. Read `.agent/PROJECT_MAP.md` if it exists, then `DESIGN.md`, `PRODUCT.md`, and `frontend/app/globals.css`.
2. Resolve the target: file path, route, or component. If none given, show the routing menu.
3. Inspect the existing motion language, interaction states, target devices, and performance budget. Do not animate a static area merely because it exists.

## Visitor mode

- **Persuade / Experience:** motion may carry the voice. Prefer one rehearsed focal sequence over repeated section reveals.
- **Operate / Read:** motion serves feedback, state, and continuity. Keep routine transitions fast (150–300ms); do not make users wait.
- EyeLearning is **precise and calm** — motion should feel instrumental, not celebratory.

## Set the motion thesis (before implementing)

Write a short plan:

- **Focal moment:** the one sequence or interaction that deserves authorship, if any.
- **Continuity:** state, layout, or navigation changes that need explanation.
- **Feedback:** controls and outcomes that need acknowledgment.
- **Budget:** which effects may be expensive and how often they run.

The focal moment must come from this product and surface. A generic fade-and-rise, hover lift, parallax, or scroll reveal is not a thesis.

## Choose material by meaning

| Meaning | Material |
|---------|----------|
| Continuity & relationship | Shared-element motion, FLIP transforms, view transitions, spatial movement |
| Focus & depth | Bounded blur/filter, backdrop, light, or shadow changes |
| Reveal & composition | Masks, clip paths, cropping, controlled occlusion |
| State & feedback | Smallest change that makes cause → result unmistakable |

- Prefer `transform` and `opacity` as the reliable base. Use other properties only when they communicate something transform/opacity cannot.
- Do not stack techniques for spectacle. One strong idea, carried through the focal sequence and quiet supporting states, is enough.
- Sibling stagger is appropriate only when a list appears as a list. Cap total delay.

## Timing and easing

| Duration | Use |
|----------|-----|
| 100–150ms | Immediate feedback (press, toggle) |
| 150–300ms | Routine state change (hover, open, close) |
| 300–500ms | Layout, overlay, or view transition |
| 500–800ms | Deliberately authored focal entrance |

- Easing: `ease-out` for entrances, `ease-in` for exits, `ease-in-out` for spatial moves. Use `globals.css` easing tokens when defined.
- Keep motion interruptible — do not trap users in non-cancellable sequences.

## Apply

- Use Tailwind + `tw-animate-css` utilities where possible; add `@keyframes` to `globals.css` only when a token is missing (propose first).
- Ensure every animated element has a `prefers-reduced-motion` alternative that preserves state change and hierarchy — do not globally kill motion with `0.01ms`.
- Verify focus is never blocked, reading is never interrupted, and task completion is never gated by animation.
- Check at both desktop and mobile; expensive effects (blur, filter, shadow) must not drop frames.

## Verify

- [ ] `prefers-reduced-motion` respected — reduced alternative preserves meaning.
- [ ] No flashing above threshold; no motion blocks focus/reading/task.
- [ ] 60fps on target devices; no unbounded blur/filter/shadow.
- [ ] Keyboard and screen-reader order unchanged.
- [ ] Neighboring flows (calibrate → learn → heatmap) unaffected.

## Output

Summarize the thesis, focal moment (if any), feedback/continuity improvements, and timing choices. Note how reduced-motion was handled.
