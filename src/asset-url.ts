import { createHash } from 'crypto';
import { existsSync, readdirSync, readFileSync } from 'fs';
import { join } from 'path';

/**
 * Content hashes of the stylesheet and the app's own scripts, keyed by URL path.
 *
 * A service worker answers a precached URL from its cache, so an unversioned
 * /bundle.css after an upgrade is the previous release's stylesheet until the
 * new worker takes over. A URL that changes with the bytes cannot be answered
 * by an older precache. The hash is workbox's revision for the same file (an
 * md5 of its bytes), which workbox-config.js puts into the precached URL, so
 * the new worker's precache holds exactly the URLs the pages ask for.
 */
export function assetRevisions(publicDir: string): Map<string, string> {
  const files = ['bundle.css'];
  const jsDir = join(publicDir, 'js');
  if (existsSync(jsDir)) {
    for (const name of readdirSync(jsDir).sort()) {
      if (name.endsWith('.js')) files.push(`js/${name}`);
    }
  }
  const revisions = new Map<string, string>();
  for (const file of files) {
    const path = join(publicDir, file);
    // Not built yet (a unit spec, or the dev server before Tailwind's first
    // pass): the bare URL still works, it just is not versioned.
    if (!existsSync(path)) continue;
    const md5 = createHash('md5').update(readFileSync(path)).digest('hex');
    revisions.set(`/${file}`, md5);
  }
  return revisions;
}

/** The path with its revision, or as it is when the file has none. */
export function assetUrl(revisions: Map<string, string>, path: string): string {
  const revision = revisions.get(path);
  return revision ? `${path}?v=${revision}` : path;
}

/**
 * The page's import map. Module imports name /js/ files bare, in templates and
 * inside the files themselves, so this is what versions them; a `src` is not
 * mapped and takes assetUrl instead.
 */
export function importMap(revisions: Map<string, string>) {
  const imports: Record<string, string> = {
    'onnxruntime-web': '/modules/onnxruntime-web/dist/ort.all.bundle.min.mjs',
    'onnxruntime-web/webgpu':
      '/modules/onnxruntime-web/dist/ort.webgpu.bundle.min.mjs',
  };
  for (const path of revisions.keys()) {
    if (path.startsWith('/js/')) imports[path] = assetUrl(revisions, path);
  }
  return { imports };
}
