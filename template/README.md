# Tour Agent — template

Files in this directory are copied into the target repo by `/joyride-studio init`.

**Do NOT import from this directory directly.** The skill copies the files into
the consumer's `src/` tree and updates `vite.config.ts`. This `template/` exists
only so the skill has a self-contained source of truth for what it ships.

## File layout (before copy)

```
template/
├── src/
│   ├── tour/
│   │   ├── TourProvider.tsx          # React context + Joyride wiring
│   │   ├── TourButton.tsx            # "?" button (raw HTML + CSS vars)
│   │   ├── TourTooltip.tsx           # Default tooltipComponent (raw HTML + CSS vars)
│   │   ├── TourMedia.tsx             # text/image/video/iframe dispatcher
│   │   ├── tokens.ts                 # Joyride styles + locale
│   │   ├── registry.ts               # route → tour mapping
│   │   ├── index.ts                  # public barrel
│   │   └── steps/                    # generated per-screen step files land here
│   └── components/dev/
│       ├── TourStepInspector.tsx     # Floating dev toolbar (⌘⇧T)
│       ├── fiberSource.ts            # React 18/19 fiber → source-info walker
│       └── tourTypes.ts              # Shared types
├── vite-tour-plugin.ts               # Named-export Vite plugin
└── README.md                         # this file
```

## File layout (after `/joyride-studio init` copies into a consumer repo)

```
<consumer-repo>/
├── src/
│   ├── tour/          ← copied as-is; init may rewrite TourTooltip/TourButton
│   │                    to use the repo's UI primitives (Button, Box, etc.)
│   └── components/dev/
├── vite-tour-plugin.ts  OR  merged into an existing vite plugins file
├── vite.config.ts       ← init registers `tourPlugin()` here
└── <entry-file>.tsx     ← init inserts env-gated <TourStepInspector />
                           + wraps app in <TourProvider> + adds <TourButton />
```

## Theming strategy

The default `TourTooltip.tsx` uses **CSS variables** (`--tour-bg`, `--tour-text`,
`--tour-primary`, etc.) so it works in any repo with zero extra setup. Consumers
can style it by defining these variables at any ancestor level:

```css
:root {
  --tour-bg: #0f172a;
  --tour-text: #f8fafc;
  --tour-primary: #3b82f6;
  --tour-border: rgba(255,255,255,0.08);
}
```

If the repo has a rich design system (`src/components/ui/` with Button/Box/etc.),
`/joyride-studio init` **regenerates** `TourTooltip.tsx` and `TourButton.tsx` to use
those primitives directly. The consumer ends up with a tooltip that feels native
to the app, not one with generic styling they have to fight.

## Dependencies the consumer repo must have

Added by `/joyride-studio init`:
- `react-joyride@^3` — installed via the consumer's package manager

Already required:
- `react@^18 || ^19`
- `react-router-dom` (for `useLocation`)
- Vite dev server (the plugin is `apply: 'serve'` — no prod impact)

## Why these files stay in the target repo (not a dependency)

Each consumer's tour content, design system, and auth wiring is different.
Keeping the source in the repo lets the developer customize freely — including
editing the inspector's toolbar styling, tweaking the fiber walker for custom
HOC patterns, or swapping the registry format. Updates come from re-running
`/joyride-studio init --update`, which diffs against the template version.
