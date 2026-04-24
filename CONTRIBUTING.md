# Contributing to Joyride Studio

Thanks for considering a contribution! Joyride Studio is a small, solo-maintained project, but PRs are very welcome and the goal is for **every react-joyride capability** to be reachable from the visual helper.

## Getting set up

```bash
git clone https://github.com/parakeet09/joyride-studio.git
cd joyride-studio
cd template && pnpm install     # the runtime template the skill copies into target repos
```

The repo is intentionally minimal at the root: a `SKILL.md` (the agent-facing prompt), a `template/` directory (the source files that get copied into a target repo), and the docs.

## Where to make changes

| If you're changing… | …edit |
|---|---|
| The agent's behaviour | `SKILL.md` |
| The runtime tour code (TourProvider, tooltip, registry, etc.) | `template/src/tour/*.tsx` |
| The capture inspector / settings panel | `template/src/components/dev/*.tsx` |
| The Vite dev plugin | `template/vite-tour-plugin.ts` |
| User-facing docs | `README.md` |
| Roadmap / versioning notes | `ROADMAP.md` / `CHANGELOG.md` |

## High-value contributions

- **Missing react-joyride options.** If the Settings panel doesn't expose a knob react-joyride ships, that's the simplest possible PR. Add it to `SETTINGS_SCHEMA` in `TourSettingsPanel.tsx`, the type in `tourTypes.ts`, and (if it belongs at runtime) the `TourProvider` wiring.
- **Framework support.** v2 targets Next.js. Reach out before starting — the design needs alignment.
- **Mobile polish.** Sticky-header collisions, iOS safe-area handling, gesture conflicts.
- **Documentation + recipes.** Real-world examples for tricky cases (tours across auth states, virtual-scrolled lists).

## Conventions

- TypeScript strict mode. Run `pnpm tsc --noEmit` inside `template/` before opening a PR.
- No new runtime dependencies in `template/` without an issue first — every dep ships into every consuming repo.
- Comments explain *why*, not *what*. The README is the WHAT.
- Don't break the existing capture-format JSON schema without a major version bump.

## Filing issues

Before any large PR, please open an issue describing the problem and the approach you'd like to take. Small fixes (missing options, typo PRs, doc improvements) don't need an issue first.

## License

By contributing you agree that your contributions are licensed under the [MIT License](./LICENSE).
