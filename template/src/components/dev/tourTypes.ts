// Types shared between TourStepInspector (browser) and tourPlugin (vite).
// Mirrored in vite-tour-plugin.ts — keep in sync.
//
// Schema is organised into 11 categories matching react-joyride's playground
// grouping so developers have a familiar mental model, plus two joyride-studio
// additions (Positioning Stability, Mobile) that sit on top of Joyride's API:
//   Tour Options · Appearance · Arrow · Beacon · Overlay & Spotlight ·
//   Scroll Behavior · Interactions · Positioning Stability · Mobile ·
//   Custom Components · Locale
//
// Global settings live in TourGlobalConfig (one per repo, .tour-flow/config.json).
// Per-step overrides live in TourStepEntry.* (one set per captured step).

import type { SourceInfo as StackFrame } from './fiberSource';

/** Joyride v3 placement options — matches Step.placement. */
type TourPlacement =
  | 'top' | 'top-start' | 'top-end'
  | 'bottom' | 'bottom-start' | 'bottom-end'
  | 'left' | 'left-start' | 'left-end'
  | 'right' | 'right-start' | 'right-end'
  | 'auto' | 'center';

/** react-joyride v3 ButtonType — which buttons render in the tooltip. */
type TourButtonType = 'back' | 'close' | 'primary' | 'skip';

/** Joyride `closeButtonAction` / `overlayClickAction` / `dismissKeyAction` values. */
type TourCloseAction = 'close' | 'skip';
type TourOverlayAction = 'close' | 'next' | false;
type TourDismissAction = 'close' | 'next' | false;
type TourBeaconTrigger = 'click' | 'hover';

// ---------------------------------------------------------------------------
// Per-step behaviour flags
// Each flag lists which category it belongs to (matches global config layout).
// Every flag is an OVERRIDE — omitted means "use the global value."

interface TourStepBehavior {
  // ----- Interactions -----
  /** Advance only when the user interacts with the target. Wired via a `before` hook. */
  requireInteraction?: boolean;
  /** Hide the close button for this step. */
  hideClose?: boolean;
  /** Hide the back button for this step. */
  hideBack?: boolean;
  /** Hide the entire footer. Forces interaction with target to advance. */
  hideFooter?: boolean;
  /** Block pointer events on the target through the spotlight. */
  blockTargetInteraction?: boolean;
  /** Per-step override of close-button behaviour. */
  closeButtonAction?: TourCloseAction;
  /** Per-step override of overlay-click behaviour. */
  overlayClickAction?: TourOverlayAction;
  /** Per-step override of ESC-key behaviour. */
  dismissKeyAction?: TourDismissAction;
  /** Max ms to wait for target element to appear before failing. */
  targetWaitTimeout?: number;
  /** Max ms to wait for `before` hook to resolve. 0 = no timeout. */
  beforeTimeout?: number;
  /** Disable focus trap for this step. */
  disableFocusTrap?: boolean;

  // ----- Beacon -----
  /** Skip the beacon, show tooltip immediately. */
  skipBeacon?: boolean;
  /** Beacon interaction that opens the tooltip. */
  beaconTrigger?: TourBeaconTrigger;

  // ----- Overlay & Spotlight -----
  /** Don't show the overlay dim backdrop. */
  hideOverlay?: boolean;
  /** Spotlight padding (px) — number or per-side object. */
  spotlightPadding?: number;
  /** Spotlight border radius (px). */
  spotlightRadius?: number;

  // ----- Scroll Behavior -----
  /** Skip scroll-into-view for this step. */
  skipScroll?: boolean;
  /** CSS selector — scroll to this element instead of `target`. */
  scrollTarget?: string;
  /** CSS selector — highlight this element instead of `target`. */
  spotlightTarget?: string;

  // ----- Tour Options -----
  /** Position tooltip relative to viewport instead of scroll container. */
  isFixed?: boolean;
  /** Per-step offset between target and tooltip (px). */
  offset?: number;

  // ----- Locale (per-step button-text overrides) -----
  /** Override the Back-button label for this step. */
  localeBack?: string;
  /** Override the Next/Last-button label for this step. */
  localeNext?: string;
  /** Override the Skip-button label for this step. */
  localeSkip?: string;
  /** Override the Close-button aria-label for this step. */
  localeClose?: string;
}

/** Media attached to a step's tooltip body. */
type TourStepMedia =
  | { kind: 'text' }
  | { kind: 'image'; src: string; alt?: string }
  | { kind: 'video'; src: string; poster?: string }
  | { kind: 'iframe'; src: string; title?: string };

/**
 * A single captured step. Enough information for /joyride-studio to:
 * 1. AST-inject data-tour-id at the chosen stack frame
 * 2. Emit a Joyride Step object in the generated tour file
 */
interface TourStepEntry {
  /** Generated on the server. */
  id: string;
  /** Order within its screen (0-based). */
  order: number;
  /** Default target frame chosen by the inspector (first non-primitive). */
  targetFrameIndex: number;
  /** Full fiber call chain at click time, innermost first. */
  stackTrace: StackFrame[];
  /** Fallback CSS selector. */
  selector: string;
  /** Element metadata captured at click time. */
  tag: string;
  classes: string;
  text: string;
  rect: { x: number; y: number; w: number; h: number };
  viewport: { scrollX: number; scrollY: number; width: number; height: number };
  /** Tooltip title. */
  title: string;
  /** Tooltip body. */
  body: string;
  /** Placement hint. */
  placement: TourPlacement;
  /** Per-step behaviour overrides. */
  behavior: TourStepBehavior;
  /** Media attached to this step. */
  media: TourStepMedia;
  /** Arbitrary passthrough for future use. */
  data?: Record<string, unknown>;
  timestamp: number;
}

/**
 * All steps captured for one screen. Serialized to
 * .tour-flow/screens/<screen-id>.json
 */
interface TourScreenCapture {
  screenId: string;
  route: string;
  description: string;
  steps: TourStepEntry[];
  createdAt: number;
  updatedAt: number;
}

// ---------------------------------------------------------------------------
// Global config — 9 categories mirroring react-joyride's playground

/** Tour Options — navigation + progress + run behaviour. */
interface TourOptions {
  /** Auto-start signal wired into the TourProvider's autoStart prop. Skill-internal. */
  autoStartExpr?: string;
  /** User ID expression for completion namespacing. Skill-internal. */
  userIdExpr?: string;
  /** localStorage key prefix. */
  storageKeyPrefix?: string;
  /** Play sequentially with the Next button vs manual control. */
  continuous: boolean;
  /** Show "N of M" progress indicator in the footer. */
  showProgress: boolean;
  /** Include 'skip' in the global button set. */
  showSkip: boolean;
  /** Scroll the page for the first step too. */
  scrollToFirstStep: boolean;
  /** Global button order / visibility. */
  buttons: TourButtonType[];
  /** Allow target clicks through the spotlight globally. */
  spotlightClicks: boolean;
  /** Verbose console logging in dev. */
  debug: boolean;
}

/** Appearance — colours, typography, tooltip dimensions. */
interface TourAppearance {
  primaryColor?: string;
  backgroundColor?: string;
  textColor?: string;
  /** z-index for overlay + tooltip. */
  zIndex: number;
  /** Tooltip width (CSS value). */
  width?: string | number;
}

/** Arrow — caret between tooltip and target. */
interface TourArrow {
  /** Arrow base width (px). */
  arrowBase: number;
  /** Arrow depth (px). */
  arrowSize: number;
  /** Distance between arrow and tooltip edge (px). */
  arrowSpacing: number;
  arrowColor?: string;
}

/** Beacon — pulsing indicator before the tooltip opens. */
interface TourBeacon {
  beaconSize: number;
  beaconTrigger: TourBeaconTrigger;
  /** Skip beacons for every step globally (steps can still override). */
  skipBeacon: boolean;
}

/** Overlay & Spotlight — backdrop dim + cutout around the target. */
interface TourOverlaySpotlight {
  overlayColor?: string;
  /** Hide the backdrop for all steps globally. */
  hideOverlay: boolean;
  spotlightPadding: number;
  spotlightRadius: number;
  /** Block pointer events on the target through the spotlight (global). */
  blockTargetInteraction: boolean;
}

/** Scroll Behavior — how the tour scrolls to targets. */
interface TourScrollBehavior {
  scrollDuration: number;
  scrollOffset: number;
  /** Skip scroll-into-view for every step globally. */
  skipScroll: boolean;
  /** Work around scroll-parent quirks (Joyride's `disableScrollParentFix`). */
  disableScrollParentFix: boolean;
}

/** Interactions — overlay, ESC, close-button behaviour + focus trap. */
interface TourInteractions {
  overlayClickAction: TourOverlayAction;
  dismissKeyAction: TourDismissAction;
  closeButtonAction: TourCloseAction;
  /** Disable the focus trap (not recommended). */
  disableFocusTrap: boolean;
  /** Wait up to Nms for a target to appear before failing. */
  targetWaitTimeout: number;
  /** Wait up to Nms for the `before` hook to resolve. */
  beforeTimeout: number;
  /** Delay (ms) before showing the loader while waiting. */
  loaderDelay: number;
}

/**
 * Positioning Stability — how the tooltip stays attached when the target
 * shifts due to scroll, animation, resize, or DOM mutation.
 *
 * Layers:
 *   1. floating-ui `autoUpdate` (react-joyride uses @floating-ui/react-dom
 *      under the hood) — handles scroll + size changes natively.
 *   2. Optional MutationObserver on the target — catches class/attribute
 *      changes that don't trigger the resize/scroll path (e.g. an animation
 *      that rewrites `transform` but leaves the bounding rect stable until
 *      it completes).
 */
interface TourPositioningStability {
  /** Master switch — when false, Joyride's default (no autoUpdate) is used. */
  autoUpdate: boolean;
  /** Reposition when any scrollable ancestor scrolls. */
  ancestorScroll: boolean;
  /** Reposition when an ancestor (or viewport) resizes. */
  ancestorResize: boolean;
  /** Reposition when the target element itself resizes. */
  elementResize: boolean;
  /** Reposition on layout-shift events reported by the browser. */
  layoutShift: boolean;
  /** Reposition every animation frame. Expensive — only for continuously animating targets. */
  animationFrame: boolean;
  /** Also watch target DOM mutations (class, style, attributes) via MutationObserver. */
  observeMutations: boolean;
  /** Debounce mutation-driven repositions (ms). Prevents tight update loops. */
  mutationThrottle: number;
}

/**
 * Mobile — viewport-aware overrides applied when the screen is narrower than
 * `breakpoint`. Mobile tours have different ergonomics: touch tap targets,
 * fewer placement options, overlays that respect safe areas, etc. These
 * overrides stack on top of the non-mobile values so existing tours keep
 * working on desktop.
 */
interface TourMobile {
  /** Enable viewport-aware mobile overrides. */
  enabled: boolean;
  /** Max viewport width (px) that counts as "mobile". */
  breakpoint: number;
  /** Placement to use on mobile. 'center' turns steps into full-screen modals. */
  placement?: TourPlacement;
  /** Beacon diameter on mobile — larger by default for touch. */
  beaconSize: number;
  /** Spotlight padding on mobile (px). */
  spotlightPadding: number;
  /** Scroll offset on mobile — accounts for sticky mobile headers. */
  scrollOffset: number;
  /** Position tooltips against the viewport on mobile — ignores scroll containers. */
  isFixed: boolean;
  /** Skip beacons on mobile — recommended for touch (tap anywhere to advance). */
  skipBeacon: boolean;
  /** Tooltip width override on mobile. Defaults to near-full width. */
  width?: string | number;
  /** Disable scroll-to-target on mobile (keeps virtual keyboard from jumping). */
  disableScroll: boolean;
}

/** Custom Components — paths to consumer-provided renderers. */
interface TourCustomComponents {
  /** `@/tour/tooltip/MyTooltip` or similar. null = use default. */
  tooltipComponentPath?: string | null;
  beaconComponentPath?: string | null;
  arrowComponentPath?: string | null;
  /** null disables the loader entirely. undefined uses the default. */
  loaderComponentPath?: string | null;
}

/** Locale — button labels. */
interface TourLocale {
  back: string;
  close: string;
  last: string;
  next: string;
  /** Uses {current} and {total} placeholders when showProgress is true. */
  nextWithProgress: string;
  open: string;
  skip: string;
}

/**
 * The full global config. One per repo, persisted to .tour-flow/config.json.
 * The build step and the runtime TourProvider read from this.
 */
interface TourGlobalConfig {
  tourOptions: TourOptions;
  appearance: TourAppearance;
  arrow: TourArrow;
  beacon: TourBeacon;
  overlaySpotlight: TourOverlaySpotlight;
  scrollBehavior: TourScrollBehavior;
  interactions: TourInteractions;
  positioningStability: TourPositioningStability;
  mobile: TourMobile;
  customComponents: TourCustomComponents;
  locale: TourLocale;
}

const DEFAULT_GLOBAL_CONFIG: TourGlobalConfig = {
  tourOptions: {
    autoStartExpr: 'false',
    userIdExpr: 'null',
    storageKeyPrefix: 'tour.completed',
    continuous: true,
    showProgress: true,
    showSkip: true,
    scrollToFirstStep: true,
    buttons: ['back', 'close', 'primary', 'skip'],
    spotlightClicks: false,
    debug: false,
  },
  appearance: {
    zIndex: 1000,
  },
  arrow: {
    arrowBase: 32,
    arrowSize: 16,
    arrowSpacing: 12,
  },
  beacon: {
    beaconSize: 36,
    beaconTrigger: 'click',
    skipBeacon: false,
  },
  overlaySpotlight: {
    hideOverlay: false,
    spotlightPadding: 10,
    spotlightRadius: 8,
    blockTargetInteraction: false,
  },
  scrollBehavior: {
    scrollDuration: 400,
    scrollOffset: 40,
    skipScroll: false,
    disableScrollParentFix: false,
  },
  interactions: {
    overlayClickAction: 'close',
    dismissKeyAction: 'close',
    closeButtonAction: 'close',
    disableFocusTrap: false,
    targetWaitTimeout: 1000,
    beforeTimeout: 5000,
    loaderDelay: 300,
  },
  positioningStability: {
    autoUpdate: true,
    ancestorScroll: true,
    ancestorResize: true,
    elementResize: true,
    layoutShift: true,
    animationFrame: false,
    observeMutations: false,
    mutationThrottle: 100,
  },
  mobile: {
    enabled: true,
    breakpoint: 768,
    placement: 'center',
    beaconSize: 44,
    spotlightPadding: 6,
    scrollOffset: 64,
    isFixed: false,
    skipBeacon: true,
    width: '92vw',
    disableScroll: false,
  },
  customComponents: {
    tooltipComponentPath: null,
    beaconComponentPath: null,
    arrowComponentPath: null,
    loaderComponentPath: undefined,
  },
  locale: {
    back: 'Back',
    close: 'Close',
    last: 'Done',
    next: 'Next',
    nextWithProgress: 'Next ({current}/{total})',
    open: 'Show next tip',
    skip: 'Skip',
  },
};

export { DEFAULT_GLOBAL_CONFIG };
export type {
  TourPlacement,
  TourButtonType,
  TourCloseAction,
  TourOverlayAction,
  TourDismissAction,
  TourBeaconTrigger,
  TourStepBehavior,
  TourStepMedia,
  TourStepEntry,
  TourScreenCapture,
  TourOptions,
  TourAppearance,
  TourArrow,
  TourBeacon,
  TourOverlaySpotlight,
  TourScrollBehavior,
  TourInteractions,
  TourPositioningStability,
  TourMobile,
  TourCustomComponents,
  TourLocale,
  TourGlobalConfig,
};
