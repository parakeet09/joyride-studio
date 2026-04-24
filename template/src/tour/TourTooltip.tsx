// Default Joyride tooltipComponent — framework-neutral, no design-system imports.
//
// Consumers that want deeper theming pass a custom `tooltipComponent` to
// <TourProvider>. This default uses CSS variables (see tour.css) + inline
// styles so it renders correctly in any Vite + React repo with no extra setup.
//
// `requireInteraction` is handled via Joyride's `before` hook (emitted in
// the generated step file), NOT a target-click listener here. When the flag
// is set, the Next/Primary button is hidden and Joyride's own lifecycle
// waits on the hook — more idiomatic and avoids listener-management bugs.
//
// Width/alignment strategy:
//   - Shell is fluid between MIN_WIDTH and MAX_WIDTH so short content looks
//     compact and long content gets breathing room without wrapping words
//     awkwardly.
//   - Footer uses flex-wrap with rowGap so progress/hint text and buttons
//     stack cleanly when the tooltip is narrow or the locale strings are long.
//   - Dev-only useEffect measures the rendered footer and logs a warning if
//     any button is visually clipped (scrollWidth > clientWidth). This catches
//     locale/typography regressions early.

import { useEffect, useRef } from 'react';

import type { TooltipRenderProps } from 'react-joyride';

type TourTooltipProps = TooltipRenderProps;

const MIN_WIDTH = 260;
const MAX_WIDTH = 420;

const SHELL_STYLE: React.CSSProperties = {
  // Fluid: the tooltip grows with its content between these bounds instead
  // of being locked to a fixed 360px that overflows on long titles.
  minWidth: MIN_WIDTH,
  maxWidth: `min(${MAX_WIDTH}px, calc(100vw - 32px))`,
  width: 'max-content',
  borderRadius: 'var(--tour-radius, 8px)',
  border: '1px solid var(--tour-border, rgba(0,0,0,0.08))',
  background: 'var(--tour-bg, #ffffff)',
  color: 'var(--tour-text, #0f172a)',
  boxShadow: 'var(--tour-shadow, 0 20px 40px rgba(0,0,0,0.15))',
  padding: 16,
  fontFamily: 'var(--tour-font, system-ui, -apple-system, Segoe UI, Roboto, sans-serif)',
  fontSize: 14,
  lineHeight: 1.5,
  boxSizing: 'border-box',
};

const HEADER_STYLE: React.CSSProperties = {
  display: 'flex',
  alignItems: 'flex-start',
  gap: 8,
  marginBottom: 8,
};

const TITLE_STYLE: React.CSSProperties = {
  flex: 1,
  margin: 0,
  fontSize: 16,
  fontWeight: 600,
  color: 'var(--tour-title-color, var(--tour-text, #0f172a))',
  lineHeight: 1.35,
  // Prevent the title from being pushed out by a very long word; wrap cleanly.
  overflowWrap: 'anywhere',
};

const CLOSE_BTN_STYLE: React.CSSProperties = {
  marginRight: -4,
  marginTop: -4,
  padding: 4,
  borderRadius: 6,
  border: 'none',
  background: 'transparent',
  cursor: 'pointer',
  color: 'var(--tour-muted, rgba(15,23,42,0.6))',
  lineHeight: 0,
  flexShrink: 0,
};

const BODY_STYLE: React.CSSProperties = {
  color: 'var(--tour-body-color, var(--tour-text, #0f172a))',
  fontSize: 14,
  overflowWrap: 'anywhere',
};

const FOOTER_STYLE: React.CSSProperties = {
  marginTop: 16,
  display: 'flex',
  alignItems: 'center',
  flexWrap: 'wrap',
  columnGap: 8,
  rowGap: 8,
};

const META_GROUP_STYLE: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 6,
  minWidth: 0,
  flex: '1 1 auto',
};

const PROGRESS_STYLE: React.CSSProperties = {
  fontSize: 12,
  color: 'var(--tour-muted, rgba(15,23,42,0.6))',
  whiteSpace: 'nowrap',
};

const HINT_STYLE: React.CSSProperties = {
  fontSize: 12,
  fontStyle: 'italic',
  color: 'var(--tour-muted, rgba(15,23,42,0.6))',
  minWidth: 0,
  overflow: 'hidden',
  textOverflow: 'ellipsis',
  whiteSpace: 'nowrap',
};

const BTN_GROUP_STYLE: React.CSSProperties = {
  marginLeft: 'auto',
  display: 'flex',
  alignItems: 'center',
  gap: 8,
  flexShrink: 0,
  flexWrap: 'wrap',
  justifyContent: 'flex-end',
};

const BTN_BASE: React.CSSProperties = {
  height: 32,
  padding: '0 12px',
  borderRadius: 'var(--tour-btn-radius, 9999px)',
  fontSize: 13,
  fontWeight: 500,
  cursor: 'pointer',
  border: '1px solid transparent',
  lineHeight: 1,
  fontFamily: 'inherit',
  whiteSpace: 'nowrap',
};

const BTN_PRIMARY: React.CSSProperties = {
  ...BTN_BASE,
  background: 'var(--tour-primary, #3b82f6)',
  color: 'var(--tour-primary-text, #ffffff)',
};

const BTN_SECONDARY: React.CSSProperties = {
  ...BTN_BASE,
  background: 'var(--tour-secondary-bg, rgba(15,23,42,0.06))',
  color: 'var(--tour-secondary-text, var(--tour-text, #0f172a))',
};

const BTN_GHOST: React.CSSProperties = {
  ...BTN_BASE,
  background: 'transparent',
  color: 'var(--tour-muted, rgba(15,23,42,0.65))',
};

const IS_DEV = typeof import.meta !== 'undefined' && (import.meta as { env?: { DEV?: boolean } }).env?.DEV === true;

function TourTooltip(props: TourTooltipProps) {
  const {
    step,
    index,
    size,
    isLastStep,
    backProps,
    closeProps,
    primaryProps,
    skipProps,
    tooltipProps,
  } = props;

  const requireInteraction = !!(step.data as { requireInteraction?: boolean } | undefined)?.requireInteraction;
  const showBack = index > 0;
  const showSkip = !isLastStep;

  // Dev-only alignment guard: after paint, measure the tooltip shell + footer
  // and warn when buttons are visually clipped by the container. Catches
  // locale/typography regressions (e.g. long "Next" translation pushing
  // content past maxWidth) during authoring rather than at end-user runtime.
  const shellRef = useRef<HTMLDivElement | null>(null);
  const footerRef = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    if (!IS_DEV) return;
    const shell = shellRef.current;
    const footer = footerRef.current;
    if (!shell || !footer) return;

    // Run after paint so layout has settled.
    const id = window.requestAnimationFrame(() => {
      const shellClips = shell.scrollWidth > shell.clientWidth + 1;
      const footerClips = footer.scrollWidth > footer.clientWidth + 1;
      if (shellClips || footerClips) {
        // eslint-disable-next-line no-console
        console.warn(
          '[tour] tooltip content overflows its container — buttons or copy may be clipped.',
          {
            step: index + 1,
            of: size,
            title: typeof step.title === 'string' ? step.title : undefined,
            shell: { scrollWidth: shell.scrollWidth, clientWidth: shell.clientWidth },
            footer: { scrollWidth: footer.scrollWidth, clientWidth: footer.clientWidth },
            hint: 'Try shortening the title/body, or override --tour-max-width / width via the Settings panel.',
          },
        );
      }
    });
    return () => window.cancelAnimationFrame(id);
  }, [index, size, step.title, step.content]);

  return (
    <div
      {...tooltipProps}
      ref={shellRef}
      style={SHELL_STYLE}
      aria-label={typeof step.title === 'string' ? step.title : 'Tour step'}
    >
      <div style={HEADER_STYLE}>
        {step.title && <h3 style={TITLE_STYLE}>{step.title}</h3>}
        <button
          {...closeProps}
          type="button"
          style={CLOSE_BTN_STYLE}
          aria-label={closeProps['aria-label']}
        >
          <svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
            <path d="M4 4l8 8M12 4l-8 8" />
          </svg>
        </button>
      </div>

      <div style={BODY_STYLE}>{step.content}</div>

      <div ref={footerRef} style={FOOTER_STYLE}>
        <span style={META_GROUP_STYLE}>
          <span style={PROGRESS_STYLE}>{index + 1} of {size}</span>
          {requireInteraction && (
            <span style={HINT_STYLE} title="click the highlighted item to continue">
              · click the highlighted item to continue
            </span>
          )}
        </span>

        <div style={BTN_GROUP_STYLE}>
          {showSkip && (
            <button
              {...skipProps}
              type="button"
              style={BTN_GHOST}
              aria-label={skipProps['aria-label']}
            >
              Skip
            </button>
          )}
          {showBack && (
            <button
              {...backProps}
              type="button"
              style={BTN_SECONDARY}
              aria-label={backProps['aria-label']}
            >
              Back
            </button>
          )}
          {!requireInteraction && (
            <button
              {...primaryProps}
              type="button"
              style={BTN_PRIMARY}
              aria-label={primaryProps['aria-label']}
            >
              {isLastStep ? 'Done' : 'Next'}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

export { TourTooltip };
export type { TourTooltipProps };
