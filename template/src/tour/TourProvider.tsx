// Tour runtime provider — owns Joyride lifecycle, localStorage completion,
// and exposes a useTour() hook for the TourButton, analytics, and any
// consumer that wants programmatic control.
//
// Uses react-joyride's `useJoyride()` hook (not the <Joyride> component) so
// we can expose the full Controls surface + failure list + event subscription
// through our own context. This mirrors Joyride's own recommended API.
//
// Framework-generic: does NOT import auth or analytics. Callers decide when
// to set `autoStart` (typically when the app's `isNewUser` flag is true).
//
// Joyride Studio value-adds on top of react-joyride:
//   1. Positioning stability — forwards `floatingOptions.autoUpdate` to the
//      floating-ui layer Joyride uses, and optionally runs a MutationObserver
//      on the active step's target so class/attribute changes trigger a
//      reposition even when bounding-rect stays stable until an animation
//      completes.
//   2. Mobile overrides — when the viewport is narrower than a configured
//      breakpoint, the provider swaps in mobile-friendly placement / beacon
//      size / spotlight padding / scroll offset / width values while leaving
//      the desktop tour untouched.

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import type { ReactNode } from 'react';

import { useLocation } from 'react-router-dom';
import { STATUS, useJoyride } from 'react-joyride';
import type {
  Controls,
  EventData,
  Events,
  EventHandler,
  Step,
  StepFailure,
  TooltipRenderProps,
} from 'react-joyride';

import { tourLocale, tourStyles } from './tokens';
import { getAvailableToursForPath, getTourForPath } from './registry';
import type { TourEntry } from './registry';
import { TourTooltip as DefaultTourTooltip } from './TourTooltip';

interface TourCtxValue {
  /** The tour resolved for the current route, or null. Used for autoStart. */
  tour: TourEntry | null;
  /**
   * All tours route-matching the current path whose shouldShow passes.
   * TourButton's menu / nav integrations render buttons per entry.
   */
  availableTours: TourEntry[];
  /** Whether any tour is currently running. */
  isRunning: boolean;
  /** True when the viewport is under the configured mobile breakpoint. */
  isMobile: boolean;
  /** Convenience: start the resolved tour (clears pending completion). */
  start: () => void;
  /** Play a specific tour by slug. Used by the tour menu and nav integrations. */
  play: (_tourSlug: string) => void;
  /** Convenience: stop without marking completion. */
  stop: () => void;
  /** Convenience: clear completion + restart from step 0. */
  reset: () => void;
  /** Re-run the registry lookup. Call from views that own anchors (via useTourRefreshOnMount). */
  refresh: () => void;
  /** Full react-joyride Controls — go(index), info(), open(), etc. null until tour resolves. */
  controls: Controls | null;
  /** react-joyride on(eventType, handler) — filtered event subscription. null until tour resolves. */
  on: ((_type: Events, _handler: EventHandler) => () => void) | null;
  /** Steps that failed during the last run (target_not_found, before-hook error). */
  failures: StepFailure[];
  /** localStorage key for the current user + tour, or null. */
  completionKey: string | null;
}

const TourCtx = createContext<TourCtxValue | null>(null);

/** Per-axis controls for floating-ui's autoUpdate. Matches @floating-ui/dom. */
interface AutoUpdateOptions {
  ancestorScroll?: boolean;
  ancestorResize?: boolean;
  elementResize?: boolean;
  layoutShift?: boolean;
  animationFrame?: boolean;
}

interface PositioningStabilityProps {
  /** Master switch — when false, defer entirely to Joyride's defaults. */
  autoUpdate?: boolean;
  ancestorScroll?: boolean;
  ancestorResize?: boolean;
  elementResize?: boolean;
  layoutShift?: boolean;
  animationFrame?: boolean;
  /** Watch target DOM mutations; dispatch a synthetic resize to trigger reposition. */
  observeMutations?: boolean;
  mutationThrottle?: number;
}

interface MobileOverrideProps {
  /** Enable viewport-aware overrides. */
  enabled?: boolean;
  breakpoint?: number;
  placement?: Step['placement'];
  beaconSize?: number;
  spotlightPadding?: number;
  scrollOffset?: number;
  isFixed?: boolean;
  skipBeacon?: boolean;
  width?: string | number;
  disableScroll?: boolean;
}

interface TourProviderProps {
  children: ReactNode;
  autoStart?: boolean;
  userId?: string | null;
  storageKeyPrefix?: string;
  overlayClickAction?: 'close' | 'next' | false;
  dismissKeyAction?: 'close' | 'next' | false;
  zIndex?: number;
  scrollDuration?: number;
  scrollOffset?: number;
  showProgress?: boolean;
  showSkip?: boolean;
  tooltipComponent?: React.ComponentType<TooltipRenderProps>;
  /** Positioning-stability layer. Safe defaults on; opt in to observeMutations. */
  positioningStability?: PositioningStabilityProps;
  /** Mobile overrides. Enabled by default with a 768px breakpoint. */
  mobile?: MobileOverrideProps;
}

function completionKeyFor(prefix: string, userId: string | null | undefined, tourSlug: string): string | null {
  if (!userId) return null;
  return `${prefix}.${userId}.${tourSlug}`;
}

/**
 * Subscribe to a matchMedia query with SSR-safe defaults. Used for the mobile
 * breakpoint — we keep the listener hot while the provider is mounted and
 * flip `isMobile` synchronously with the viewport.
 */
function useViewportMatches(query: string, enabled: boolean): boolean {
  const [matches, setMatches] = useState(false);
  useEffect(() => {
    if (!enabled || typeof window === 'undefined' || !window.matchMedia) {
      setMatches(false);
      return;
    }
    const mql = window.matchMedia(query);
    const update = () => setMatches(mql.matches);
    update();
    // `addEventListener` is the only supported path — addListener/removeListener
    // are deprecated in all evergreen browsers.
    mql.addEventListener('change', update);
    return () => mql.removeEventListener('change', update);
  }, [query, enabled]);
  return matches;
}

/**
 * Apply mobile-friendly overrides to a step list. Non-destructive — each
 * returned step is a new object; the original `steps` array is untouched so
 * the desktop tour is unaffected if the viewport expands back.
 */
function applyMobileToSteps(steps: Step[], m: Required<MobileOverrideProps>): Step[] {
  return steps.map((s) => {
    const override: Partial<Step> = {};
    if (m.placement) override.placement = m.placement;
    if (m.isFixed) override.isFixed = true;
    if (m.spotlightPadding != null) override.spotlightPadding = m.spotlightPadding;
    if (m.beaconSize != null) override.beaconSize = m.beaconSize;
    if (m.scrollOffset != null) override.scrollOffset = m.scrollOffset;
    if (m.skipBeacon) override.skipBeacon = true;
    if (m.disableScroll) override.skipScroll = true;
    // Joyride reads step-level `styles` and deep-merges over the global
    // styles passed to useJoyride. Mobile width lives here.
    if (m.width != null) {
      override.styles = {
        ...(s.styles ?? {}),
        tooltip: {
          ...((s.styles?.tooltip as Record<string, unknown>) ?? {}),
          width: m.width,
        },
      };
    }
    return { ...s, ...override };
  });
}

function TourProvider({
  children,
  autoStart = false,
  userId = null,
  storageKeyPrefix = 'tour.completed',
  overlayClickAction = 'close',
  dismissKeyAction = 'close',
  zIndex = 1000,
  scrollDuration = 400,
  scrollOffset = 40,
  showProgress = true,
  showSkip = true,
  tooltipComponent,
  positioningStability,
  mobile,
}: TourProviderProps) {
  const ResolvedTooltip = tooltipComponent ?? DefaultTourTooltip;
  const location = useLocation();

  // --- Mobile detection ---------------------------------------------------
  const mobileCfg = useMemo<Required<MobileOverrideProps>>(() => ({
    enabled: mobile?.enabled ?? true,
    breakpoint: mobile?.breakpoint ?? 768,
    placement: mobile?.placement ?? 'center',
    beaconSize: mobile?.beaconSize ?? 44,
    spotlightPadding: mobile?.spotlightPadding ?? 6,
    scrollOffset: mobile?.scrollOffset ?? 64,
    isFixed: mobile?.isFixed ?? false,
    skipBeacon: mobile?.skipBeacon ?? true,
    width: mobile?.width ?? '92vw',
    disableScroll: mobile?.disableScroll ?? false,
  }), [mobile]);

  const isMobile = useViewportMatches(
    `(max-width: ${mobileCfg.breakpoint}px)`,
    mobileCfg.enabled,
  );

  // --- Route resolution ---------------------------------------------------
  const [tour, setTour] = useState<TourEntry | null>(null);
  const [availableTours, setAvailableTours] = useState<TourEntry[]>([]);

  const refresh = useCallback(() => {
    if (typeof window === 'undefined') return;
    const next = getTourForPath(location.pathname);
    const nextAvailable = getAvailableToursForPath(location.pathname);
    setTour((prev) => (prev === next ? prev : next));
    setAvailableTours((prev) => {
      if (prev.length === nextAvailable.length && prev.every((t, i) => t === nextAvailable[i])) {
        return prev;
      }
      return nextAvailable;
    });
  }, [location.pathname]);

  useEffect(() => { refresh(); }, [refresh]);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const handler = () => refresh();
    window.addEventListener('tour:refresh', handler);
    return () => window.removeEventListener('tour:refresh', handler);
  }, [refresh]);

  const completionKey = useMemo(
    () => (tour ? completionKeyFor(storageKeyPrefix, userId, tour.tourSlug) : null),
    [tour, storageKeyPrefix, userId],
  );

  const [isRunning, setIsRunning] = useState(false);
  const [hasAutoStarted, setHasAutoStarted] = useState(false);

  useEffect(() => {
    setHasAutoStarted(false);
    setIsRunning(false);
  }, [tour]);

  useEffect(() => {
    if (!autoStart || hasAutoStarted || !tour || tour.steps.length === 0) return;
    if (completionKey && typeof window !== 'undefined') {
      try {
        if (window.localStorage.getItem(completionKey)) {
          setHasAutoStarted(true);
          return;
        }
      } catch { /* noop */ }
    }
    setIsRunning(true);
    setHasAutoStarted(true);
  }, [autoStart, hasAutoStarted, tour, completionKey]);

  const handleEvent = useCallback(
    (data: EventData) => {
      if (data.status === STATUS.FINISHED || data.status === STATUS.SKIPPED) {
        if (completionKey && typeof window !== 'undefined') {
          try { window.localStorage.setItem(completionKey, '1'); } catch { /* noop */ }
        }
        setIsRunning(false);
      }
    },
    [completionKey],
  );

  // --- Steps for useJoyride ----------------------------------------------
  // When mobile overrides are active, we swap the step list for a mapped
  // copy. Doing this here (vs in a step hook) keeps the provider the single
  // source of truth so custom integrations pick up the same transforms.
  const joyrideSteps = useMemo<Step[]>(() => {
    const baseSteps = tour?.steps ?? [];
    if (!mobileCfg.enabled || !isMobile) return baseSteps;
    return applyMobileToSteps(baseSteps, mobileCfg);
  }, [tour, isMobile, mobileCfg]);

  // --- Positioning stability ---------------------------------------------
  const stability = useMemo<Required<PositioningStabilityProps>>(() => ({
    autoUpdate: positioningStability?.autoUpdate ?? true,
    ancestorScroll: positioningStability?.ancestorScroll ?? true,
    ancestorResize: positioningStability?.ancestorResize ?? true,
    elementResize: positioningStability?.elementResize ?? true,
    layoutShift: positioningStability?.layoutShift ?? true,
    animationFrame: positioningStability?.animationFrame ?? false,
    observeMutations: positioningStability?.observeMutations ?? false,
    mutationThrottle: positioningStability?.mutationThrottle ?? 100,
  }), [positioningStability]);

  // floating-ui's autoUpdate accepts a partial options object. We pass the
  // granular object so consumers can opt axes in/out via the Settings panel.
  // When the master switch is off we flip every axis to false — this turns
  // autoUpdate into a no-op without having to conditionally omit the prop.
  const autoUpdateOption: AutoUpdateOptions = useMemo(() => {
    if (!stability.autoUpdate) {
      return {
        ancestorScroll: false,
        ancestorResize: false,
        elementResize: false,
        layoutShift: false,
        animationFrame: false,
      };
    }
    return {
      ancestorScroll: stability.ancestorScroll,
      ancestorResize: stability.ancestorResize,
      elementResize: stability.elementResize,
      layoutShift: stability.layoutShift,
      animationFrame: stability.animationFrame,
    };
  }, [stability]);

  // Mobile scrollOffset / skipBeacon / width / skipScroll all land at the
  // step level via applyMobileToSteps — the global options stay desktop-tuned.
  const { controls, failures, on, Tour } = useJoyride({
    steps: joyrideSteps,
    run: isRunning && joyrideSteps.length > 0,
    continuous: true,
    scrollToFirstStep: true,
    tooltipComponent: ResolvedTooltip,
    styles: tourStyles,
    locale: tourLocale,
    options: {
      overlayClickAction,
      dismissKeyAction,
      zIndex,
      scrollDuration,
      scrollOffset,
      showProgress,
      buttons: showSkip ? ['back', 'close', 'primary', 'skip'] : ['back', 'close', 'primary'],
    },
    // Forwarded to @floating-ui/react-dom under the hood. Controls how the
    // tooltip keeps itself attached when the target shifts.
    floatingOptions: { autoUpdate: autoUpdateOption },
    onEvent: handleEvent,
  });

  // --- Mutation-observer layer -------------------------------------------
  // When observeMutations is on, watch the current step's target for DOM
  // mutations and dispatch a synthetic window resize so floating-ui's
  // autoUpdate recomputes the tooltip position. This catches shifts that
  // don't register as resizes — e.g. an ancestor flipping `display: flex`
  // mid-animation, or a CSS transform finishing.
  const activeStepIndexRef = useRef<number>(0);
  useEffect(() => {
    if (!on) return;
    const off = on('step:before' as Events, (data: EventData) => {
      activeStepIndexRef.current = data.index ?? 0;
    });
    return off;
  }, [on]);

  useEffect(() => {
    if (!stability.observeMutations || !isRunning || typeof window === 'undefined') return;
    if (typeof MutationObserver === 'undefined') return;

    let throttleId: number | null = null;
    const queueReposition = () => {
      if (throttleId != null) return;
      throttleId = window.setTimeout(() => {
        throttleId = null;
        // Synthetic resize — floating-ui's autoUpdate listens for this and
        // recomputes position without rerunning the whole tour lifecycle.
        window.dispatchEvent(new Event('resize'));
      }, stability.mutationThrottle);
    };

    // Resolve the current target element from the active step.
    const step = joyrideSteps[activeStepIndexRef.current];
    const selector = typeof step?.target === 'string' ? step.target : null;
    const element = selector ? document.querySelector(selector) : step?.target instanceof Element ? step.target : null;
    if (!element) return;

    const observer = new MutationObserver(queueReposition);
    observer.observe(element, {
      attributes: true,
      attributeFilter: ['class', 'style', 'hidden'],
      childList: true,
      subtree: true,
    });
    return () => {
      observer.disconnect();
      if (throttleId != null) window.clearTimeout(throttleId);
    };
  }, [stability.observeMutations, stability.mutationThrottle, isRunning, joyrideSteps]);

  const start = useCallback(() => {
    if (!tour || tour.steps.length === 0) return;
    setIsRunning(true);
  }, [tour]);

  const play = useCallback((tourSlug: string) => {
    const target = availableTours.find((t) => t.tourSlug === tourSlug);
    if (!target || target.steps.length === 0) return;
    setTour(target);
    setIsRunning(false);
    setTimeout(() => setIsRunning(true), 0);
  }, [availableTours]);

  const stop = useCallback(() => {
    setIsRunning(false);
  }, []);

  const reset = useCallback(() => {
    if (completionKey && typeof window !== 'undefined') {
      try { window.localStorage.removeItem(completionKey); } catch { /* noop */ }
    }
    if (tour && tour.steps.length > 0) {
      setIsRunning(false);
      setTimeout(() => setIsRunning(true), 0);
    }
  }, [completionKey, tour]);

  const ctx: TourCtxValue = useMemo(
    () => ({
      tour,
      availableTours,
      isRunning,
      isMobile,
      start,
      play,
      stop,
      reset,
      refresh,
      controls: tour ? controls : null,
      on: tour ? on : null,
      failures,
      completionKey,
    }),
    [tour, availableTours, isRunning, isMobile, start, play, stop, reset, refresh, controls, on, failures, completionKey],
  );

  return (
    <TourCtx.Provider value={ctx}>
      {children}
      {Tour}
    </TourCtx.Provider>
  );
}

function useTour(): TourCtxValue {
  const ctx = useContext(TourCtx);
  if (!ctx) throw new Error('useTour must be used within a TourProvider');
  return ctx;
}

/**
 * Call this at the top of any view component whose render tree contains a
 * registered tour's anchors. It tells the TourProvider to re-resolve the
 * active tour after mount — which is how sub-state tours swap cleanly
 * (e.g. Generate click takes the user from idle to outline on '/').
 */
function useTourRefreshOnMount(): void {
  const { refresh } = useTour();
  useEffect(() => { refresh(); }, [refresh]);
}

export { TourProvider, useTour, useTourRefreshOnMount };
export type {
  TourProviderProps,
  TourCtxValue,
  PositioningStabilityProps,
  MobileOverrideProps,
};
