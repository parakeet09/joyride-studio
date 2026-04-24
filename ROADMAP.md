# Roadmap

Joyride Studio is solo-maintained but actively developed. The plan below is a guide, not a contract — order may shift based on what contributors push and what users hit hardest.

## v1 — React + Vite (current)

Status: shipped.

- Visual capture inspector with 9 react-joyride categories + Positioning Stability + Mobile
- AST-injected `data-tour-id` anchors
- Multi-tour routing with `shouldShow` predicates
- Design-system-matching default tooltip + replay button (regenerated at `init`)
- Agent-browser verification pipeline

## v2 — Next.js support

Goal: the same visual authoring experience for Next.js (App Router and Pages Router).

Specifics:

- SSR-safe capture inspector mount (capture runs only in the browser)
- App Router `'use client'` boundaries respected when injecting anchors
- Route-pattern resolution against Next.js file conventions (`/blog/[slug]`, parallel routes, route groups)
- Drop-in `<TourProvider>` for the Next.js root layout
- CRA + webpack-only setups documented (no Vite plugin path; document the manual mount instead)

## v3 — Richer authoring UI + features

Goal: take the inspector from "functional" to "delightful." Depends on v2 maturing first.

Specifics:

- Drag-to-reorder steps in the capture toolbar
- Live tooltip preview while editing title/body/media
- Per-step diff view (against the global config)
- Tour packs — i18n-ready bundles you can publish as standalone npm packages
- More step-level transitions (slide, fade, ease curves)
- Optional CLI installer (`npx joyride-studio init`) for non-Claude-Code users

## Beyond v3 (ideas, not commitments)

- Theme presets for popular UI libraries (Radix, Mantine, MUI, Ant)
- Tour analytics integration recipes (PostHog, GA, Segment)
- Headless mode — Joyride Studio's authoring inspector but rendering tours via a non-react-joyride engine

## Versioning

Semantic versioning. Breaking changes inside `template/` (which is copied into user repos) are flagged as **major** even if they're internal-looking — because they affect every existing install.
