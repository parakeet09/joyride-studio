// Joyride style overrides wired to the app's design tokens.
//
// The tour's custom TourTooltip owns most visual details (background, typography,
// buttons). Joyride's `styles` prop only needs to neutralise the default tooltip
// chrome and set overlay/arrow colors that TourTooltip can't reach.
//
// Tokens reference CSS variables from site-theme.css so dark/light mode flips
// without a JS theme subscription.

import type { CSSProperties, SVGAttributes } from 'react';

// Joyride's `styles` type — inlined to avoid importing from react-joyride in a
// pure-data module. Mirror react-joyride's PartialDeep<Styles>.
interface TourStyleOverrides {
  arrow?: CSSProperties;
  beacon?: CSSProperties;
  beaconInner?: CSSProperties;
  beaconOuter?: CSSProperties;
  beaconWrapper?: CSSProperties;
  floater?: CSSProperties;
  overlay?: CSSProperties;
  spotlight?: SVGAttributes<SVGPathElement>;
  tooltip?: CSSProperties;
  tooltipContainer?: CSSProperties;
  tooltipContent?: CSSProperties;
  tooltipFooter?: CSSProperties;
  tooltipFooterSpacer?: CSSProperties;
  tooltipTitle?: CSSProperties;
}

const tourStyles: TourStyleOverrides = {
  // Backdrop: soft dim, doesn't fight the theme. The overlay renders full-screen.
  overlay: {
    mixBlendMode: 'normal',
    background: 'rgba(15, 23, 42, 0.55)',
  },
  // Arrow fill — matches card background so the tooltip feels continuous.
  arrow: {
    color: 'var(--card, #ffffff)',
  },
  // Spotlight (SVG Path) — slightly softer than default cut.
  spotlight: {
    rx: 8,
    ry: 8,
  },
  // Neutralise Joyride's default tooltip chrome; TourTooltip draws its own Box.
  tooltip: {
    background: 'transparent',
    padding: 0,
    filter: 'none',
    boxShadow: 'none',
  },
  tooltipContainer: {
    background: 'transparent',
    padding: 0,
  },
  tooltipContent: {
    padding: 0,
  },
  tooltipTitle: {
    margin: 0,
    padding: 0,
  },
  tooltipFooter: {
    display: 'none', // our custom tooltip renders its own footer
  },
  // Beacon pulse color — use the primary token so it respects theme.
  beacon: {
    background: 'transparent',
  },
  beaconInner: {
    background: 'var(--primary, #3b82f6)',
  },
  beaconOuter: {
    borderColor: 'var(--primary, #3b82f6)',
  },
};

const tourLocale = {
  back: 'Back',
  close: 'Close',
  last: 'Done',
  next: 'Next',
  nextWithProgress: 'Next ({current}/{total})',
  skip: 'Skip',
  open: 'Show next tip',
};

export { tourStyles, tourLocale };
export type { TourStyleOverrides };
