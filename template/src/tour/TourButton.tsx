// Default bottom-left "?" trigger + dropdown menu listing tours available
// on the current route. Clicking a tour in the menu plays it.
//
// Framework-neutral — no design-system imports. Renders only when
// `availableTours.length > 0` so pages without tours stay uncluttered.
//
// For navbar / side-menu integrations, consumers skip this component and
// use `useAvailableTours` directly to render their own trigger + list.

import type { CSSProperties, ReactNode } from 'react';
import { useCallback, useEffect, useRef, useState } from 'react';

import { defaultTourName } from './registry';
import type { TourEntry } from './registry';
import { useTour } from './TourProvider';

// ---------------------------------------------------------------------------
// Public hook — what nav/sidebar integrations consume.

/**
 * Shape returned to consumers rendering their own trigger (e.g. a nav menu
 * item). Keeps the public API minimal and ergonomic.
 */
interface AvailableToursApi {
  /** All tours matching the current route whose shouldShow passes. */
  tours: TourEntry[];
  /** Start a specific tour by slug. No-op if slug not in `tours`. */
  play: (_tourSlug: string) => void;
  /** Whether any tour is currently running. */
  isRunning: boolean;
  /** Stop whatever's running without marking completion. */
  stop: () => void;
}

function useAvailableTours(): AvailableToursApi {
  const { availableTours, play, isRunning, stop } = useTour();
  return { tours: availableTours, play, isRunning, stop };
}

// ---------------------------------------------------------------------------
// Default drop-in UI

interface TourButtonProps {
  /** Override container styles (default: fixed bottom-left, z-index 900). */
  style?: CSSProperties;
  className?: string;
  /** Accessible label for the button. Default describes available tour count. */
  'aria-label'?: string;
  /**
   * Replace the default `?` icon render. Use your own icon component if you
   * want to keep the menu UI but swap the glyph.
   */
  icon?: ReactNode;
}

const FIXED_CONTAINER: CSSProperties = {
  position: 'fixed',
  left: 16,
  bottom: 16,
  zIndex: 900,
};

const TRIGGER: CSSProperties = {
  width: 40,
  height: 40,
  borderRadius: 9999,
  border: '1px solid var(--tour-border, rgba(0,0,0,0.08))',
  background: 'var(--tour-bg, #ffffff)',
  color: 'var(--tour-text, #0f172a)',
  boxShadow: 'var(--tour-btn-shadow, 0 4px 14px rgba(0,0,0,0.12))',
  cursor: 'pointer',
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  padding: 0,
  fontFamily: 'inherit',
};

const MENU: CSSProperties = {
  position: 'absolute',
  left: 0,
  bottom: 52,
  minWidth: 260,
  maxWidth: 360,
  maxHeight: '60vh',
  overflow: 'auto',
  borderRadius: 'var(--tour-radius, 10px)',
  border: '1px solid var(--tour-border, rgba(0,0,0,0.08))',
  background: 'var(--tour-bg, #ffffff)',
  color: 'var(--tour-text, #0f172a)',
  boxShadow: 'var(--tour-menu-shadow, 0 16px 32px rgba(0,0,0,0.18))',
  padding: 6,
  fontFamily: 'var(--tour-font, system-ui, -apple-system, Segoe UI, Roboto, sans-serif)',
};

const MENU_HEADER: CSSProperties = {
  fontSize: 11,
  fontWeight: 600,
  textTransform: 'uppercase',
  letterSpacing: 0.4,
  color: 'var(--tour-muted, rgba(15,23,42,0.55))',
  padding: '6px 10px',
};

const MENU_ITEM: CSSProperties = {
  width: '100%',
  display: 'flex',
  alignItems: 'flex-start',
  gap: 10,
  padding: '8px 10px',
  background: 'transparent',
  border: 'none',
  cursor: 'pointer',
  borderRadius: 6,
  color: 'inherit',
  fontFamily: 'inherit',
  textAlign: 'left',
};

const MENU_ITEM_TITLE: CSSProperties = {
  display: 'block',
  fontSize: 13,
  fontWeight: 500,
  lineHeight: 1.3,
};

const MENU_ITEM_DESC: CSSProperties = {
  display: 'block',
  fontSize: 11,
  color: 'var(--tour-muted, rgba(15,23,42,0.55))',
  lineHeight: 1.35,
  marginTop: 2,
};

const PLAY_BADGE: CSSProperties = {
  marginLeft: 'auto',
  flexShrink: 0,
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  width: 24,
  height: 24,
  borderRadius: 9999,
  background: 'var(--tour-primary, #3b82f6)',
  color: 'var(--tour-primary-text, #ffffff)',
};

const DefaultIcon = (
  <svg viewBox="0 0 20 20" width="16" height="16" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1.5">
    <circle cx="10" cy="10" r="8" />
    <path
      d="M7.5 7.5c.4-1.2 1.4-2 2.7-2 1.5 0 2.8 1 2.8 2.5 0 1.3-1 1.8-1.8 2.3-.7.4-1.2.8-1.2 1.7"
      strokeLinecap="round"
    />
    <circle cx="10" cy="14.5" r="0.6" fill="currentColor" stroke="none" />
  </svg>
);

const PlayIcon = (
  <svg viewBox="0 0 20 20" width="10" height="10" aria-hidden="true" fill="currentColor">
    <path d="M6 4.5v11l9-5.5z" />
  </svg>
);

function TourButton({ style, className, 'aria-label': ariaLabel, icon }: TourButtonProps) {
  const { tours, play } = useAvailableTours();
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement | null>(null);

  // Close on outside click or Esc.
  useEffect(() => {
    if (!open) return;
    const onPointer = (e: MouseEvent) => {
      if (!wrapRef.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false); };
    document.addEventListener('mousedown', onPointer);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onPointer);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  const onPlay = useCallback((slug: string) => {
    setOpen(false);
    play(slug);
  }, [play]);

  if (tours.length === 0) return null;

  return (
    <div
      ref={wrapRef}
      className={className}
      style={{ ...FIXED_CONTAINER, ...style }}
    >
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-label={ariaLabel ?? `Guided tours for this page (${tours.length})`}
        aria-haspopup="menu"
        aria-expanded={open}
        title={tours.length === 1
          ? `Play ${tours[0].name ?? defaultTourName(tours[0].tourSlug)}`
          : `${tours.length} guided tours available`}
        style={TRIGGER}
      >
        {icon ?? DefaultIcon}
      </button>

      {open && (
        <div role="menu" style={MENU}>
          <div style={MENU_HEADER}>
            {tours.length === 1 ? 'Tour for this page' : `${tours.length} tours for this page`}
          </div>
          {tours.map((t) => {
            const title = t.name ?? defaultTourName(t.tourSlug);
            return (
              <button
                key={t.tourSlug}
                type="button"
                role="menuitem"
                style={MENU_ITEM}
                onClick={() => onPlay(t.tourSlug)}
                onMouseEnter={(e) => { (e.currentTarget.style.background = 'var(--tour-hover-bg, rgba(15,23,42,0.04))'); }}
                onMouseLeave={(e) => { (e.currentTarget.style.background = 'transparent'); }}
              >
                <span style={{ flex: 1, minWidth: 0 }}>
                  <span style={MENU_ITEM_TITLE}>{title}</span>
                  {t.description && <span style={MENU_ITEM_DESC}>{t.description}</span>}
                </span>
                <span style={PLAY_BADGE} aria-hidden="true">{PlayIcon}</span>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

export { TourButton, useAvailableTours };
export type { TourButtonProps, AvailableToursApi };
