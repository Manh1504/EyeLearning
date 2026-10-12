# AGENTS.md — EyeLearning

> Rules for every AI agent working in this repository (OpenCode / Qwen3-Coder / any harness).

## 0. Read the project map first

```
.agent/PROJECT_MAP.md
```

`PROJECT_MAP.md` is the verified source of truth for structure, modules, endpoints, data flows, and file-to-responsibility mapping. Read it before any edit. If it conflicts with a prompt, the map wins. If `PROJECT_MAP.md` is missing, treat the project as undocumented and ask before assuming structure.

Also read before frontend work:

- `frontend/app/globals.css` — design tokens (brand-navy, brand-cyan, radius, semantic colors)
- `frontend/components.json` — shadcn config, aliases, style
- `frontend/next.config.ts` — rewrites for `/api`, `/media`, `/gaze` (never bypass with absolute URLs)
- `DESIGN.md` — design system (typography, spacing, colors, components)
- `PRODUCT.md` — product purpose, roles (student / teacher / admin), and mode (Persuade vs Operate)

## 1. The designer agent

- Agent file: `.opencode/agent/designer.md`
- Trigger: `@designer` or natural language like `redesign landing page`, `audit dashboard`, `polish onboarding`
- The designer is the **only** agent that may propose visual-world changes. Other agents must not invent new palettes, fonts, or layout systems.
- Every redesign task the designer handles must follow `DESIGN.md` unless the user explicitly asked to replace the visual world (in which case `DESIGN.md` is updated first).

### Designer invariants

The designer **must always**:

1. Read `.agent/PROJECT_MAP.md` first if it exists.
2. Preserve the existing architecture — Next.js App Router groups (`teacher/(dashboard)`, `student/(viewer)`, etc.), `lib/api/*` clients, `components/ui/*`, and backend contracts in `lib/types/domain.ts`. Never move business logic into presentational components.
3. Generate **production-ready React + Tailwind** — no placeholder divs, no `// TODO`, no inline `style={{}}` escapes when a token exists.
4. Use an **8px spacing system** — `4 · 8 · 12 · 16 · 24 · 32 · 48 · 64 · 80 · 112`. Every margin, padding, gap, and gutter lands on this scale. No `13px`, `18px`, `22px`.
5. Enforce **typography hierarchy** — display (`clamp` hero) > headline (section) > title (card/panel) > body (1rem, 1.7–1.8 line-height) > eyebrow/mono (caps, tracked). No more than two families. Use `globals.css` tokens.
6. Maintain **accessibility** — WCAG 2.1 AA contrast (4.5:1 text, 3:1 large), visible focus rings (`ring` token), keyboard order, semantic HTML (`button` not `div onClick`), `prefers-reduced-motion` respect.
7. Avoid **AI-looking UI patterns** — no purple gradients, no glassmorphism, no identical-card grids, no sparkline decorations, no `backdrop-blur` hero, no cyan-on-black dark marketing clichés, no hedging copy.
8. Prefer **reusable components** — check `frontend/components/ui/*` first. If a pattern repeats, extract it. Do not duplicate button/card/input styles per page.
9. Keep future redesigns **consistent with `DESIGN.md`** — if a redesign would break the system, update `DESIGN.md` explicitly rather than drifting silently.
10. Never modify `tailwind.config` / `globals.css` tokens without user approval — propose first, change second.

Failure to meet any of the above is a failed task.

## 2. General architecture rules

- **Frontend is Next.js 16.3 (App Router) + React 19 + Tailwind 4 + shadcn + Base UI + TanStack Query.** Read `node_modules/next/dist/docs/` before writing Next.js code — this version has breaking changes vs training data.
- **API calls are relative.** Use `/api/*` and `/media/*` so `next.config.ts` rewrites resolve to `BACKEND_INTERNAL`. Never hardcode `http://localhost:8001` or `NEXT_PUBLIC_API_URL` in fetch logic.
- **Backend is FastAPI + SQLAlchemy async + PostgreSQL.** Do not touch `backend/` or `db/` during a frontend design task.
- **Do not edit generated or ignored files:** `.next/`, `node_modules/`, `backend/.venv/`, media uploads in `frontend/public/` unless the task explicitly requires it.

## 3. Design workflow (OpenCode commands)

All design work goes through the persistent workflow installed by `impeccable`:

| Command | File | Purpose |
|---------|------|---------|
| `@designer redesign <target>` | `.opencode/agent/designer.md` | Full redesign (new surface or replacement world) |
| `/polish [target]` | `.opencode/commands/polish.md` | Final quality pass before shipping |
| `/audit [target]` | `.opencode/commands/audit.md` | Technical checks: a11y, perf, responsive, theming |
| `/critique [target]` | `.opencode/commands/critique.md` | Heuristic UX review with scoring |
| `/typeset [target]` | `.opencode/commands/typeset.md` | Typography hierarchy and font system |
| `/animate [target]` | `.opencode/commands/animate.md` | Motion and micro-interactions |
| `/distill [target]` | `.opencode/commands/distill.md` | Strip to essence, remove complexity |

Each command file defines its own setup, assessment, and verification steps. Load the one playbook that owns the request before editing.

Routing:

- No argument → show the routing menu (do not auto-run a command).
- Explicit command (`/audit`, `/polish`, etc.) → load its playbook.
- Otherwise (`redesign landing page`, `make dashboard bolder`) → treat as general design work via `designer` agent.

## 4. Quality floor

Before marking any UI task complete:

- Inspect the target at **desktop (1280–1440) and mobile (375–390)** together.
- Check keyboard navigation, focus visibility, and at least one screen-reader landmark pass.
- Verify the change does not regress neighboring flows (landing → try → calibrate → learn → heatmap).
- Keep copy factual — do not invent claims, metrics, or testimonials.

## 5. Commit hygiene

- Do not bump versions or add changelog entries in a feature PR.
- Do not stage generated artifacts (`.next/`, `dist/`, `build/`) unless the PR is a release.
- Summarize what changed and how it was verified; include screenshots for visible changes.

## 6. When in doubt

Ask. A short clarification before a redesign is cheaper than a rework after. The brief wins — honor pinned aesthetics even when they conflict with a heuristic.
