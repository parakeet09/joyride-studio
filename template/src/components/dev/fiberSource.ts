// Walks the React fiber tree and DOM parent chain to find the JSX source
// location for any clicked element.
//
// React 18 and below: source info is on fiber._debugSource (set by
// @babel/plugin-transform-react-jsx-source via jsxDEV).
//
// React 19: _debugSource was removed entirely. Instead, React 19 sets
// fiber._debugStack — an Error object created at the jsxDEV call site.
// The file path and line number are embedded in error.stack as a normal
// JS stack frame. In Vite dev mode, .tsx files are served at their real
// paths (e.g. http://localhost:5173/src/components/Button.tsx), so stack
// frames reference actual source locations with no source-map indirection.
//
// The DOM parent walk is required regardless of React version: the clicked
// element's own fiber may not carry source info (e.g. a deeply-nested host
// element), but an ancestor's fiber will.

export interface SourceInfo {
  fileName: string;
  lineNumber: number;
  columnNumber: number;
}

interface ReactFiberNode {
  _debugSource?: SourceInfo;   // React ≤ 18
  _debugStack?: Error | null;  // React 19+
  return?: ReactFiberNode | null;
}

function getFiberFromNode(node: Element): ReactFiberNode | null {
  // Use getOwnPropertyNames to catch non-enumerable properties.
  // Support both React 16+ (__reactFiber$) and legacy (__reactInternalInstance$).
  const key = Object.getOwnPropertyNames(node).find(
    k => k.startsWith('__reactFiber$') || k.startsWith('__reactInternalInstance$'),
  );
  return key ? ((node as unknown as Record<string, ReactFiberNode>)[key] ?? null) : null;
}

function parseDebugStack(err: Error | null | undefined): SourceInfo | null {
  if (!err) return null;
  const stack = typeof err === 'string' ? err : err.stack;
  if (!stack) return null;

  for (const line of stack.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed.startsWith('at ')) continue;
    // Skip React internals and anything bundled from node_modules
    if (/node_modules[/\\]/.test(trimmed)) continue;
    if (/\/@react-refresh\b/.test(trimmed)) continue;

    // Match "(URL:line:col)" at end of frame
    // Vite dev serves .tsx files directly, so URL == source file path
    const m = /\((.+\.[jt]sx?):(\d+):(\d+)\)$/.exec(trimmed);
    if (m) {
      // Strip "http://localhost:PORT/" → "src/components/Button.tsx"
      const fileName = m[1].replace(/^https?:\/\/[^/]+\//, '');
      return { fileName, lineNumber: +m[2], columnNumber: +m[3] };
    }
  }
  return null;
}

export function findSource(node: Element): SourceInfo | null {
  let current: Element | null = node;

  while (current && current !== document.body) {
    let fiber = getFiberFromNode(current);
    while (fiber) {
      if (fiber._debugSource) return fiber._debugSource;           // React ≤ 18
      const src = parseDebugStack(fiber._debugStack ?? null);
      if (src) return src;                                          // React 19
      fiber = fiber.return ?? null;
    }
    current = current.parentElement;
  }

  return null;
}

/**
 * Returns the full component call chain for a clicked DOM node —
 * innermost first (e.g. box.tsx → button.tsx → PresentationHeader.tsx).
 *
 * Walks the fiber .return chain from the clicked element all the way up,
 * collecting one frame per fiber that has source info. The result lets the
 * /apply-feedback skill pick the right level to edit rather than always
 * landing on the innermost UI primitive.
 *
 * Capped at MAX_FRAMES to avoid sending the entire app tree.
 */
const MAX_FRAMES = 8;

export function findSourceStack(node: Element): SourceInfo[] {
  const frames: SourceInfo[] = [];
  const seen = new Set<string>();

  const push = (src: SourceInfo) => {
    const key = `${src.fileName}:${src.lineNumber}`;
    if (!seen.has(key)) {
      seen.add(key);
      frames.push(src);
    }
  };

  let current: Element | null = node;
  while (current && current !== document.body && frames.length < MAX_FRAMES) {
    let fiber = getFiberFromNode(current);
    while (fiber && frames.length < MAX_FRAMES) {
      if (fiber._debugSource) {
        push(fiber._debugSource);
      } else {
        const src = parseDebugStack(fiber._debugStack ?? null);
        if (src) push(src);
      }
      fiber = fiber.return ?? null;
    }
    current = current.parentElement;
  }

  return frames;
}
