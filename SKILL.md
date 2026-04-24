---
name: joyride-studio
description: Visual helper for react-joyride in any React + Vite repo. `/joyride-studio init` scaffolds an in-browser capture inspector, the tour runtime, and a vite plugin. `/joyride-studio start` enables authoring so developers click real elements in the running app to define tour targets. `/joyride-studio` turns captures into a wired React Joyride tour with design-system-matching UI, positioning-stability guarantees, and viewport-aware mobile overrides. Triggers on `/joyride-studio init`, `/joyride-studio start`, `/joyride-studio`, `/joyride-studio verify`, `/joyride-studio clear <screen-id>`, `/joyride-studio teardown`.
---

# Joyride Studio — Visual helper for react-joyride

> **What this is:** a visual authoring layer on top of [react-joyride](https://docs.react-joyride.com). Instead of hand-writing `Step` objects and hunting for CSS selectors, you click the real elements in your running app and the skill injects stable `data-tour-id` anchors and generates a wired tour file.
>
> **What this is _not_:** a replacement for react-joyride. This skill uses react-joyride's full API under the hood and exposes every option it ships — plus a few joyride-studio extras (positioning stability, viewport-aware mobile overrides, per-screen multi-tour registry). If you prefer to write tours by hand, the [react-joyride skill](https://docs.react-joyride.com) is the lighter-weight alternative; the two are complementary.
>
> **Contributions welcome.** This is an open-source project — PRs for missing Joyride options, better framework support (Next.js v2, richer UI v3), and mobile polish are all on the table.

## What ships in the template

The files the skill copies into the target repo on `init`:

| Path | What it is |
|---|---|
| `src/tour/TourProvider.tsx` | React context — uses `useJoyride()` hook, exposes full `Controls` + `failures` + `on(event, handler)` via `useTour()` |
| `src/tour/TourTooltip.tsx` | Default tooltipComponent (CSS-var driven). Regenerated during `init` to match the repo's UI library |
| `src/tour/TourButton.tsx` | `?` replay button |
| `src/tour/TourMedia.tsx` | text / image / video / iframe dispatcher |
| `src/tour/tokens.ts` | `styles` + `locale` passed to Joyride |
| `src/tour/registry.ts` | `TOUR_REGISTRY` array, `getTourForPath` iterates all matches + `shouldShow` predicates |
| `src/components/dev/TourStepInspector.tsx` | Floating toolbar: **Capture** tab (screen + step capture) and **Settings** tab (global config across 11 categories) |
| `src/components/dev/TourSettingsPanel.tsx` | Schema-driven form covering the 9 react-joyride categories — Tour Options, Appearance, Arrow, Beacon, Overlay & Spotlight, Scroll Behavior, Interactions, Custom Components, Locale — plus two joyride-studio additions: **Positioning Stability** (floating-ui `autoUpdate` + MutationObserver) and **Mobile** (viewport-aware overrides). PATCHes to `.tour-flow/config.json`. |
| `src/components/dev/tourTypes.ts` | Full `TourGlobalConfig` + `TourStepBehavior` type schema mirroring Joyride's Options |
| `src/components/dev/fiberSource.ts` | React 18/19 fiber → source-info walker |
| `vite-tour-plugin.ts` | Dev REST: `/__tour-step/screens/*` + `/__tour-step/config` |

## Commands

Run in order the first time; subsequent runs skip what's already in place.

| Command | Purpose | Typical timing |
|---|---|---|
| `/joyride-studio init` | One-time setup: detect framework, install `react-joyride`, copy template files, register vite plugin, wire the TourProvider, generate UI components that match the target repo's design system. | Once per repo. |
| `/joyride-studio start` | Enable authoring: insert the env-gated `<TourStepInspector />` mount, print instructions to set `VITE_TOUR_AUTHORING=true` in `.env.local` and restart dev. | Whenever you want to capture/edit screens. |
| `/joyride-studio` | Build the tour: load captures → per-screen conditional-mount interview → inject `data-tour-id`s → generate step files → update registry → remove authoring mount → agent-browser verify. | After each round of captures. |
| `/joyride-studio verify` | Verify-only: run the app, trigger each tour, screenshot each step, confirm anchors resolve. | After CI or when refactoring targets. |
| `/joyride-studio clear <screen-id>` | Remove wiring for one screen (step file + registry entry). Captures + `data-tour-id` attrs stay. | When retiring a tour. |
| `/joyride-studio teardown` | Remove all skill-installed infra (runtime, inspector, plugin, mount, dep). Does NOT delete `.tour-flow/` captures. | If you want to stop using the agent. |

## Framework gate — checked by every command

Read `package.json` at the most likely locations (`./package.json`, `packages/*/package.json`, `apps/*/package.json` — find the one with `vite` in `devDependencies`):

- Must have `vite` in deps or devDeps. If not: stop with "joyride-studio v1 supports Vite only — Next.js/CRA/Webpack need v2."
- `react` must be `^18` or `^19` (major version).
- `next` must NOT be in deps (v1 scope).
- If multiple React apps are found, ask the user which one to target before proceeding.

Call the chosen app's folder `<APP>` in the rest of this doc. For a single-package repo, `<APP>` is the repo root.

### Locate `.tour-flow/` correctly

The vite plugin stores captures at `<cwd-of-vite-process>/.tour-flow/screens/`, not necessarily at the repo root. In a monorepo where Vite runs from a workspace folder (e.g. `apps/web/` or `<APP>/`), captures land inside that folder's `.tour-flow/screens/`. The skill must search `<APP>/.tour-flow/screens/` **first**, then the repo root as a fallback. When seeding captures in `/joyride-studio init`, create the directory at `<APP>/.tour-flow/screens/`.

---

## `/joyride-studio init` — one-time scaffolding

Skill's files live at `.claude/skills/joyride-studio/template/`. This command copies them into `<APP>/` and wires everything up.

### Step 1 — Detect the repo's design system

Read **in this order, stop at the first hit**:

1. Look for a design-docs directory on known paths, in this priority order:
   - `<APP>/docs/DESIGN_TOKENS.md` + `COMPONENT_LIBRARY.md`
   - `<APP>/docs/design-tokens.md`, `components.md`
   - `<APP>/.claude/rules/DESIGN_TOKENS.md`, `COMPONENT_LIBRARY.md`
   - Any `docs/DESIGN*.md` or `docs/COMPONENTS.md`
2. Look for UI-primitive imports. Run `grep -rE "from ['\"](.*components/ui)" <APP>/src -l | head -5`. If any match, read 1–2 candidate primitive files (`Button`, `Box`, `IconButton`, `Input`) to learn the prop shape.
3. Look for popular UI libraries in `package.json`: `@chakra-ui/react`, `@mantine/core`, `@mui/material`, `antd`, `react-aria-components`, `@radix-ui/*`, shadcn-style (`components/ui/button.tsx`).
4. Look for Tailwind: `tailwind.config.{js,ts}` + inspect `content` paths.

Record the findings in memory for step 3. Tell the user what was detected:
```
Detected design system:
  ✓ Tailwind v4 (from tailwind.config.js)
  ✓ Primitives under src/components/ui/ — Button, Box, IconButton (CVA-based with enum variants)
  ✓ Design tokens documented in docs/DESIGN_TOKENS.md
```

### Step 2 — Install `react-joyride`

Detect the package manager (`pnpm-lock.yaml` → pnpm, `yarn.lock` → yarn, else npm). Run the install in `<APP>`:
```bash
pnpm add react-joyride
```

### Step 3 — Copy template files

Copy the skill's `template/` directory into `<APP>/`:

| From (in skill) | To (in target repo) |
|---|---|
| `template/src/tour/*.tsx` + `*.ts` | `<APP>/src/tour/` |
| `template/src/components/dev/*.tsx` + `*.ts` | `<APP>/src/components/dev/` |
| `template/vite-tour-plugin.ts` | `<APP>/vite-tour-plugin.ts` |

**Idempotency:** If `<APP>/src/tour/TourProvider.tsx` already exists, diff against the template. For each file:
- Byte-identical → skip silently.
- Different → ask: "keep existing / overwrite / show diff." Never overwrite without consent. Good for `init --update`.

### Step 4 — Generate UI components to match the detected design system

The copied defaults (`TourTooltip.tsx`, `TourButton.tsx`, `TourMedia.tsx`) use raw HTML + CSS variables. If step 1 found a design system, **rewrite** these three files to use the repo's primitives instead.

**Rules for generation:**
- Read 1–2 real primitive source files to verify the exact prop API. Do not copy from docs.
- Respect the repo's import alias (`@/` vs relative). Check `tsconfig.json` paths.
- Respect typography / spacing / token docs verbatim — do not invent classes.
- For Tailwind repos, use the design tokens from the docs (e.g. `bg-card`, `text-text-default`, `border-border-subtle-01`).
- For CSS-module / styled-components repos, import styles from the repo's conventions.
- Keep the **same external API** as the default (Joyride `TooltipRenderProps`, the `useTour()` hook contract). Only the visual internals change.
- Preserve key behaviours verbatim: `requireInteraction` target-click listener, the `{step.content}` render, button/skip/close props spread, progress indicator.

Print a diff summary:
```
Regenerated src/tour/TourTooltip.tsx using Box, Button, IconButton
Regenerated src/tour/TourButton.tsx using IconButton with IconButtonSize.MD
Kept src/tour/TourMedia.tsx as-is (no media-specific primitives detected)
```

If no design system was detected, **leave the defaults untouched** and print:
```
Using bundled defaults (raw HTML + CSS variables).
Override by defining --tour-bg, --tour-text, --tour-primary, etc.
```

### Step 5 — Register the Vite plugin

Find `<APP>/vite.config.{ts,js}`. Locate the `plugins: [...]` array and add `tourPlugin()`:
```ts
import { tourPlugin } from './vite-tour-plugin';
// ...
plugins: [react(), /* existing */, tourPlugin()],
```

If the repo has a dedicated plugin file (`vite-plugins.ts`), merge into that instead. If an existing plugin with `name: 'tour-flow'` is already registered, skip.

**Patch `tsconfig.node.json` if it exists.** Some Vite scaffolds have a separate `tsconfig.node.json` with an `include` list that covers `vite.config.ts` and similar. Append `"vite-tour-plugin.ts"` to that list so the new import in `vite.config.ts` type-checks under strict mode:

```diff
- "include": ["vite.config.ts", ...]
+ "include": ["vite.config.ts", ..., "vite-tour-plugin.ts"]
```

### Step 6 — Wrap the app + mount the tour trigger

Find the app entry (priority: `<APP>/src/main.tsx`, `main.jsx`, `index.tsx`, `index.jsx`). Locate the `<BrowserRouter>` / router wrapper — `TourProvider` must be **inside** the router (needs `useLocation`).

Always wrap:
```tsx
import { TourProvider } from '@/tour';

<TourProvider autoStart={/* see Step 7 */} userId={/* see Step 7 */}>
  <App />
  {/* trigger goes here — see below */}
</TourProvider>
```

`TourProvider` reads the rest of its behaviour from `.tour-flow/config.json`
at build time, but two joyride-studio extras are also exposed as props if the
consumer wants to override programmatically:

```tsx
<TourProvider
  autoStart={isNewUser}
  userId={user?.sub}
  // Keep the tooltip glued to its target when scroll/resize/animation moves it.
  positioningStability={{
    autoUpdate: true,          // floating-ui autoUpdate (on by default)
    observeMutations: false,   // opt-in MutationObserver for DOM mutations
  }}
  // Swap in mobile-friendly values when the viewport is narrower than 768px.
  mobile={{
    enabled: true,
    breakpoint: 768,
    placement: 'center',       // full-screen modal-style steps on phones
    skipBeacon: true,
  }}
>
  <App />
</TourProvider>
```

Leaving these off is fine — the defaults baked into the generated
config file already cover 90 % of real-world tours.

Then **ask the user where to mount the replay trigger** (one question, numbered options):

```
Where should users find guided tours from outside a fresh run?

  1. Default — a "?" button bottom-left of the screen, opens a menu with
     every tour available on the current page (recommended; zero setup).
  2. Navbar / header — point me at your nav component; I'll add a menu item there.
  3. Side menu / settings panel — same, but in a sidebar/help item.
  4. Manual — I'll render a trigger myself using useAvailableTours.
```

**Option 1 (default):** add `<TourButton />` right inside `<TourProvider>`:
```tsx
import { TourProvider, TourButton } from '@/tour';
// ...
<TourProvider ...>
  <App />
  <TourButton />
</TourProvider>
```
`TourButton` auto-hides when the current route has zero tours, and when clicked opens a dropdown listing every tour matching the current route (each with a play button). Multi-tour pages become discoverable without extra wiring.

**Option 2/3 (nav / side-menu integration):** skip `<TourButton />`. Ask the user for the path to their nav/sidebar component. Open that file and inject a trigger using the `useAvailableTours` hook + the repo's own menu primitives (detected in Step 1 — Button, Menu, MenuItem, Drawer, etc.):
```tsx
import { useAvailableTours } from '@/tour';
// + the repo's Menu primitives (detected during init)

function NavHelpMenu() {
  const { tours, play } = useAvailableTours();
  if (tours.length === 0) return null;
  return (
    <Menu label="Guided tours">
      {tours.map((t) => (
        <MenuItem key={t.tourSlug} onClick={() => play(t.tourSlug)}>
          {t.name ?? t.tourSlug}
        </MenuItem>
      ))}
    </Menu>
  );
}
```
Render the new component in the nav/sidebar at the parent-chosen location. It must live inside the `<TourProvider>` subtree to consume the hook.

**Option 4 (manual):** do nothing here; note in the final report that the developer will render a trigger themselves via `useAvailableTours` or `useTour()`.

Do NOT insert `<TourStepInspector />` here. That's done by `/joyride-studio start` with the env gate.

### Step 7 — Interview the developer for auto-start + userId

Ask (in one message):

1. **What variable tells your app a user is new?** Paste an expression the skill can inline.
   Examples: `isNewUser`, `!localStorage.getItem('tour.seen')`, `user?.metadata?.creationTime === user?.metadata?.lastSignInTime`, `false` (never auto-start).
2. **What identifies the current user for completion tracking?** Same treatment.
   Examples: `user?.id`, `user?.sub`, `session?.userId`, `null` (no persistence).

Substitute these into the `<TourProvider>` props you just inserted. If the expressions reference identifiers that aren't imported yet, **print a reminder** — don't auto-add auth imports.

Write both to `.tour-flow/config.json`:
```json
{
  "autoStartExpr": "isNewUser",
  "userIdExpr": "user?.sub",
  "continuous": true,
  "showProgress": true,
  "showSkip": true,
  "overlayClickAction": "close",
  "dismissKeyAction": "close"
}
```

### Step 8 — Seed `.tour-flow/` and `.env.local`

- `mkdir -p <repo-root>/.tour-flow/screens`
- Write `<repo-root>/.tour-flow/.gitkeep` so the dir survives fresh clones when empty.
- Check `<repo-root>/.env.local`. If it doesn't have `VITE_TOUR_AUTHORING`, add a commented hint:
  ```
  # Uncomment to enable the Tour Inspector (⌘⇧U) during authoring:
  # VITE_TOUR_AUTHORING=true
  ```

### Step 9 — Report

Print the final checklist:
```
✓ Installed react-joyride
✓ Copied template files to src/tour/ and src/components/dev/
✓ Regenerated TourTooltip to use your Box + Button primitives
✓ Registered tourPlugin in vite.config.ts
✓ Wrapped app in TourProvider (autoStart=isNewUser, userId=user?.sub)
✓ Seeded .tour-flow/
✓ Wrote .env.local hint

Next:
  1. Restart your dev server so the plugin loads
  2. Set VITE_TOUR_AUTHORING=true in .env.local
  3. Run /joyride-studio start to enable capture
  4. Press ⌘⇧U on any page to open the Tour Inspector
```

---

## Workflow

### Phase 0 — Load context

1. Read captures from `<APP>/.tour-flow/screens/*.json` (primary) OR `<repo-root>/.tour-flow/screens/*.json` (fallback for single-package repos). Each file is a `TourScreenCapture`:
   ```ts
   { screenId, route, description, steps: TourStepEntry[], createdAt, updatedAt }
   ```
2. Read `.tour-flow/config.json` if present (global Joyride config). Absent → go through Phase 1 interview.
3. Read design docs in this order (skip missing):
   - `<APP>/docs/DESIGN_TOKENS.md`
   - `<APP>/docs/COMPONENT_LIBRARY.md`
   - `<APP>/docs/TYPOGRAPHY_GUIDELINES.md`
   - `<APP>/docs/THEMING_GUIDE.md`
   (or the equivalent path patterns discovered in Step 1 of `/joyride-studio init`)
   Use these as quality reference when generating tooltip copy or media defaults.
4. Read the existing `src/tour/registry.ts` to learn which tours are already wired.
5. Read `src/main.tsx` to locate the authoring mount block (sentinels: `{/* tour-inspector-mount: ... */}` and `{/* end tour-inspector-mount */}`).

Report:
```
Loaded N screens (M total steps): landing.hero (3 steps), editor.normal (5 steps), ...
Existing registry entries: <list or "none">
```

### Phase 1 — Global config interview (first run only)

If `.tour-flow/config.json` does not exist, ask the user these questions (one message, numbered):

1. **Auto-start signal.** What variable in your code tells the app the user is new / should see the tour?
   - Examples: `isNewUser` from an auth/user-sync response, `firstLogin` from Firebase, `account_age_days < 1` computed from your auth, `localStorage` (just check for completion marker).
   - Ask the user to name the variable/expression and where it's available (e.g. "`useAuth()` context returns `isNewUser`").
   - Write this to `.tour-flow/config.json.autoStartExpr` as a string — the skill uses it to wire `<TourProvider autoStart={<expr>}>` in main/entry.
   - If the user says "don't auto-start," set to `'false'`. The `?` button is the only entry point.
2. **Continuous or discrete.** Auto-advance with Next button (continuous) or manual control only?
3. **Progress indicator.** Show "N of M" in the tooltip footer? (yes/no)
4. **Skip button.** Show Skip in the footer? (yes/no)
5. **Overlay click.** When the user clicks the dim backdrop, close the step, advance, or do nothing? (close/next/false)
6. **ESC key.** Same options as overlay.

Write the answers to `.tour-flow/config.json` using the `TourGlobalConfig` type shape from `<APP>/src/components/dev/tourTypes.ts`. Add z-index (default 1000), scrollDuration (400), scrollOffset (40) with the defaults unless the user has strong opinions.

### Phase 2 — For each screen capture

Process screens in alphabetical order. For each:

#### 2.1 Resolve target frame per step

Each `TourStepEntry` has:
- `stackTrace: StackFrame[]` — full fiber chain, innermost first (up to 8 frames)
- `targetFrameIndex: number` — the default the inspector recorded at capture time (first non-primitive frame)

**The skill picks the final target frame, not the developer.** The inspector no longer exposes a picker — it records the default and trusts the skill to refine it.

**The captured `classes`+`text`+`tag` fields are ground truth; stack frames are hints.**

React 19's `_debugStack` (used to build the stack trace) is unreliable — the innermost frame often doesn't match the clicked element. File contents also drift between capture and build (line numbers go stale). The skill must prefer content-matching over line-following.

Decision algorithm:

1. **Class-match first.** Search the capture's `fileName` (from `stackTrace[targetFrameIndex]`) for the captured `classes` string. If unique, use that line. If multiple matches, narrow by nearby `text` or `tag`.
2. **Line fallback.** If no class match: fall back to `stackTrace[targetFrameIndex].lineNumber`. Walk outer frames if the frame is in `node_modules` / primitive dirs (`src/components/ui/` or repo-configured) / React framework files (`react/`, `react-dom/`, `react-router/`).
3. **Validate.** Read the chosen line and the next 5 lines. Bail to next-outer frame if no JSX opening tag.
4. **Exhaustion.** If all strategies exhausted, report the failure with the step's `title` + `tag` + `selector` + `classes`, skip this step, continue with others.
5. **Always report which strategy picked each target** so the developer can override (by editing the capture JSON or rearranging components).

This is an agent decision. Do not ask the developer to pick a frame. Only surface the decision in the final report.

#### 2.2 Inject `data-tour-id`

The `data-tour-id` value is **`<screenId>.<step.order+1>`** (1-based human-friendly indexing, matching the inspector UI).

Resolve the absolute path: `<APP>/` + `fileName` (the fileName stored in stackTrace is already a workspace-relative path like `src/components/...`).

For each step, in order:

1. **Read** the target file.
2. **Find the JSX opening tag** nearest to `lineNumber` (on that line or within the next 5 lines). Heuristic: look for a line matching `<[A-Z][A-Za-z0-9]*` (capitalized component) or `<[a-z]+` (lowercase HTML element). Prefer matches on `lineNumber` exactly.
3. **Check for existing `data-tour-id`** on that element:
   - Already present with the same value → skip (idempotent).
   - Already present with a different value → **ask user**: keep existing, overwrite, or add a second id? Never silently overwrite.
   - Not present → insert ` data-tour-id="<value>"` right after the opening tag name, before any other attributes.
4. **Write** the file. Record the edit in a running list for the final report.

If any injection fails (file not found, tag not located, etc.) — **do not generate the step file for that screen**. Report the failure and continue to the next screen. Partial success is acceptable; the user can re-run after fixing.

#### 2.3 Build Joyride step objects

For each `TourStepEntry`, construct a `Step` with the shape below. **Always use the injected `data-tour-id` as the target** unless injection failed (then use `selector` as fallback, with a `// TODO` comment).

Translate `TourStepBehavior` → Joyride Step fields:

| TourStepBehavior flag | Joyride field |
|---|---|
| `requireInteraction` | `data: { requireInteraction: true }` + emit a `before: (data) => new Promise(resolve => { const el = document.querySelector(step.target); el?.addEventListener('click', resolve, { once: true }); })` hook on the Step. The default TourTooltip also reads `data.requireInteraction` to hide the Next button |
| `hideClose` | `buttons: [...without 'close']` |
| `hideBack` | `buttons: [...without 'back']` |
| `hideFooter` | `buttons: []` (empty — tooltip is display-only) |
| `skipBeacon` | `skipBeacon: true` |
| `skipScroll` | `skipScroll: true` (default is false so off-screen anchors scroll in) |
| `isFixed` | `isFixed: true` |
| `hideOverlay` | `hideOverlay: true` |
| `blockTargetInteraction` | `blockTargetInteraction: true` |
| `spotlightPadding` | `spotlightPadding: <n>` |
| `spotlightRadius` | `spotlightRadius: <n>` |
| `targetWaitTimeout` | `targetWaitTimeout: <n>` |

Translate `TourStepMedia` → `content`:

| media.kind | content JSX |
|---|---|
| `text` | `<TourMedia kind="text" body={<>{body}</>} />` |
| `image` | `<TourMedia kind="image" src="..." alt="..." body={<>{body}</>} />` |
| `video` | `<TourMedia kind="video" src="..." body={<>{body}</>} />` |
| `iframe` | `<TourMedia kind="iframe" src="..." title="..." body={<>{body}</>} />` |

#### 2.4 Generate the step file

Write to `<APP>/src/tour/steps/<screenId>.tsx`:

```tsx
// GENERATED by /joyride-studio — do not edit.
// Re-run /joyride-studio to regenerate from .tour-flow/screens/<screenId>.json.
//
// Source capture: <screenId>
// Description: <description>

import type { Step } from 'react-joyride';

import { TourMedia } from '../TourMedia';

const <camelCaseScreenId>Steps: Step[] = [
  // ... step objects
];

export { <camelCaseScreenId>Steps };
```

Name convention: `landing.hero` → `landingHeroSteps`. Dots and dashes collapse into camelCase boundaries.

### Phase 3 — Update registry (with description-driven conditional mount)

Regenerate the `// ========== GENERATED REGISTRY ==========` block in `src/tour/registry.ts`. Preserve everything outside that block.

For each captured screen:

#### 3.1 Route pattern inference

- Query string stripped (`/presentation?id=abc` → `/presentation`).
- Dynamic segments (UUID / numeric) replaced with `/*` prefix pattern. Ask the user if the heuristic isn't obvious.
- Exact root `/` stays as `/`.

#### 3.2 Conditional mount — read the description carefully

The screen's `description` field tells you *when* this tour applies. Don't just match on URL. Parse the description for state conditions:

| Description pattern | Implies | Skill action |
|---|---|---|
| "Landing page … unauthenticated visitor" | `!isAuthenticated` — Landing shown at `/` when guest | Add `shouldShow: () => !document.querySelector('[data-auth=\"true\"]')` OR ask user for the right predicate |
| "Generator home in idle state" | `generatorState === 'idle'` | Ask: "What expression is true when GeneratorApp is in idle state?" Developer answers `window.__gen?.state === 'idle'` or similar |
| "Editor, default post-generation state" | no additional gate | route match alone |
| Anything naming a specific condition | extra state check needed | Ask the user to provide the predicate expression |

**When ambiguous: ask.** One Q per captured screen, grouped in one message:
```
I see three screens. The descriptions suggest some need extra conditions
beyond URL match. Please confirm:

1. landing.hero — "Landing page hero, unauthenticated visitor"
   Suggested gate: !isAuthenticated
   Where does your app expose this?  [answer options or "use URL only"]

2. generator.idle — "Generator home in idle state"
   Needs extra gate. What expression is true only in idle?

3. editor.normal — "Editor, default post-generation state"
   URL match alone should work. Confirm?  [yes / need extra gate]
```

Based on answers, generate the `shouldShow` predicate. The registry entry becomes:

```ts
{
  tourSlug: 'landing.hero',
  route: '/',
  shouldShow: () => !window.__auth?.isAuthenticated,   // from user's answer
  steps: landingHeroSteps,
},
```

Writes to registry in the order they appear in `.tour-flow/screens/` (alphabetical). First matching entry wins — if two tours could apply to the same URL, the ordering defines precedence. More specific (with `shouldShow`) should come before less specific.

**Multiple tours per route require the `shouldShow` predicate to be DOM-probing.** Two tours on the same route should each have a `shouldShow` that queries for that tour's distinctive first-step anchor:

```ts
shouldShow: () =>
  typeof document !== 'undefined' &&
  !!document.querySelector('[data-tour-id="<slug>.1"]')
```

Anchors are mutually exclusive (one view is mounted at a time), so the two predicates act as a disambiguator. `getTourForPath` iterates all route matches and returns the first survivor. Generate a DOM-probe `shouldShow` by default when two captured screens share the same route pattern — unless the developer supplies a different expression.

#### 3.3 The `?` button does NOT need manual mount per screen

`TourButton` reads the registry via `useTour()` — if `getTourForPath(pathname)` returns null OR `shouldShow()` returns false, the button renders null automatically. So the single global mount in main/entry is correct — never add `<TourButton />` inside individual screen components.

The job of this phase is wiring the registry, not the mount.

**Views that own tour anchors must call `useTourRefreshOnMount()`.** Without this, `TourProvider` never re-runs its registry lookup when the user crosses sub-states on the same route (e.g. `idle` → `outline` on `/`), and the `?` button stays hidden while the wrong tour remains "active." Add this import + call at the top of each such view:

```tsx
import { useTourRefreshOnMount } from '@/tour';

export function MyView(...) {
  useTourRefreshOnMount();
  // ...
}
```

The build step must patch every view component that owns a step's injected anchor. Identify these by grouping Phase 2.2's injection list by file; the top-level component in each file is a refresh target. Skip the patch if the file already imports and calls `useTourRefreshOnMount`.

### Phase 3.5 — Wire the autoStart signal in `main.tsx`

From `.tour-flow/config.json`, read `autoStartExpr` (set during Phase 1). Locate the `<TourProvider>` element in main/entry and ensure its `autoStart` prop is wired correctly.

Examples by repo:

**Auth-sync pattern** — `isNewUser` arrives with a post-login `/users/sync` response:
```tsx
// AuthenticatedApp resolves isNewUser in an effect. Lift it to a state ref
// exposed via a small context, OR read from localStorage, OR window flag.
// Simplest: set window.__isNewUser in AuthenticatedApp's useEffect when syncUser resolves.
// Then:
<TourProvider autoStart={typeof window !== 'undefined' && window.__isNewUser === true}>
```

**Firebase-based app**:
```tsx
const { user } = useAuth();
const isNewUser = user?.metadata.creationTime === user?.metadata.lastSignInTime;
<TourProvider autoStart={isNewUser}>
```

**localStorage-only (no auth signal)**:
```tsx
<TourProvider autoStart={!localStorage.getItem('tour.everCompleted')}>
```

**Manual-only**:
```tsx
<TourProvider>   // autoStart defaults to false
```

The skill:
1. Reads `autoStartExpr` from config.
2. Finds the existing `<TourProvider>` JSX in main.tsx (or the app's entry file).
3. Inserts or replaces the `autoStart={<expr>}` prop.
4. If the expression references identifiers not yet in scope, prints a reminder — it's the developer's responsibility to ensure those identifiers resolve. Do not auto-wire auth imports.

Additionally, also wire the `userId` prop — needed for completion-state namespacing. Ask the user once where to get it (typically the same place as `autoStartExpr`).

**If your autoStart signal is set asynchronously** (e.g. `window.__isNewUser` written in a post-login effect), pair it with a manual refresh so `TourProvider` re-resolves once the flag lands. Two options:

Option A — dispatch the event (simplest):
```tsx
useEffect(() => {
  if (userSynced && user) {
    window.__isNewUser = !!syncedUser.is_new_user;
    window.requestAnimationFrame(() => {
      window.dispatchEvent(new Event('tour:refresh'));
    });
  }
}, [userSynced, user]);
```

`TourProvider` listens for `tour:refresh` on `window` and re-runs its registry lookup. No code changes to `TourProvider` needed — the listener is built in.

Option B — bind autoStart to the synced state directly:
```tsx
<TourProvider autoStart={userSynced && isNewUser}>
```
Works when the signal is already in React state. Rerender triggers the refresh automatically.

### Phase 4 — Remove authoring mount from `main.tsx`

Find the sentinels in `<APP>/src/main.tsx`:

```tsx
{/* tour-inspector-mount: managed by /joyride-studio skill — do not edit manually */}
{import.meta.env.DEV && import.meta.env.VITE_TOUR_AUTHORING === 'true' && (
  <TourStepInspector />
)}
{/* end tour-inspector-mount */}
```

Delete everything from the start sentinel to the end sentinel (inclusive). Also remove the import line:
```tsx
import { TourStepInspector } from './components/dev/TourStepInspector.tsx';
```

**Do NOT** delete:
- `TourStepInspector.tsx` (infra stays for future captures)
- The vite plugin `tourPlugin` in `vite-plugins.ts`
- `.tour-flow/` directory or its contents
- `TourProvider` / `TourButton` / runtime files

### Phase 5 — Verify

Start the dev server if not running (tell user to run `pnpm dev` in another terminal; don't background it yourself).

For each generated tour, via `agent-browser --headed --session joyride-studio-verify`:
1. Navigate to the tour's route.
2. Clear localStorage completion key.
3. Trigger the tour (either by setting it to auto-start through a URL param the app honors, or by calling `controls.start()` via `window.__tour` if exposed — or simply click the `?` button).
4. For each step: screenshot to `docs/screenshots/joyride-studio/<screenId>/step-<n>.png`.
5. Detect failures: if Joyride logs `error:target_not_found` in the console, flag that step.

Report at the end:
```
✓ 3 screens wired, 12 steps total
✓ 3 injections, 0 failures
✓ Mount removed from main.tsx
✓ All anchors resolve (screenshots in docs/screenshots/joyride-studio/)
```

---

## Idempotency

- Re-running `/joyride-studio` is safe. Generated files (step files, registry block) are fully regenerated.
- `data-tour-id` attributes are not removed on re-run — if the capture file is edited with a new order, old attributes will be stale. The skill's Phase 2.3 detects existing `data-tour-id` and warns; the user decides whether to keep or overwrite.
- `.tour-flow/config.json` persists between runs. Re-ask only if the user requests `/joyride-studio --reconfigure`.

## Anti-patterns

- **Never** silently overwrite an existing `data-tour-id` with a different value. Always confirm.
- **Never** edit files under `src/components/ui/` without explicit confirmation — these are shared primitives.
- **Never** proceed if the framework gate fails. Hard-fail with a clear message.
- **Never** delete captures from `.tour-flow/screens/` during build — they are the source of truth.
- **Never** silently suppress `disableBeacon`-style type errors from generated step files. Joyride v3's `Step` type evolved; the correct flags are in the behavior mapping table (e.g. `skipBeacon`, not `disableBeacon`). If TypeScript flags a field, the skill's step template is wrong — fix the template, don't ship invalid code.

## Cross-repo portability notes

This skill is scoped to React + Vite today. When porting to another repo:
- `<APP>/` → whichever folder hosts the React app (read `package.json` at repo root or common candidates)
- Design doc paths are repo-specific; fall back to asking the user if the standard docs are absent
- `src/tour/` → adjust if the project uses a different `src/` layout (read `tsconfig.json` `paths` for `@/`)
- Authoring mount location → `main.tsx` for Vite, `app/layout.tsx` (with `'use client'`) for Next.js App Router, `_app.tsx` for Pages Router (v2)

## Common issues

**"Target not found" on verify** — the `data-tour-id` was injected but the component is conditionally rendered. Add `targetWaitTimeout` in the capture form, or pick an outer frame that's always mounted.

**Tooltip overlaps scrollbars on long pages** — Joyride auto-scrolls by default (`skipScroll: false`). If a target is inside a scroll container, Joyride handles the scroll. If the overlap happens during the scroll, increase `scrollDuration` in `.tour-flow/config.json`.

**`?` button doesn't show** — only renders when `getTourForPath(location.pathname)` returns a tour. Check `registry.ts` has an entry whose `route` matches.

**Dark-mode conflicts** — the generated tooltip uses whatever token classes the repo's design system exposes (e.g. `bg-card`, `text-text-default`) so theme switching should just work. If your dark-mode is scoped by a data attribute (e.g. `body[data-some-page].dark`), the tooltip inherits it through the portal. If you see contrast issues, update `<APP>/src/tour/tokens.ts` — it references CSS vars like `var(--card)` / `var(--tour-bg)` / etc.

**Inspector shortcut does nothing.** The default (⌘⇧U) was chosen because the previous default (⌘⇧T) collides with the browser's "reopen closed tab" shortcut in Chrome/Firefox/Safari — `preventDefault` doesn't reliably suppress it in Safari. If ⌘⇧U also collides with something in your setup, change the keydown check in `TourStepInspector.tsx` (one line).

**"Inspector is mounted but nothing happens on the shortcut."** Probe with `document.querySelector('[data-tour-inspector-root]')` — if that returns `null`, the env gate failed (Vite dev server wasn't restarted after `.env.local` changed; Vite reads env vars only at startup).

**`data-tour-id` injection succeeds but Joyride says `target_not_found`.** The component's wrapper doesn't forward the `data-*` attribute to the DOM. This is common for hand-rolled wrappers that only spread whitelisted props. Either: (a) switch to an ancestor plain-DOM element for injection, or (b) modify the wrapper to accept `...rest` and forward to its underlying DOM node.

**Inspector checkboxes don't show up in the form.** Tailwind's preflight (or any global `input { appearance: none }`) can zero out native controls. The template sets `appearance: auto` + `colorScheme: dark` + explicit `width/height` on each checkbox — if you still see invisible boxes, check for conflicting global styles or a reset layer applied after the inline styles.

**Tooltip footer misaligns / buttons clip on narrow content.** The default `TourTooltip` is fluid between `260px` and `420px`; footer uses flex-wrap with `rowGap` so Back/Skip/Next wrap to a second row on narrow widths instead of overlapping the progress text. A dev-only `useEffect` measures shell + footer `scrollWidth` vs `clientWidth` after each render and logs `[tour] tooltip content overflows...` to the console when clipping is detected. If you hit that warning: shorten the step title/body, or override `--tour-max-width` (or set a wider tooltip `width` via the Settings panel → Appearance → `width`).

**`?` button doesn't appear even though a tour is registered.** The default `TourButton` only renders when `availableTours.length > 0`. Check: (a) the current pathname matches an entry's `route` in `src/tour/registry.ts`; (b) any `shouldShow` predicate on that entry returns `true` right now. Probe with `document.querySelector('[data-tour-id="<slug>.1"]')` — if the first-step anchor is missing, `shouldShow` returns false and the tour is considered unavailable.

**Want the trigger in my navbar instead of bottom-left.** Delete the `<TourButton />` from your entry file and render a menu in your nav using `useAvailableTours`. The hook returns `{ tours, play, isRunning, stop }`; map `tours` to your existing Menu/MenuItem primitives and call `play(tour.tourSlug)` on click. The component must live inside the `<TourProvider>` subtree.

**Page reloads whenever I capture a step or change a setting.** Vite's file watcher is seeing the plugin's writes to `.tour-flow/*.json` and triggering a full-reload. The template's `vite-tour-plugin.ts` calls `server.watcher.unwatch(outDir)` in `configureServer` to prevent this, and re-`unwatch`es any new files added under that directory. If you're hitting this on an older install, update your `vite-tour-plugin.ts` from the skill template and **restart the dev server** — the plugin's `configureServer` only runs at startup. Belt-and-braces: you can also add `.tour-flow/**` to `server.watch.ignored` in `vite.config.ts`.
