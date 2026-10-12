---
name: EyeLearning
description: Calm instrument design. Deep navy and crisp cyan on clean white. Precision in measurement, restraint in chrome. Every surface earns its place.
colors:
  brand-navy: "#092f60"
  brand-cyan: "#01bcea"
  brand-cyan-muted: "#e8f9fd"
  brand-dark: "#0a1f3c"
  primary: "#092f60"
  primary-hover: "#0d3d78"
  primary-active: "#062346"
  background: "#ffffff"
  foreground: "#0f172a"
  muted: "#f3f7fa"
  muted-foreground: "#64748b"
  border: "#d9e3ea"
  input: "#d9e3ea"
  ring: "#01bcea"
  destructive: "oklch(0.577 0.245 27.325)"
  chart-1: "oklch(0.865 0.127 207.078)"
  chart-2: "oklch(0.715 0.143 215.221)"
  chart-3: "oklch(0.609 0.126 221.723)"

typography:
  display:
    fontFamily: "var(--font-heading), var(--font-sans), system-ui, sans-serif"
    fontSize: "clamp(2.5rem, 5vw, 3.75rem)"
    fontWeight: 700
    lineHeight: 1.05
    letterSpacing: "-0.02em"
  headline:
    fontFamily: "var(--font-heading), var(--font-sans), system-ui, sans-serif"
    fontSize: "clamp(1.75rem, 3vw, 2.25rem)"
    fontWeight: 700
    lineHeight: 1.15
  title:
    fontFamily: "var(--font-sans), system-ui, sans-serif"
    fontSize: "1.125rem"
    fontWeight: 600
    lineHeight: 1.35
  body:
    fontFamily: "var(--font-sans), system-ui, sans-serif"
    fontSize: "1rem"
    fontWeight: 400
    lineHeight: 1.75
  small:
    fontFamily: "var(--font-sans), system-ui, sans-serif"
    fontSize: "0.875rem"
    fontWeight: 400
    lineHeight: 1.5
  eyebrow:
    fontFamily: "var(--font-geist-mono), ui-monospace, monospace"
    fontSize: "0.6875rem"
    fontWeight: 600
    letterSpacing: "0.14em"
    textTransform: "uppercase"
  mono:
    fontFamily: "var(--font-geist-mono), ui-monospace, monospace"
    fontSize: "0.75rem"
    fontWeight: 500
    letterSpacing: "0.06em"

spacing:
  xs: "4px"
  sm: "8px"
  md: "16px"
  lg: "24px"
  xl: "32px"
  2xl: "48px"
  3xl: "64px"
  4xl: "80px"
  5xl: "112px"

radius:
  sm: "calc(var(--radius) * 0.6)"
  md: "calc(var(--radius) * 0.8)"
  lg: "var(--radius)"
  xl: "calc(var(--radius) * 1.4)"
  2xl: "calc(var(--radius) * 1.8)"
  full: "999px"

shadows:
  card: "0 1px 2px rgb(9 47 96 / 0.06), 0 4px 12px rgb(9 47 96 / 0.04)"
  card-hover: "0 4px 16px rgb(9 47 96 / 0.08), 0 12px 32px rgb(9 47 96 / 0.06)"
  focus: "0 0 0 3px rgb(1 188 234 / 0.25)"
---

# DESIGN.md — EyeLearning Design System

> Source of truth for visual language. Every future redesign must be consistent with this file. If a redesign needs a new world, update this file first — do not drift silently.

## 1. Principles

- **Instrument, not billboard.** UI is chrome for learning and measurement. Slides and heatmaps are the content; chrome stays quiet.
- **One accent, used sparingly.** Cyan marks action and active state. Navy anchors structure. Everything else is neutral.
- **Data earns decoration.** Heatmap, attention, and progress visuals are functional — no sparkline or gradient filler.
- **Reuse before invention.** Check `components/ui/*` and this system before creating a new pattern.

## 2. Colors

### Brand

| Token | Value | Role |
|-------|-------|------|
| `brand-navy` | `#092f60` | Primary, headings, navigation, primary buttons |
| `brand-cyan` | `#01bcea` | Accent, links, active states, focus ring |
| `brand-cyan-muted` | `#e8f9fd` | Subtle accent backgrounds, selected rows |
| `brand-dark` | `#0a1f3c` | Dark surfaces, app shell in dark mode |

Semantic aliases in `globals.css`: `primary` → `brand-navy`, `ring` → `brand-cyan`, `accent` → `brand-cyan-muted`, `destructive` → `oklch(0.577 0.245 27.325)`.

### Neutrals

`background` `#fff` · `foreground` `#0f172a` · `muted` `#f3f7fa` · `muted-foreground` `#64748b` · `border` / `input` `#d9e3ea` · `card` `#fff`.

Dark mode: `background` → `brand-dark`, `card` → `#102a4c`, `border` → `oklch(1 0 0 / 10%)` — never pure black/white.

### Rules

- **One accent rule.** If a single color must represent EyeLearning, use `brand-navy` for structure, `brand-cyan` for action. Do not add purple, magenta, or neon.
- **No cyan-on-black marketing cliché.** Cyan is for small interactive targets, not full-bleed gradients.
- **OKLCH for data only.** `chart-1…5` are for analytics; do not use them as brand.
- **Contrast.** Text on white must meet 4.5:1 (AA). `brand-navy` on white passes; `brand-cyan` alone does not — use it for borders/icons, not body text.

## 3. Typography

Two families maximum: `--font-sans` (body/UI) and `--font-heading` (display/headline) + `--font-geist-mono` for eyebrow/code. All sizes land on the scale `12 · 13 · 14 · 15 · 16 · 18 · 20 · 24 · 28 · 32 · 40 · 48 · 56`.

| Role | Size | Weight | Line-height | Use |
|------|------|--------|-------------|-----|
| **display** | `clamp(2.5rem, 5vw, 3.75rem)` | 700 | 1.05 | Hero on landing |
| **headline** | `clamp(1.75rem, 3vw, 2.25rem)` | 700 | 1.15 | Section titles |
| **title** | `1.125rem` | 600 | 1.35 | Card/panel headings |
| **body** | `1rem` | 400 | 1.7–1.8 | Long copy, 45–75ch measure |
| **small** | `0.875rem` | 400 | 1.5 | Meta, table cells, helper text |
| **eyebrow** | `0.6875rem` | 600 | 1 | Caps, tracked `0.14em`, uppercase |
| **mono** | `0.75rem` | 500 | 1 | Code, calibration labels |

Rules: display/headline use `font-heading`; everything else uses `font-sans`. Eyebrow/mono use `font-geist-mono`. Never more than two families on one screen. Body weight stays 400.

## 4. Spacing (8px system)

Scale: `4 · 8 · 12 · 16 · 24 · 32 · 48 · 64 · 80 · 112`. Every margin, padding, gap, and gutter lands here.

- Section padding: `64` (desktop) / `32` (mobile)
- Card padding: `24`
- Stack gaps: `16` (tight) / `24` (default) / `32` (loose)
- Grid gutters: `16` / `24`

Do not use `13px`, `18px`, `22px`, or other off-scale values.

## 5. Radius & Shadows

- Radius: `sm` (inputs), `md` (buttons), `lg` (`--radius` = `0.5rem`, cards), `xl`/`2xl` (panels, modals), `full` (pills, avatars). No `rounded-[13px]`.
- Shadows: `card` (subtle, 1px + 4px), `card-hover` (lifted), `focus` (cyan ring `0 0 0 3px rgb(1 188 234 / 0.25)`). No `shadow-2xl` stacks or colored glows.

## 6. Components

### Buttons

- **Primary:** `bg-primary text-primary-foreground` (`brand-navy` / white), `rounded-md`, `h-10` min, `px-6`, `font-medium`. Hover `primary-hover` (`#0d3d78`), active `primary-active` (`#062346`). Focus `ring` (cyan).
- **Secondary:** `bg-secondary` / `border` outline, `text-secondary-foreground`. Same height/radius.
- **Ghost:** transparent, `hover:bg-accent`, `text-foreground`.
- **Destructive:** `bg-destructive text-white`.
- Use `components/ui/button.tsx` variants. Do not recreate per-page button styles.

### Inputs

- `bg-background border-input rounded-md h-10 px-3 text-sm`, placeholder `muted-foreground`, focus `ring` (cyan). Error `border-destructive`. Use `components/ui/input.tsx`.
- Labels `text-sm font-medium`, helper `text-xs text-muted-foreground`, error `text-xs text-destructive`.

### Cards

- `bg-card border rounded-lg p-6 shadow-card`, hover `shadow-card-hover` + `border-brand-cyan/20`. Title `text-title`, body `text-muted-foreground text-sm`. No nested cards. Use `components/ui/card.tsx`.

### Other primitives

Check `components/ui/*` first: `dialog`, `dropdown-menu`, `tabs`, `badge`, `avatar`, `skeleton`, `sonner` (toast). Add new primitives there, not per page.

## 7. Layout

- Max content width `1280px` (`max-w-7xl`), centered, `px-4 md:px-6 lg:px-8`.
- Grid: 12-col with `gap-6` (desktop) / `gap-4` (mobile). Prefer `grid-cols-12` over arbitrary flex hacks.
- Page sections: `py-16 md:py-24` with `gap-12` between sections.
- Never nest cards inside cards; use spacing and dividers instead.

## 8. Responsive rules

- Breakpoints: `sm 640 · md 768 · lg 1024 · xl 1280`.
- Touch targets: `44×44px` minimum. Inputs/buttons meet this via `h-10` + padding.
- No fixed widths that overflow at `375px`. Test at `375`, `768`, `1280` before shipping.
- Images: `w-full h-auto`, correct `aspect-ratio`, `alt` text, no layout shift.

## 9. Accessibility rules

- **Contrast:** 4.5:1 text, 3:1 large/important graphics, 3:1 UI components vs adjacent.
- **Focus:** visible `ring` on every interactive element; never `outline-none` without replacement. Tab order follows DOM order.
- **Semantics:** `button` not `div onClick`, `nav`/`main`/`header` landmarks, heading hierarchy `h1 > h2 > h3` without skipping.
- **Motion:** respect `prefers-reduced-motion` — disable or reduce non-essential animation when set.
- **Forms:** labels associated (`htmlFor`), required indicators, error messages linked via `aria-describedby`.

## 10. Anti-pattern detection

Before shipping, check against these AI-looking patterns — if flagged, the design fails review:

| Pattern | Why it fails | Fix |
|---------|-------------|-----|
| Purple/cyan gradient hero + `backdrop-blur` | Generic AI marketing | Solid `brand-navy` or white hero, no blur |
| Identical-card feature grids (3×2 same height) | No hierarchy, interchangeable | Bento or asymmetric grouping, varied emphasis |
| Sparkline / chart decorations with fake data | Misleading, no function | Remove or bind to real analytics |
| `glassmorphism` panels (`bg-white/10 backdrop-blur-xl`) | Illegible, trendy | Opaque `bg-card border` |
| Hedging copy ("might", "perhaps", "consider") | Weak voice | Direct, specific claims |
| Cyan-on-black dark landing | Cliché AI tool | White ground, navy structure |
| Over-rounded cards (`rounded-3xl` stacks) | Soft, unfocused | `rounded-lg` / `rounded-xl` max |
| Decorative dots/particles/glow orbs | Noise without meaning | Functional dividers or nothing |

Run `/audit` to verify these plus a11y/perf/theming/responsive before merging.

## 11. When to update this file

If a redesign requires a new palette, typeface, radius, or shadow system, update `DESIGN.md` explicitly in the same PR. Do not let components drift from tokens. Token changes need user approval — propose first, change second.
