import type { CSSProperties, MouseEvent as ReactMouseEvent } from 'react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import { findSourceStack } from './fiberSource';
import type { SourceInfo as StackFrame } from './fiberSource';

import type {
  TourPlacement,
  TourScreenCapture,
  TourStepBehavior,
  TourStepEntry,
  TourStepMedia,
} from './tourTypes';
import { TourSettingsPanel } from './TourSettingsPanel';

// ---------------------------------------------------------------------------
// TourStepInspector — floating dev toolbar for capturing guided-tour steps.
//
// Toggle: ⌘⇧U (or Ctrl⇧U) — Cmd+Shift+T is reserved by browsers to reopen
// closed tabs and preventDefault is unreliable (especially Safari).
//
// Flow:
//   1. Open toolbar, pick/create a screen (id + description).
//   2. "Add step" → armed. Click any element to capture.
//   3. Fill the step form (title, body, placement, behavior flags, media).
//      Pick the target stack frame to inject data-tour-id at.
//   4. Save step → written to server (.tour-flow/screens/<id>.json).
//   5. Repeat for all steps. Reorder/edit/delete in the visible list.
//
// Mounted by /joyride-studio skill (env-gated block in main.tsx). Never renders
// in prod — the gate also guards against accidental inclusion.
// ---------------------------------------------------------------------------

const API_BASE = '/__tour-step';
const STORAGE_TOOLBAR_POS = 'tour-inspector.toolbar-pos';

// Dev-tooling inline styles. Intentionally NOT using the app's design tokens
// — the inspector floats over every screen including ones with scoped dark
// mode, and we don't want it flipping with host CSS. Matches FeedbackInspector.
const shell: CSSProperties = {
  position: 'fixed',
  background: '#1f1f1f',
  color: '#fff',
  border: '1px solid #3a3a3a',
  borderRadius: 8,
  padding: 8,
  fontSize: 12,
  fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
  boxShadow: '0 10px 30px rgba(0,0,0,0.4)',
  zIndex: 2147483000,
  userSelect: 'none',
};

const btn: CSSProperties = {
  background: '#2a2a2a',
  color: '#fff',
  border: '1px solid #444',
  borderRadius: 4,
  padding: '5px 10px',
  fontSize: 12,
  cursor: 'pointer',
  fontFamily: 'inherit',
  lineHeight: 1.4,
  whiteSpace: 'nowrap',
};

const btnPrimary: CSSProperties = { ...btn, background: '#3b82f6', borderColor: '#2563eb' };
const btnDanger: CSSProperties = { ...btn, background: '#7f1d1d', borderColor: '#991b1b' };

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

const label: CSSProperties = { display: 'block', fontSize: 11, color: '#aaa', marginBottom: 2 };
const row: CSSProperties = { display: 'flex', gap: 6, alignItems: 'center', marginBottom: 6 };

const PLACEMENTS: TourPlacement[] = [
  'auto', 'bottom', 'bottom-start', 'bottom-end',
  'top', 'top-start', 'top-end',
  'left', 'left-start', 'left-end',
  'right', 'right-start', 'right-end',
  'center',
];

const MEDIA_KINDS = ['text', 'image', 'video', 'iframe'] as const;

// ---------------------------------------------------------------------------
// Helpers

function buildSelector(el: Element): string {
  if (el.id) return '#' + el.id;
  const parts: string[] = [];
  let cur: Element | null = el;
  while (cur && cur.nodeType === 1 && cur !== document.body) {
    let seg = cur.tagName.toLowerCase();
    const parent: Element | null = cur.parentElement;
    if (parent) {
      const siblings = Array.from(parent.children).filter((c) => c.tagName === cur!.tagName);
      if (siblings.length > 1) seg += `:nth-of-type(${siblings.indexOf(cur) + 1})`;
    }
    parts.unshift(seg);
    cur = parent;
  }
  return parts.join(' > ');
}

function isInspectorEl(el: Element | null): boolean {
  return !!el?.closest('[data-tour-inspector]');
}

/**
 * Default target frame = first frame whose fileName is not under src/components/ui/.
 * Falls back to innermost frame (index 0) if no feature-level frame exists.
 */
function defaultTargetFrameIndex(stack: StackFrame[]): number {
  const idx = stack.findIndex(
    (f) => !/\/components\/ui\//.test(f.fileName) && !/\/node_modules\//.test(f.fileName),
  );
  return idx >= 0 ? idx : 0;
}

function shortPath(p: string): string {
  // src/components/presentation/LayoutComposerToolbar.tsx → LayoutComposerToolbar.tsx
  const parts = p.split('/');
  return parts[parts.length - 1] || p;
}

function newStepId(): string {
  return 'step_' + Math.random().toString(36).slice(2, 10);
}

// ---------------------------------------------------------------------------

interface ScreenPickerProps {
  screens: TourScreenCapture[];
  onPick: (_capture: TourScreenCapture) => void;
  onCreate: (_screenId: string, _description: string) => void;
  onClose: () => void;
}

function ScreenPicker({ screens, onPick, onCreate, onClose }: ScreenPickerProps) {
  const [newId, setNewId] = useState('');
  const [newDesc, setNewDesc] = useState('');

  const canCreate = /^[a-zA-Z0-9_.-]{1,128}$/.test(newId.trim()) && newDesc.trim().length > 0;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8, maxWidth: 360 }}>
      <div style={{ fontSize: 13, fontWeight: 600 }}>Pick a screen to capture</div>

      {screens.length > 0 && (
        <>
          <div style={label}>Existing screens</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4, maxHeight: 160, overflow: 'auto' }}>
            {screens.map((s) => (
              <button
                key={s.screenId}
                style={{ ...btn, textAlign: 'left', background: '#232323' }}
                onClick={() => onPick(s)}
              >
                <div style={{ fontWeight: 600 }}>{s.screenId}</div>
                <div style={{ color: '#888', fontSize: 11, marginTop: 2 }}>
                  {s.steps.length} step{s.steps.length === 1 ? '' : 's'} · {s.route}
                </div>
              </button>
            ))}
          </div>
        </>
      )}

      <div style={{ borderTop: '1px solid #333', paddingTop: 8 }}>
        <div style={label}>New screen — unique id (e.g. "landing.hero")</div>
        <input
          style={input}
          value={newId}
          onChange={(e) => setNewId(e.target.value)}
          placeholder="landing.hero"
        />
        <div style={{ ...label, marginTop: 6 }}>Description (what/when is this screen?)</div>
        <textarea
          style={{ ...input, minHeight: 60, resize: 'vertical', fontFamily: 'inherit' }}
          value={newDesc}
          onChange={(e) => setNewDesc(e.target.value)}
          placeholder="Landing page hero section — unauthenticated visitor, scrolled to top"
        />
        <div style={{ ...row, marginTop: 8 }}>
          <button style={btn} onClick={onClose}>Cancel</button>
          <button
            style={{ ...btnPrimary, opacity: canCreate ? 1 : 0.5, cursor: canCreate ? 'pointer' : 'not-allowed' }}
            disabled={!canCreate}
            onClick={() => onCreate(newId.trim(), newDesc.trim())}
          >
            Create & start capturing
          </button>
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------

interface StepFormProps {
  stepDraft: TourStepEntry;
  onChange: (_next: TourStepEntry) => void;
  onSave: () => void;
  onCancel: () => void;
}

function StepForm({ stepDraft, onChange, onSave, onCancel }: StepFormProps) {
  const b = stepDraft.behavior;
  const patchBehavior = (patch: Partial<TourStepBehavior>) =>
    onChange({ ...stepDraft, behavior: { ...b, ...patch } });
  const patchMedia = (patch: Partial<TourStepMedia>) => {
    const merged = { ...stepDraft.media, ...patch } as TourStepMedia;
    onChange({ ...stepDraft, media: merged });
  };

  const canSave = stepDraft.title.trim().length > 0;

  return (
    <div
      data-tour-inspector
      style={{ ...shell, position: 'static', maxWidth: 420, maxHeight: '70vh', overflow: 'auto' }}
    >
      <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 8 }}>Step {stepDraft.order + 1}</div>

      {/* Captured element info — read-only. /joyride-studio picks the target frame via its heuristic. */}
      {stepDraft.stackTrace.length > 0 && (
        <details style={{ marginBottom: 10 }}>
          <summary style={{ cursor: 'pointer', fontSize: 11, color: '#888' }}>
            Captured stack ({stepDraft.stackTrace.length} frames)
          </summary>
          <div style={{ marginTop: 4, fontSize: 10, color: '#888', lineHeight: 1.5 }}>
            {stepDraft.stackTrace.map((f, i) => (
              <div key={`${f.fileName}:${f.lineNumber}:${i}`}>
                {shortPath(f.fileName)}:{f.lineNumber}
              </div>
            ))}
            <div style={{ marginTop: 4, color: '#666' }}>
              /joyride-studio picks the first feature-level component automatically.
            </div>
          </div>
        </details>
      )}

      <div style={label}>Title</div>
      <input
        style={input}
        value={stepDraft.title}
        onChange={(e) => onChange({ ...stepDraft, title: e.target.value })}
        placeholder="Start with a prompt"
      />

      <div style={{ ...label, marginTop: 6 }}>Body</div>
      <textarea
        style={{ ...input, minHeight: 50, resize: 'vertical' }}
        value={stepDraft.body}
        onChange={(e) => onChange({ ...stepDraft, body: e.target.value })}
        placeholder="Describe what this element does or why it matters"
      />

      <div style={{ ...row, marginTop: 6 }}>
        <div style={{ flex: 1 }}>
          <div style={label}>Placement</div>
          <select
            style={input}
            value={stepDraft.placement}
            onChange={(e) => onChange({ ...stepDraft, placement: e.target.value as TourPlacement })}
          >
            {PLACEMENTS.map((p) => <option key={p} value={p}>{p}</option>)}
          </select>
        </div>
        <div style={{ flex: 1 }}>
          <div style={label}>Media</div>
          <select
            style={input}
            value={stepDraft.media.kind}
            onChange={(e) => {
              const kind = e.target.value as TourStepMedia['kind'];
              onChange({
                ...stepDraft,
                media: kind === 'text' ? { kind } : { kind, src: '' } as TourStepMedia,
              });
            }}
          >
            {MEDIA_KINDS.map((k) => <option key={k} value={k}>{k}</option>)}
          </select>
        </div>
      </div>

      {stepDraft.media.kind !== 'text' && (
        <>
          <div style={{ ...label, marginTop: 6 }}>Media URL</div>
          <input
            style={input}
            value={'src' in stepDraft.media ? stepDraft.media.src : ''}
            onChange={(e) => patchMedia({ src: e.target.value } as Partial<TourStepMedia>)}
            placeholder="/tour-media/landing-hero.png or https://..."
          />
          {stepDraft.media.kind === 'image' && (
            <>
              <div style={{ ...label, marginTop: 6 }}>Alt text</div>
              <input
                style={input}
                value={stepDraft.media.alt ?? ''}
                onChange={(e) => patchMedia({ alt: e.target.value } as Partial<TourStepMedia>)}
              />
            </>
          )}
        </>
      )}

      <details style={{ marginTop: 10 }}>
        <summary style={{ cursor: 'pointer', fontSize: 12, color: '#aaa' }}>Behavior flags</summary>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4, marginTop: 6, fontSize: 11 }}>
          {[
            ['requireInteraction', 'Require user to interact with target to advance'],
            ['hideClose', 'Hide close button'],
            ['hideBack', 'Hide back button'],
            ['hideFooter', 'Hide footer entirely'],
            ['skipBeacon', 'Skip beacon, show tooltip immediately'],
            ['skipScroll', 'Skip scroll-into-view for this step'],
            ['isFixed', 'Pin to viewport (for sticky/fixed targets)'],
            ['hideOverlay', 'Hide overlay backdrop'],
            ['blockTargetInteraction', 'Block clicks on target through spotlight'],
          ].map(([key, desc]) => (
            <label key={key} style={{ display: 'flex', gap: 6, alignItems: 'flex-start', cursor: 'pointer' }}>
              <input
                type="checkbox"
                checked={!!b[key as keyof TourStepBehavior]}
                onChange={(e) => patchBehavior({ [key]: e.target.checked })}
                style={{
                  marginTop: 2,
                  width: 14,
                  height: 14,
                  flexShrink: 0,
                  appearance: 'auto',
                  colorScheme: 'dark',
                  accentColor: '#3b82f6',
                  cursor: 'pointer',
                }}
              />
              <span>{desc}</span>
            </label>
          ))}
          <div style={{ ...row, marginTop: 6 }}>
            <div style={{ flex: 1 }}>
              <div style={label}>Spotlight padding (px)</div>
              <input
                style={input}
                type="number"
                value={b.spotlightPadding ?? ''}
                onChange={(e) => patchBehavior({ spotlightPadding: e.target.value === '' ? undefined : Number(e.target.value) })}
                placeholder="10"
              />
            </div>
            <div style={{ flex: 1 }}>
              <div style={label}>Spotlight radius (px)</div>
              <input
                style={input}
                type="number"
                value={b.spotlightRadius ?? ''}
                onChange={(e) => patchBehavior({ spotlightRadius: e.target.value === '' ? undefined : Number(e.target.value) })}
                placeholder="4"
              />
            </div>
            <div style={{ flex: 1 }}>
              <div style={label}>Target wait (ms)</div>
              <input
                style={input}
                type="number"
                value={b.targetWaitTimeout ?? ''}
                onChange={(e) => patchBehavior({ targetWaitTimeout: e.target.value === '' ? undefined : Number(e.target.value) })}
                placeholder="1000"
              />
            </div>
          </div>
        </div>
      </details>

      <div style={{ ...row, marginTop: 10, justifyContent: 'flex-end' }}>
        <button style={btn} onClick={onCancel}>Cancel</button>
        <button
          style={{ ...btnPrimary, opacity: canSave ? 1 : 0.5, cursor: canSave ? 'pointer' : 'not-allowed' }}
          disabled={!canSave}
          onClick={onSave}
        >
          Save step
        </button>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------

export function TourStepInspector() {
  const [visible, setVisible] = useState(false);
  const [screens, setScreens] = useState<TourScreenCapture[]>([]);
  const [activeScreen, setActiveScreen] = useState<TourScreenCapture | null>(null);
  const [showPicker, setShowPicker] = useState(false);
  const [tab, setTab] = useState<'capture' | 'settings'>('capture');
  const [armed, setArmed] = useState(false);
  const [hovered, setHovered] = useState<Element | null>(null);
  const [stepDraft, setStepDraft] = useState<TourStepEntry | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [connected, setConnected] = useState<boolean | null>(null);

  const [toolbarPos, setToolbarPos] = useState<{ x: number; y: number }>(() => {
    try {
      const saved = localStorage.getItem(STORAGE_TOOLBAR_POS);
      if (saved) return JSON.parse(saved) as { x: number; y: number };
    } catch { /* noop */ }
    return { x: Math.round(window.innerWidth / 2) - 175, y: 56 };
  });
  const dragState = useRef<{ startX: number; startY: number; originX: number; originY: number } | null>(null);

  // ---------- API ----------
  const refreshScreens = useCallback(async () => {
    try {
      const res = await fetch(API_BASE);
      const list = await res.json() as TourScreenCapture[];
      setScreens(list);
      setConnected(true);
    } catch {
      setConnected(false);
    }
  }, []);

  useEffect(() => {
    refreshScreens();
  }, [refreshScreens]);

  const persistScreen = useCallback(async (capture: TourScreenCapture) => {
    const res = await fetch(`${API_BASE}/screens/${encodeURIComponent(capture.screenId)}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(capture),
    });
    const saved = await res.json() as TourScreenCapture;
    setActiveScreen(saved);
    setScreens((list) => {
      const idx = list.findIndex((s) => s.screenId === saved.screenId);
      if (idx >= 0) {
        const next = list.slice();
        next[idx] = saved;
        return next;
      }
      return [...list, saved].sort((a, b) => a.screenId.localeCompare(b.screenId));
    });
  }, []);

  // ---------- Keyboard toggle ----------
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.shiftKey && (e.key === 'u' || e.key === 'U')) {
        e.preventDefault();
        setVisible((v) => !v);
      }
      if (e.key === 'Escape') {
        setArmed(false);
        if (stepDraft) setStepDraft(null);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [stepDraft]);

  // ---------- Hover outline while armed ----------
  useEffect(() => {
    if (!armed) { setHovered(null); return; }
    const onMove = (e: MouseEvent) => {
      const target = document.elementFromPoint(e.clientX, e.clientY) as Element | null;
      if (!target || isInspectorEl(target)) { setHovered(null); return; }
      setHovered(target);
    };
    const onClick = (e: MouseEvent) => {
      const target = document.elementFromPoint(e.clientX, e.clientY) as Element | null;
      if (!target || isInspectorEl(target)) return;
      e.preventDefault();
      e.stopPropagation();
      captureStepFromElement(target);
      setArmed(false);
      setHovered(null);
    };
    document.addEventListener('mousemove', onMove, true);
    document.addEventListener('click', onClick, true);
    return () => {
      document.removeEventListener('mousemove', onMove, true);
      document.removeEventListener('click', onClick, true);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [armed]);

  // ---------- Step capture ----------
  const captureStepFromElement = useCallback((el: Element) => {
    const stack = findSourceStack(el);
    if (stack.length === 0) {
      // no source info — still allow capture, but warn in UI
      console.warn('[TourStepInspector] no fiber source info; using selector fallback');
    }
    const domRect = el.getBoundingClientRect();
    const order = activeScreen?.steps.length ?? 0;
    const draft: TourStepEntry = {
      id: newStepId(),
      order,
      targetFrameIndex: defaultTargetFrameIndex(stack),
      stackTrace: stack,
      selector: buildSelector(el),
      tag: el.tagName.toLowerCase(),
      classes: typeof (el as HTMLElement).className === 'string' ? (el as HTMLElement).className : '',
      text: (el.textContent ?? '').trim().slice(0, 120),
      rect: {
        x: Math.round(domRect.x),
        y: Math.round(domRect.y),
        w: Math.round(domRect.width),
        h: Math.round(domRect.height),
      },
      viewport: {
        scrollX: Math.round(window.scrollX),
        scrollY: Math.round(window.scrollY),
        width: window.innerWidth,
        height: window.innerHeight,
      },
      title: '',
      body: '',
      placement: 'auto',
      behavior: {},
      media: { kind: 'text' },
      timestamp: Date.now(),
    };
    setStepDraft(draft);
    setEditingId(null);
  }, [activeScreen]);

  const saveStepDraft = useCallback(async () => {
    if (!stepDraft || !activeScreen) return;
    const steps = editingId
      ? activeScreen.steps.map((s) => s.id === editingId ? { ...stepDraft, id: editingId } : s)
      : [...activeScreen.steps, stepDraft].map((s, i) => ({ ...s, order: i }));
    await persistScreen({ ...activeScreen, steps, updatedAt: Date.now() });
    setStepDraft(null);
    setEditingId(null);
  }, [stepDraft, activeScreen, editingId, persistScreen]);

  const deleteStep = useCallback(async (id: string) => {
    if (!activeScreen) return;
    const steps = activeScreen.steps.filter((s) => s.id !== id).map((s, i) => ({ ...s, order: i }));
    await persistScreen({ ...activeScreen, steps, updatedAt: Date.now() });
  }, [activeScreen, persistScreen]);

  const moveStep = useCallback(async (id: string, dir: -1 | 1) => {
    if (!activeScreen) return;
    const idx = activeScreen.steps.findIndex((s) => s.id === id);
    if (idx < 0) return;
    const swap = idx + dir;
    if (swap < 0 || swap >= activeScreen.steps.length) return;
    const steps = activeScreen.steps.slice();
    [steps[idx], steps[swap]] = [steps[swap], steps[idx]];
    await persistScreen({
      ...activeScreen,
      steps: steps.map((s, i) => ({ ...s, order: i })),
      updatedAt: Date.now(),
    });
  }, [activeScreen, persistScreen]);

  const editStep = useCallback((step: TourStepEntry) => {
    setStepDraft({ ...step });
    setEditingId(step.id);
  }, []);

  // ---------- Screen management ----------
  const openScreenPicker = () => { setShowPicker(true); setActiveScreen(null); };
  const pickExisting = (s: TourScreenCapture) => { setActiveScreen(s); setShowPicker(false); };
  const createScreen = async (screenId: string, description: string) => {
    const now = Date.now();
    const fresh: TourScreenCapture = {
      screenId,
      route: window.location.pathname + window.location.search,
      description,
      steps: [],
      createdAt: now,
      updatedAt: now,
    };
    await persistScreen(fresh);
    setShowPicker(false);
  };

  // ---------- Toolbar drag ----------
  useEffect(() => {
    try { localStorage.setItem(STORAGE_TOOLBAR_POS, JSON.stringify(toolbarPos)); } catch { /* noop */ }
  }, [toolbarPos]);

  const onDragStart = (e: ReactMouseEvent) => {
    dragState.current = { startX: e.clientX, startY: e.clientY, originX: toolbarPos.x, originY: toolbarPos.y };
    const onMove = (ev: MouseEvent) => {
      if (!dragState.current) return;
      setToolbarPos({
        x: Math.max(0, Math.min(window.innerWidth - 80, dragState.current.originX + (ev.clientX - dragState.current.startX))),
        y: Math.max(0, Math.min(window.innerHeight - 40, dragState.current.originY + (ev.clientY - dragState.current.startY))),
      });
    };
    const onUp = () => {
      dragState.current = null;
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
    };
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
  };

  // ---------- Render ----------
  const hoverRect = useMemo(() => (armed && hovered ? hovered.getBoundingClientRect() : null), [armed, hovered]);

  return (
    <>
      {/* Hidden sentinel — always mounted in dev. Lets developers verify the
          inspector is loaded via `document.querySelector('[data-tour-inspector-root]')`,
          without having to open the toolbar first. */}
      <span data-tour-inspector-root hidden />

      {visible && <>
      {/* Hover outline while armed */}
      {hoverRect && (
        <div
          data-tour-inspector
          style={{
            position: 'fixed',
            pointerEvents: 'none',
            left: hoverRect.left,
            top: hoverRect.top,
            width: hoverRect.width,
            height: hoverRect.height,
            outline: '2px solid #3b82f6',
            background: 'rgba(59,130,246,0.08)',
            zIndex: 2147483600,
          }}
        />
      )}

      {/* Toolbar */}
      <div
        data-tour-inspector
        style={{ ...shell, left: toolbarPos.x, top: toolbarPos.y, width: 340 }}
      >
        <div
          style={{ ...row, marginBottom: 6, cursor: 'move', userSelect: 'none' }}
          onMouseDown={onDragStart}
        >
          <span style={{ fontWeight: 600 }}>Tour Inspector</span>
          <span style={{ color: connected === false ? '#ef4444' : '#22c55e', fontSize: 10 }}>
            {connected === false ? '● offline' : '● dev'}
          </span>
          <div style={{ marginLeft: 'auto', display: 'flex', gap: 4 }}>
            <button style={btn} onClick={() => setVisible(false)} title="Hide (⌘⇧U to reopen)">×</button>
          </div>
        </div>

        {/* Tab switcher */}
        <div style={{ display: 'flex', gap: 4, marginBottom: 8, borderBottom: '1px solid #2a2a2a' }}>
          <button
            style={{
              ...btn,
              background: tab === 'capture' ? '#2563eb' : '#2a2a2a',
              borderColor: tab === 'capture' ? '#2563eb' : '#444',
              borderRadius: '4px 4px 0 0',
              borderBottomColor: 'transparent',
              flex: 1,
            }}
            onClick={() => setTab('capture')}
          >
            Capture
          </button>
          <button
            style={{
              ...btn,
              background: tab === 'settings' ? '#2563eb' : '#2a2a2a',
              borderColor: tab === 'settings' ? '#2563eb' : '#444',
              borderRadius: '4px 4px 0 0',
              borderBottomColor: 'transparent',
              flex: 1,
            }}
            onClick={() => setTab('settings')}
          >
            Settings
          </button>
        </div>

        {tab === 'settings' ? (
          <div style={{ maxHeight: '60vh', overflow: 'auto' }}>
            <TourSettingsPanel />
          </div>
        ) : showPicker ? (
          <ScreenPicker
            screens={screens}
            onPick={pickExisting}
            onCreate={createScreen}
            onClose={() => setShowPicker(false)}
          />
        ) : !activeScreen ? (
          <div>
            <div style={{ fontSize: 11, color: '#aaa', marginBottom: 8 }}>
              No active screen. Captures are written to <code>.tour-flow/screens/</code>.
            </div>
            <button style={btnPrimary} onClick={openScreenPicker}>Pick / create a screen</button>
          </div>
        ) : (
          <>
            <div style={{ marginBottom: 6 }}>
              <div style={{ fontSize: 12, fontWeight: 600 }}>{activeScreen.screenId}</div>
              <div style={{ fontSize: 10, color: '#888' }}>{activeScreen.route}</div>
              <div style={{ fontSize: 10, color: '#aaa', marginTop: 2, lineHeight: 1.4 }}>
                {activeScreen.description}
              </div>
            </div>

            <div style={{ ...row }}>
              <button
                style={{ ...btnPrimary, background: armed ? '#f59e0b' : '#3b82f6' }}
                onClick={() => setArmed((a) => !a)}
              >
                {armed ? '◉ Click an element…' : '+ Add step'}
              </button>
              <button style={btn} onClick={openScreenPicker}>Switch screen</button>
            </div>

            {/* Steps list */}
            {activeScreen.steps.length > 0 && (
              <div style={{ borderTop: '1px solid #333', paddingTop: 6, marginTop: 6, maxHeight: 240, overflow: 'auto' }}>
                {activeScreen.steps.map((step, i) => {
                  const tgt = step.stackTrace[step.targetFrameIndex];
                  return (
                    <div
                      key={step.id}
                      style={{
                        border: '1px solid #2a2a2a',
                        borderRadius: 4,
                        padding: 6,
                        marginBottom: 4,
                        background: '#181818',
                      }}
                    >
                      <div style={{ display: 'flex', gap: 4, alignItems: 'baseline' }}>
                        <span style={{ color: '#666', fontSize: 10 }}>{i + 1}.</span>
                        <span style={{ fontWeight: 600, fontSize: 12, flex: 1 }}>
                          {step.title || <em style={{ color: '#888' }}>(untitled)</em>}
                        </span>
                      </div>
                      {tgt && (
                        <div style={{ fontSize: 10, color: '#888', marginTop: 2 }}>
                          → {shortPath(tgt.fileName)}:{tgt.lineNumber} · {step.placement}
                          {step.behavior.requireInteraction && ' · ◉ interact'}
                        </div>
                      )}
                      <div style={{ ...row, marginTop: 4, marginBottom: 0 }}>
                        <button style={btn} onClick={() => editStep(step)}>Edit</button>
                        <button style={btn} onClick={() => moveStep(step.id, -1)} disabled={i === 0}>↑</button>
                        <button style={btn} onClick={() => moveStep(step.id, 1)} disabled={i === activeScreen.steps.length - 1}>↓</button>
                        <button style={btnDanger} onClick={() => deleteStep(step.id)}>Delete</button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </>
        )}
      </div>

      {/* Step form (floating, centered) */}
      {stepDraft && (
        <div
          data-tour-inspector
          style={{
            position: 'fixed',
            left: '50%',
            top: '50%',
            transform: 'translate(-50%, -50%)',
            zIndex: 2147483500,
          }}
        >
          <StepForm
            stepDraft={stepDraft}
            onChange={setStepDraft}
            onSave={saveStepDraft}
            onCancel={() => { setStepDraft(null); setEditingId(null); }}
          />
        </div>
      )}
      </>}
    </>
  );
}
