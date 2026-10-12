# PRODUCT.md — EyeLearning (GazeEdu)

## Product purpose

EyeLearning is a gaze-tracked learning platform. Students study slide-based lessons through a webcam; the system estimates gaze direction (mediapipe + UniGaze) and produces behavioral analytics (heatmaps, attention scores, AOI dwell) for teachers. The core loop is **calibrate → learn → analyze**.

Success = students complete lessons with verified attention; teachers get actionable insight without manual observation.

## Roles

| Role | Primary surface | Core job |
|------|----------------|----------|
| **student** | `student/(viewer)` viewer + `student/(dashboard)` dashboard | Enroll, calibrate webcam, watch slides, get progress feedback |
| **teacher** | `teacher/(dashboard)` + `teacher/(viewer)` heatmap viewer | Create courses/modules/lessons, upload PDF slides, review heatmaps and class attention |
| **admin** | `admin/` | Manage teacher assignments (`course_teachers`), system oversight |
| **guest** | `try/` + landing `page.tsx` | Experience a 3-slide demo without account (no DB writes) |

Other actors: `auth` (login/signup in `account/`), `API/` (ML gaze service — not a UI role).

## Modes (visitor intent per surface)

| Surface | Mode | What success looks like |
|---------|------|------------------------|
| **Landing** (`app/page.tsx`, `components/landing/`) | **Persuade** | Visitor understands the product and reaches CTA (Try / Sign in) |
| **Try flow** (`app/try/`) | **Experience** | Guest completes calibrate → view → result locally, no friction |
| **Student viewer** (`student/(viewer)/courses/[courseId]`) | **Operate** | Complete a lesson efficiently; gaze feedback is ambient, not distracting |
| **Teacher dashboard** (`teacher/(dashboard)/courses`) | **Operate** | Scan class progress, identify struggling students, open heatmaps |
| **Heatmap viewer** (`teacher/(viewer)/.../heatmap`) | **Read** | Understand where attention concentrates (density + hotspots + fixations) |
| **Admin** (`admin/courses`) | **Operate** | Assign/unassign teachers quickly |
| **Account / Profile** (`account/`, `student/(dashboard)/profile`) | **Operate** | Authenticate or update profile without confusion |

> Choose mode from the requested surface, not the product. A teacher's marketing page is still Persuade; a student's help article is still Read.

## Brand personality

**Precise, calm, credible.** EyeLearning is an educational instrument, not a marketing gadget. Visual language should feel like a well-made textbook or lab tool: clean, unhurried, trustworthy.

- **Precise** — measurement matters; calibration marks, grids, and data visuals are functional, not decorative.
- **Calm** — low visual noise; students focus on slides, not chrome.
- **Credible** — no inflated claims; show real heatmap density, not sparkline theater.

Anti-references: purple AI gradients, glassmorphism, neon glow, identical-card SaaS grids, hedging copy ("might", "perhaps").

## Key flows

1. **Landing → Try:** CTA from hero → `try` intro → calibrate (16 points × 5 samples via `POST /gaze/session`) → view 3 demo slides with gaze capture → local heatmap result.
2. **Student learn:** enroll (`POST /api/courses/{id}/enroll`) → open lesson → `POST /api/learning-sessions` → webcam WS `/session/{sid}/stream` → batch `POST /api/lessons/{id}/gaze-samples` → `PATCH /api/lessons/{id}/progress` → end session.
3. **Teacher analyze:** course tree (`GET /teacher/courses/{id}`) → student table + attention → heatmap per slide (`GET /teacher/lessons/{id}/heatmap`) → recompute aggregates.

## Constraints

- Frontend calls backend via **relative** `/api/*` and `/media/*` only (rewrites in `next.config.ts`). Never hardcode `localhost:8001`.
- Gaze coordinates are **normalized [0,1]**; heatmap rendering uses the same space.
- Slide images are `/media/lessons/{id}/slide_*.jpg` served from `MEDIA_DIR`; frontend resolves via `resolveMediaUrl()`.
- Accessibility baseline: **WCAG 2.1 AA** on every surface.
