// Tour authoring dev plugin — persists captured tour steps (per screen) to
// <repoRoot>/.tour-flow/screens/<slug>.json and exposes REST endpoints
// consumed by TourStepInspector.
//
// Only active in `vite dev`. No production impact.
//
// Endpoints (all under /__tour-step):
//   GET    /__tour-step                       — list all screen captures
//   GET    /__tour-step/screens/:screenId     — fetch one screen
//   PUT    /__tour-step/screens/:screenId     — create/replace one screen
//   PATCH  /__tour-step/screens/:screenId     — merge updates
//   DELETE /__tour-step/screens/:screenId     — delete one screen capture
//   DELETE /__tour-step                       — clear all captures

import { promises as fs } from 'node:fs';
import path from 'node:path';
import type { Plugin } from 'vite';

interface StackFrame {
  fileName: string;
  lineNumber: number;
  columnNumber: number;
}
interface TourRect { x: number; y: number; w: number; h: number }
interface TourViewport { scrollX: number; scrollY: number; width: number; height: number }
type TourStepMedia =
  | { kind: 'text' }
  | { kind: 'image'; src: string; alt?: string }
  | { kind: 'video'; src: string; poster?: string }
  | { kind: 'iframe'; src: string; title?: string };
interface TourStepEntry {
  id: string;
  order: number;
  targetFrameIndex: number;
  stackTrace: StackFrame[];
  selector: string;
  tag: string;
  classes: string;
  text: string;
  rect: TourRect;
  viewport: TourViewport;
  title: string;
  body: string;
  placement: string;
  behavior: Record<string, unknown>;
  media: TourStepMedia;
  data?: Record<string, unknown>;
  timestamp: number;
}
interface TourScreenCapture {
  screenId: string;
  route: string;
  description: string;
  steps: TourStepEntry[];
  createdAt: number;
  updatedAt: number;
}

interface TourPluginOptions {
  /** Where captures are stored. Default: `<cwd>/.tour-flow`. */
  outDir?: string;
}

function isValidScreenId(id: string): boolean {
  return /^[a-zA-Z0-9_.-]{1,128}$/.test(id);
}

function readBody(req: import('node:http').IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    let data = '';
    req.on('data', (chunk) => (data += String(chunk)));
    req.on('end', () => resolve(data));
    req.on('error', reject);
  });
}

function tourPlugin(options: TourPluginOptions = {}): Plugin {
  const outDir = options.outDir ?? path.resolve(process.cwd(), '.tour-flow');
  const screensDir = path.join(outDir, 'screens');
  const configFile = path.join(outDir, 'config.json');

  const screenPath = (screenId: string) => path.join(screensDir, `${screenId}.json`);

  async function readConfig(): Promise<Record<string, unknown> | null> {
    try {
      const raw = await fs.readFile(configFile, 'utf-8');
      return JSON.parse(raw) as Record<string, unknown>;
    } catch {
      return null;
    }
  }

  async function writeConfig(config: Record<string, unknown>): Promise<void> {
    await fs.mkdir(outDir, { recursive: true });
    await fs.writeFile(configFile, JSON.stringify(config, null, 2) + '\n');
  }

  async function listScreens(): Promise<TourScreenCapture[]> {
    try {
      const files = await fs.readdir(screensDir);
      const results: TourScreenCapture[] = [];
      for (const f of files) {
        if (!f.endsWith('.json')) continue;
        try {
          const raw = await fs.readFile(path.join(screensDir, f), 'utf-8');
          results.push(JSON.parse(raw) as TourScreenCapture);
        } catch {
          // skip unreadable entries
        }
      }
      return results.sort((a, b) => a.screenId.localeCompare(b.screenId));
    } catch {
      return [];
    }
  }

  async function readScreen(screenId: string): Promise<TourScreenCapture | null> {
    try {
      const raw = await fs.readFile(screenPath(screenId), 'utf-8');
      return JSON.parse(raw) as TourScreenCapture;
    } catch {
      return null;
    }
  }

  async function writeScreen(capture: TourScreenCapture): Promise<void> {
    await fs.mkdir(screensDir, { recursive: true });
    await fs.writeFile(screenPath(capture.screenId), JSON.stringify(capture, null, 2) + '\n');
  }

  return {
    name: 'tour-flow',
    apply: 'serve',
    // Defense layer 1: tell Vite at config-resolve time to ignore all paths
    // under outDir in its file watcher. This is the most reliable way — the
    // ignored pattern is applied when chokidar initializes, so it never
    // observes our files to begin with.
    config() {
      return {
        server: {
          watch: {
            ignored: [`${outDir}/**`],
          },
        },
      };
    },
    // Defense layer 2: if something still slips past the ignored pattern
    // (e.g. chokidar path normalization quirks on macOS's atomic-replace
    // writes), short-circuit HMR here. Returning an empty module array tells
    // Vite "no modules need updating for this change" — no reload fires.
    handleHotUpdate(ctx) {
      if (ctx.file.startsWith(outDir)) return [];
      return undefined;
    },
    configureServer(server) {
      // Prevent Vite HMR from reloading the page when the inspector writes
      // its capture/config JSON files. Without this, every step save or
      // settings change triggers a full reload, wiping inspector state.
      //
      // `unwatch` is a no-op if the path isn't currently watched, so it's
      // safe to call before the dir exists. We also catch the 'add' event
      // for newly-created subpaths (e.g. screens/<new>.json) to stop the
      // watcher from attaching as those files are created.
      server.watcher.unwatch(outDir);
      server.watcher.on('add', (file) => {
        if (file.startsWith(outDir)) server.watcher.unwatch(file);
      });

      server.middlewares.use('/__tour-step', async (req, res) => {
        res.setHeader('Access-Control-Allow-Origin', '*');
        res.setHeader('Access-Control-Allow-Methods', 'GET,POST,PUT,PATCH,DELETE,OPTIONS');
        res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

        if (req.method === 'OPTIONS') {
          res.statusCode = 204;
          res.end();
          return;
        }

        const urlPath = (req.url ?? '').split('?')[0];
        const screenMatch = /^\/screens\/([^/]+)\/?$/.exec(urlPath);

        try {
          if (req.method === 'GET' && (urlPath === '' || urlPath === '/')) {
            const screens = await listScreens();
            res.setHeader('Content-Type', 'application/json');
            res.end(JSON.stringify(screens));
            return;
          }

          if (req.method === 'GET' && screenMatch?.[1]) {
            const id = screenMatch[1];
            if (!isValidScreenId(id)) { res.statusCode = 400; res.end('invalid screen id'); return; }
            const capture = await readScreen(id);
            if (!capture) { res.statusCode = 404; res.end('not found'); return; }
            res.setHeader('Content-Type', 'application/json');
            res.end(JSON.stringify(capture));
            return;
          }

          if (req.method === 'PUT' && screenMatch?.[1]) {
            const id = screenMatch[1];
            if (!isValidScreenId(id)) { res.statusCode = 400; res.end('invalid screen id'); return; }
            const body = await readBody(req);
            const partial = JSON.parse(body) as Partial<TourScreenCapture>;
            const now = Date.now();
            const existing = await readScreen(id);
            const capture: TourScreenCapture = {
              screenId: id,
              route: partial.route ?? existing?.route ?? '',
              description: partial.description ?? existing?.description ?? '',
              steps: partial.steps ?? existing?.steps ?? [],
              createdAt: existing?.createdAt ?? now,
              updatedAt: now,
            };
            await writeScreen(capture);
            res.setHeader('Content-Type', 'application/json');
            res.end(JSON.stringify(capture));
            return;
          }

          if (req.method === 'PATCH' && screenMatch?.[1]) {
            const id = screenMatch[1];
            if (!isValidScreenId(id)) { res.statusCode = 400; res.end('invalid screen id'); return; }
            const existing = await readScreen(id);
            if (!existing) { res.statusCode = 404; res.end('not found'); return; }
            const body = await readBody(req);
            const update = JSON.parse(body) as Partial<TourScreenCapture>;
            const merged: TourScreenCapture = {
              ...existing,
              ...update,
              screenId: existing.screenId,
              createdAt: existing.createdAt,
              updatedAt: Date.now(),
            };
            await writeScreen(merged);
            res.setHeader('Content-Type', 'application/json');
            res.end(JSON.stringify(merged));
            return;
          }

          if (req.method === 'DELETE' && screenMatch?.[1]) {
            const id = screenMatch[1];
            if (!isValidScreenId(id)) { res.statusCode = 400; res.end('invalid screen id'); return; }
            try { await fs.unlink(screenPath(id)); res.statusCode = 204; res.end(); }
            catch { res.statusCode = 404; res.end('not found'); }
            return;
          }

          // GET /__tour-step/config — read global config (null if none)
          if (req.method === 'GET' && urlPath === '/config') {
            const config = await readConfig();
            res.setHeader('Content-Type', 'application/json');
            res.end(JSON.stringify(config));
            return;
          }

          // PUT /__tour-step/config — replace global config
          if (req.method === 'PUT' && urlPath === '/config') {
            const body = await readBody(req);
            const next = JSON.parse(body) as Record<string, unknown>;
            await writeConfig(next);
            res.setHeader('Content-Type', 'application/json');
            res.end(JSON.stringify(next));
            return;
          }

          // PATCH /__tour-step/config — merge partial updates
          if (req.method === 'PATCH' && urlPath === '/config') {
            const existing = (await readConfig()) ?? {};
            const body = await readBody(req);
            const patch = JSON.parse(body) as Record<string, unknown>;
            const merged = { ...existing, ...patch };
            await writeConfig(merged);
            res.setHeader('Content-Type', 'application/json');
            res.end(JSON.stringify(merged));
            return;
          }

          if (req.method === 'DELETE' && (urlPath === '' || urlPath === '/')) {
            try {
              const files = await fs.readdir(screensDir);
              await Promise.all(
                files
                  .filter((f) => f.endsWith('.json'))
                  .map((f) => fs.unlink(path.join(screensDir, f)).catch(() => {})),
              );
            } catch { /* dir doesn't exist — nothing to clear */ }
            res.statusCode = 204;
            res.end();
            return;
          }

          res.statusCode = 405;
          res.end();
        } catch (err) {
          res.statusCode = 500;
          res.end(String(err));
        }
      });

      server.config.logger.info(
        `  ➜  tour flow captures: ${path.relative(process.cwd(), screensDir)}`,
      );
    },
  };
}

export { tourPlugin };
export type { TourPluginOptions };
