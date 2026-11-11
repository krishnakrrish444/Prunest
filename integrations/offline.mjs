// Writes dist/sw.js after each build: a service worker that keeps a copy of
// every page and asset so the calculators open without a connection.
// The cache name is a hash of the built files, so each deploy replaces the
// old copy instead of serving stale pages.
import { createHash } from 'node:crypto';
import { readdir, readFile, writeFile } from 'node:fs/promises';
import { join, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const SKIP = new Set(['_headers', '_redirects', 'sw.js', 'ads.txt', 'robots.txt', 'sitemap.xml']);

async function walk(dir) {
  const out = [];
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) out.push(...(await walk(full)));
    else out.push(full);
  }
  return out;
}

/** Turn a built file into the URL visitors use: about.html -> /about, index.html -> /. */
function urlFor(rel) {
  const path = '/' + rel.split(sep).join('/');
  if (path === '/index.html') return '/';
  if (path.endsWith('.html')) return path.slice(0, -5);
  return path;
}

export default function offline() {
  return {
    name: 'prunest-offline',
    hooks: {
      'astro:build:done': async ({ dir, logger }) => {
        const root = fileURLToPath(dir);
        const files = (await walk(root)).sort();
        const hash = createHash('sha256');
        const urls = [];
        for (const file of files) {
          const rel = relative(root, file);
          // Social preview images are for other sites, not for visitors.
          if (SKIP.has(rel) || rel.endsWith('.woff') || rel.startsWith('.') || /^og(-[a-z]+)?\.png$/.test(rel)) continue;
          // woff2 is all current browsers need; the older woff copies are skipped to keep the download small.
          urls.push(urlFor(rel));
          hash.update(rel).update(await readFile(file));
        }
        const version = hash.digest('hex').slice(0, 12);
        const template = await readFile(new URL('./sw-template.js', import.meta.url), 'utf8');
        const sw = template.replace('__VERSION__', version).replace('__PRECACHE__', JSON.stringify(urls, null, 2));
        await writeFile(join(root, 'sw.js'), sw);
        logger.info(`sw.js: ${urls.length} files, version ${version}`);
      },
    },
  };
}
