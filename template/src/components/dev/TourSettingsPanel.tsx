import type { CSSProperties } from 'react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import { DEFAULT_GLOBAL_CONFIG } from './tourTypes';
import type { TourGlobalConfig } from './tourTypes';

// ---------------------------------------------------------------------------
// TourSettingsPanel — editable surface for global Joyride config.
//
// Organised into 11 collapsible categories — the 9 that mirror react-joyride's
// playground (Tour Options · Appearance · Arrow · Beacon · Overlay & Spotlight
// · Scroll Behavior · Interactions · Custom Components · Locale) plus two
// joyride-studio additions that sit on top of Joyride:
//   • Positioning Stability — floating-ui autoUpdate + MutationObserver
//   • Mobile — viewport-aware overrides (placement, beacon size, padding, …)
//
// Each category is declared in SETTINGS_SCHEMA so adding a new field is a
// single-line change — no per-field React plumbing. Inputs are debounced and
// PATCH'd to the plugin's /__tour-step/config endpoint.
// ---------------------------------------------------------------------------

const API_BASE = '/__tour-step';
const SAVE_DEBOUNCE_MS = 350;

type Path = [keyof TourGlobalConfig, string];

type FieldDef =
  | { path: Path; label: string; kind: 'text'; placeholder?: string; hint?: string }
  | { path: Path; label: string; kind: 'color'; hint?: string }
  | { path: Path; label: string; kind: 'number'; min?: number; max?: number; step?: number; hint?: string }
  | { path: Path; label: string; kind: 'checkbox'; hint?: string }
  | { path: Path; label: string; kind: 'select'; options: { value: string; label: string }[]; hint?: string }
  // tri-state for overlayClickAction / dismissKeyAction that accept false
  | { path: Path; label: string; kind: 'actionSelect'; hint?: string };

interface CategoryDef {
  key: keyof TourGlobalConfig;
  label: string;
  fields: FieldDef[];
}

const ACTION_OPTIONS = [
  { value: 'close', label: 'close step' },
  { value: 'next', label: 'advance to next step' },
  { value: 'false', label: 'do nothing' },
];

const SETTINGS_SCHEMA: CategoryDef[] = [
  {
    key: 'tourOptions',
    label: 'Tour Options',
    fields: [
      { path: ['tourOptions', 'continuous'], label: 'Continuous (auto-advance with Next)', kind: 'checkbox' },
      { path: ['tourOptions', 'showProgress'], label: 'Show progress in tooltip', kind: 'checkbox' },
      { path: ['tourOptions', 'showSkip'], label: 'Show Skip button', kind: 'checkbox' },
      { path: ['tourOptions', 'scrollToFirstStep'], label: 'Scroll to the first step on start', kind: 'checkbox' },
      { path: ['tourOptions', 'spotlightClicks'], label: 'Allow target clicks through spotlight (global)', kind: 'checkbox' },
      { path: ['tourOptions', 'debug'], label: 'Verbose console logging (debug)', kind: 'checkbox' },
    ],
  },
  {
    key: 'appearance',
    label: 'Appearance',
    fields: [
      { path: ['appearance', 'primaryColor'], label: 'Primary color (buttons + beacon)', kind: 'color' },
      { path: ['appearance', 'backgroundColor'], label: 'Tooltip background', kind: 'color' },
      { path: ['appearance', 'textColor'], label: 'Tooltip text', kind: 'color' },
      { path: ['appearance', 'zIndex'], label: 'z-index', kind: 'number', min: 0 },
      { path: ['appearance', 'width'], label: 'Tooltip width (e.g. 380 or "24rem")', kind: 'text', placeholder: '380' },
    ],
  },
  {
    key: 'arrow',
    label: 'Arrow',
    fields: [
      { path: ['arrow', 'arrowBase'], label: 'Base edge width (px)', kind: 'number', min: 0 },
      { path: ['arrow', 'arrowSize'], label: 'Depth tip→base (px)', kind: 'number', min: 0 },
      { path: ['arrow', 'arrowSpacing'], label: 'Spacing from tooltip (px)', kind: 'number', min: 0 },
      { path: ['arrow', 'arrowColor'], label: 'Arrow color (match tooltip bg)', kind: 'color' },
    ],
  },
  {
    key: 'beacon',
    label: 'Beacon',
    fields: [
      { path: ['beacon', 'beaconSize'], label: 'Beacon diameter (px)', kind: 'number', min: 0 },
      {
        path: ['beacon', 'beaconTrigger'], label: 'Beacon trigger', kind: 'select',
        options: [{ value: 'click', label: 'click' }, { value: 'hover', label: 'hover' }],
      },
      { path: ['beacon', 'skipBeacon'], label: 'Skip beacon globally', kind: 'checkbox' },
    ],
  },
  {
    key: 'overlaySpotlight',
    label: 'Overlay & Spotlight',
    fields: [
      { path: ['overlaySpotlight', 'overlayColor'], label: 'Overlay backdrop (hex or rgba)', kind: 'text', placeholder: 'rgba(0,0,0,0.5)' },
      { path: ['overlaySpotlight', 'hideOverlay'], label: 'Hide overlay globally', kind: 'checkbox' },
      { path: ['overlaySpotlight', 'spotlightPadding'], label: 'Spotlight padding (px)', kind: 'number', min: 0 },
      { path: ['overlaySpotlight', 'spotlightRadius'], label: 'Spotlight border radius (px)', kind: 'number', min: 0 },
      { path: ['overlaySpotlight', 'blockTargetInteraction'], label: 'Block clicks on target through spotlight', kind: 'checkbox' },
    ],
  },
  {
    key: 'scrollBehavior',
    label: 'Scroll Behavior',
    fields: [
      { path: ['scrollBehavior', 'scrollDuration'], label: 'Scroll animation duration (ms)', kind: 'number', min: 0 },
      { path: ['scrollBehavior', 'scrollOffset'], label: 'Scroll offset from top (px)', kind: 'number', min: 0 },
      { path: ['scrollBehavior', 'skipScroll'], label: 'Skip scroll-into-view globally', kind: 'checkbox' },
      { path: ['scrollBehavior', 'disableScrollParentFix'], label: 'Disable scroll-parent fix', kind: 'checkbox' },
    ],
  },
  {
    key: 'interactions',
    label: 'Interactions',
    fields: [
      { path: ['interactions', 'overlayClickAction'], label: 'When overlay is clicked', kind: 'actionSelect' },
      { path: ['interactions', 'dismissKeyAction'], label: 'When ESC is pressed', kind: 'actionSelect' },
      {
        path: ['interactions', 'closeButtonAction'], label: 'When × is clicked', kind: 'select',
        options: [{ value: 'close', label: 'close step (default)' }, { value: 'skip', label: 'skip tour entirely' }],
      },
      { path: ['interactions', 'disableFocusTrap'], label: 'Disable focus trap (not recommended)', kind: 'checkbox' },
      { path: ['interactions', 'targetWaitTimeout'], label: 'Wait for target to appear (ms)', kind: 'number', min: 0 },
      { path: ['interactions', 'beforeTimeout'], label: 'Wait for `before` hook (ms, 0 = no timeout)', kind: 'number', min: 0 },
      { path: ['interactions', 'loaderDelay'], label: 'Loader delay while waiting (ms)', kind: 'number', min: 0 },
    ],
  },
  {
    key: 'positioningStability',
    label: 'Positioning Stability',
    fields: [
      { path: ['positioningStability', 'autoUpdate'], label: 'Enable autoUpdate (floating-ui)', kind: 'checkbox', hint: 'Master switch — when off, Joyride falls back to position-once.' },
      { path: ['positioningStability', 'ancestorScroll'], label: 'Reposition on ancestor scroll', kind: 'checkbox' },
      { path: ['positioningStability', 'ancestorResize'], label: 'Reposition on ancestor resize', kind: 'checkbox' },
      { path: ['positioningStability', 'elementResize'], label: 'Reposition on target resize', kind: 'checkbox' },
      { path: ['positioningStability', 'layoutShift'], label: 'Reposition on layout shifts', kind: 'checkbox' },
      { path: ['positioningStability', 'animationFrame'], label: 'Reposition every animation frame (expensive)', kind: 'checkbox', hint: 'Only for continuously animating targets — high CPU cost.' },
      { path: ['positioningStability', 'observeMutations'], label: 'Observe target DOM mutations', kind: 'checkbox', hint: 'Adds a MutationObserver on the active step target so class/attribute changes trigger a reposition.' },
      { path: ['positioningStability', 'mutationThrottle'], label: 'Mutation-observer throttle (ms)', kind: 'number', min: 0, hint: 'Debounce window for mutation-driven repositions.' },
    ],
  },
  {
    key: 'mobile',
    label: 'Mobile',
    fields: [
      { path: ['mobile', 'enabled'], label: 'Enable mobile overrides', kind: 'checkbox', hint: 'When the viewport is narrower than `breakpoint`, swap in mobile-friendly values.' },
      { path: ['mobile', 'breakpoint'], label: 'Breakpoint (max-width px)', kind: 'number', min: 0 },
      {
        path: ['mobile', 'placement'], label: 'Mobile placement', kind: 'select',
        options: [
          { value: 'center', label: 'center (full-screen modal)' },
          { value: 'auto', label: 'auto' },
          { value: 'top', label: 'top' },
          { value: 'bottom', label: 'bottom' },
          { value: 'left', label: 'left' },
          { value: 'right', label: 'right' },
        ],
      },
      { path: ['mobile', 'beaconSize'], label: 'Beacon diameter on mobile (px)', kind: 'number', min: 0, hint: 'Larger tap target for touch — defaults to 44.' },
      { path: ['mobile', 'spotlightPadding'], label: 'Spotlight padding on mobile (px)', kind: 'number', min: 0 },
      { path: ['mobile', 'scrollOffset'], label: 'Scroll offset on mobile (px)', kind: 'number', min: 0, hint: 'Accounts for sticky mobile headers.' },
      { path: ['mobile', 'width'], label: 'Tooltip width on mobile', kind: 'text', placeholder: '92vw' },
      { path: ['mobile', 'isFixed'], label: 'Pin tooltip to viewport (isFixed) on mobile', kind: 'checkbox' },
      { path: ['mobile', 'skipBeacon'], label: 'Skip beacon on mobile', kind: 'checkbox', hint: 'Recommended for touch — show tooltip immediately.' },
      { path: ['mobile', 'disableScroll'], label: 'Disable scroll-to-target on mobile', kind: 'checkbox', hint: 'Keeps the virtual keyboard from jumping the page.' },
    ],
  },
  {
    key: 'customComponents',
    label: 'Custom Components',
    fields: [
      { path: ['customComponents', 'tooltipComponentPath'], label: 'tooltipComponent import path', kind: 'text', hint: 'Leave blank for default. E.g. "@/tour/MyCustomTooltip"' },
      { path: ['customComponents', 'beaconComponentPath'], label: 'beaconComponent import path', kind: 'text' },
      { path: ['customComponents', 'arrowComponentPath'], label: 'arrowComponent import path', kind: 'text' },
      { path: ['customComponents', 'loaderComponentPath'], label: 'loaderComponent import path (null to disable)', kind: 'text' },
    ],
  },
  {
    key: 'locale',
    label: 'Locale',
    fields: [
      { path: ['locale', 'back'], label: 'Back button', kind: 'text' },
      { path: ['locale', 'close'], label: 'Close button', kind: 'text' },
      { path: ['locale', 'last'], label: 'Last-step primary button', kind: 'text' },
      { path: ['locale', 'next'], label: 'Next button', kind: 'text' },
      { path: ['locale', 'nextWithProgress'], label: 'Next with progress (use {current}/{total})', kind: 'text' },
      { path: ['locale', 'open'], label: 'Open-tooltip aria-label', kind: 'text' },
      { path: ['locale', 'skip'], label: 'Skip button', kind: 'text' },
    ],
  },
];

// ---------------------------------------------------------------------------
// Inline styles — match the inspector's look

const shell: CSSProperties = {
  padding: 8,
  background: '#1f1f1f',
  color: '#fff',
  fontSize: 12,
  fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
};

const section: CSSProperties = {
  borderTop: '1px solid #2a2a2a',
  paddingTop: 6,
  marginTop: 6,
};

const summary: CSSProperties = {
  cursor: 'pointer',
  fontSize: 12,
  fontWeight: 600,
  color: '#e5e7eb',
  padding: '4px 0',
  userSelect: 'none',
};

const label: CSSProperties = { display: 'block', fontSize: 11, color: '#aaa', marginBottom: 2 };
const hint: CSSProperties = { display: 'block', fontSize: 10, color: '#666', marginTop: 2 };
const row: CSSProperties = { display: 'flex', gap: 6, alignItems: 'center', marginBottom: 6 };

const input: CSSProperties = {
  background: '#111',
  color: '#fff',
  border: '1px solid #333',
  borderRadius: 4,
  padding: '4px 6px',
  fontSize: 12,
  fontFamily: 'inherit',
  width: '100%',
  boxSizing: 'border-box',
};

const colorInput: CSSProperties = {
  ...input,
  padding: 0,
  height: 22,
  width: 40,
  cursor: 'pointer',
};

const checkbox: CSSProperties = {
  marginTop: 2,
  width: 14,
  height: 14,
  flexShrink: 0,
  appearance: 'auto',
  colorScheme: 'dark',
  accentColor: '#3b82f6',
  cursor: 'pointer',
};

// ---------------------------------------------------------------------------

function getByPath(obj: TourGlobalConfig, [cat, field]: Path): unknown {
  const category = obj[cat] as Record<string, unknown>;
  return category?.[field];
}

function setByPath(obj: TourGlobalConfig, [cat, field]: Path, value: unknown): TourGlobalConfig {
  const category = obj[cat] as Record<string, unknown>;
  return { ...obj, [cat]: { ...category, [field]: value } };
}

function serializeActionValue(v: unknown): string {
  if (v === false) return 'false';
  return String(v ?? 'close');
}

function parseActionValue(s: string): 'close' | 'next' | false {
  if (s === 'false') return false;
  if (s === 'next') return 'next';
  return 'close';
}

// ---------------------------------------------------------------------------

function TourSettingsPanel() {
  const [config, setConfig] = useState<TourGlobalConfig>(DEFAULT_GLOBAL_CONFIG);
  const [loaded, setLoaded] = useState(false);
  const [saving, setSaving] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');
  const saveTimer = useRef<number | null>(null);

  // Load on mount
  useEffect(() => {
    let cancelled = false;
    fetch(`${API_BASE}/config`)
      .then((r) => r.json())
      .then((remote: TourGlobalConfig | null) => {
        if (cancelled) return;
        setConfig(remote ?? DEFAULT_GLOBAL_CONFIG);
        setLoaded(true);
      })
      .catch(() => {
        if (cancelled) return;
        setConfig(DEFAULT_GLOBAL_CONFIG);
        setLoaded(true);
      });
    return () => { cancelled = true; };
  }, []);

  // Debounced save
  const scheduleSave = useCallback((next: TourGlobalConfig) => {
    if (saveTimer.current !== null) window.clearTimeout(saveTimer.current);
    setSaving('saving');
    saveTimer.current = window.setTimeout(async () => {
      try {
        await fetch(`${API_BASE}/config`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(next),
        });
        setSaving('saved');
        window.setTimeout(() => setSaving('idle'), 800);
      } catch {
        setSaving('error');
      }
    }, SAVE_DEBOUNCE_MS);
  }, []);

  const patch = useCallback((path: Path, value: unknown) => {
    setConfig((prev) => {
      const next = setByPath(prev, path, value);
      scheduleSave(next);
      return next;
    });
  }, [scheduleSave]);

  const renderField = useCallback((field: FieldDef) => {
    const raw = getByPath(config, field.path);
    const id = `${field.path[0]}-${field.path[1]}`;

    switch (field.kind) {
      case 'text':
        return (
          <div key={id} style={{ marginBottom: 6 }}>
            <label style={label} htmlFor={id}>{field.label}</label>
            <input
              id={id}
              style={input}
              type="text"
              value={raw == null ? '' : String(raw)}
              placeholder={field.placeholder}
              onChange={(e) => patch(field.path, e.target.value || undefined)}
            />
            {field.hint && <span style={hint}>{field.hint}</span>}
          </div>
        );

      case 'color':
        return (
          <div key={id} style={{ marginBottom: 6 }}>
            <label style={label} htmlFor={id}>{field.label}</label>
            <div style={row}>
              <input
                id={id}
                style={colorInput}
                type="color"
                value={(raw as string) || '#000000'}
                onChange={(e) => patch(field.path, e.target.value)}
              />
              <input
                style={{ ...input, flex: 1 }}
                type="text"
                value={raw == null ? '' : String(raw)}
                placeholder="#rrggbb or rgba(...)"
                onChange={(e) => patch(field.path, e.target.value || undefined)}
              />
            </div>
          </div>
        );

      case 'number':
        return (
          <div key={id} style={{ marginBottom: 6 }}>
            <label style={label} htmlFor={id}>{field.label}</label>
            <input
              id={id}
              style={input}
              type="number"
              min={field.min}
              max={field.max}
              step={field.step}
              value={raw == null ? '' : String(raw)}
              onChange={(e) => patch(field.path, e.target.value === '' ? undefined : Number(e.target.value))}
            />
          </div>
        );

      case 'checkbox':
        return (
          <label
            key={id}
            style={{ display: 'flex', gap: 6, alignItems: 'flex-start', cursor: 'pointer', marginBottom: 4 }}
          >
            <input
              type="checkbox"
              checked={!!raw}
              onChange={(e) => patch(field.path, e.target.checked)}
              style={checkbox}
            />
            <span style={{ fontSize: 11 }}>{field.label}</span>
          </label>
        );

      case 'select':
        return (
          <div key={id} style={{ marginBottom: 6 }}>
            <label style={label} htmlFor={id}>{field.label}</label>
            <select
              id={id}
              style={input}
              value={String(raw ?? '')}
              onChange={(e) => patch(field.path, e.target.value)}
            >
              {field.options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
            </select>
          </div>
        );

      case 'actionSelect':
        return (
          <div key={id} style={{ marginBottom: 6 }}>
            <label style={label} htmlFor={id}>{field.label}</label>
            <select
              id={id}
              style={input}
              value={serializeActionValue(raw)}
              onChange={(e) => patch(field.path, parseActionValue(e.target.value))}
            >
              {ACTION_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
            </select>
          </div>
        );
    }
  }, [config, patch]);

  const saveBadge = useMemo(() => {
    if (saving === 'saving') return { text: '● saving…', color: '#f59e0b' };
    if (saving === 'saved') return { text: '● saved', color: '#22c55e' };
    if (saving === 'error') return { text: '● error', color: '#ef4444' };
    return { text: '● idle', color: '#666' };
  }, [saving]);

  if (!loaded) {
    return <div style={shell}>Loading config…</div>;
  }

  return (
    <div data-tour-inspector style={shell}>
      <div style={{ ...row, marginBottom: 4 }}>
        <span style={{ fontSize: 11, color: '#aaa' }}>
          Writes to <code style={{ fontSize: 10 }}>.tour-flow/config.json</code>
        </span>
        <span style={{ marginLeft: 'auto', fontSize: 10, color: saveBadge.color }}>
          {saveBadge.text}
        </span>
      </div>

      {SETTINGS_SCHEMA.map((cat) => (
        <details key={cat.key} style={section}>
          <summary style={summary}>{cat.label}</summary>
          <div style={{ paddingTop: 6 }}>
            {cat.fields.map(renderField)}
          </div>
        </details>
      ))}
    </div>
  );
}

export { TourSettingsPanel };
