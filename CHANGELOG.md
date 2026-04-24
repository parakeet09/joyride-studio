# Changelog

All notable changes are documented in this file.

The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added

- **Positioning stability** — `floatingOptions.autoUpdate` is forwarded to react-joyride's underlying `@floating-ui/react-dom` layer so the tooltip stays attached to its target through scroll, ancestor / element resize, and layout shifts. Optional `MutationObserver` mode catches class- or attribute-driven shifts that don't register as resizes.
- **Mobile overrides** — viewport-aware (`matchMedia`) overrides that swap in mobile-friendly placement, beacon size, spotlight padding, scroll offset, tooltip width, and skip-beacon at the step level when the viewport is narrower than a configurable breakpoint (default 768 px). Desktop tours are untouched.
- **Settings panel** gains two new categories ("Positioning Stability", "Mobile") on top of the nine react-joyride playground categories.

## [0.1.0] - Initial release

### Added

- `/joyride-studio init` — scaffold runtime, inspector, and Vite plugin into a React + Vite repo, regenerate the default tooltip + replay button to match the target repo's design system.
- `/joyride-studio start` — enable the in-browser capture inspector behind a `VITE_TOUR_AUTHORING` env gate.
- `/joyride-studio` — convert captured screens into a wired react-joyride tour: AST-inject `data-tour-id` anchors, generate per-screen step files, regenerate the registry, and verify with agent-browser.
- `/joyride-studio verify` — re-run the agent-browser verification pass against existing tours.
- `/joyride-studio clear <screen-id>` — remove one screen's tour wiring while keeping captures.
- `/joyride-studio teardown` — uninstall all skill-installed infra; keeps the `.tour-flow/` capture directory.
- Multi-tour-per-route support via `shouldShow` predicates and `useTourRefreshOnMount`.
- Default `?` replay button + nav/sidebar integration via `useAvailableTours`.
- Schema-driven settings panel covering all nine react-joyride playground categories.
