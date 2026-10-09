// @ts-check
// The Astro integration: a site's content in src/content, shown by one of two shells.
//
//   clean  the site as it is, with the crew walking on the window's frame
//   room   the same pages, played inside a little room: the pages on a monitor, a tuner for
//          the navigation, a painted room per section, a lobby with signs for the sections
//
// It brings the pages (injected routes), the layouts and styles, mdx, the sitemap and code
// highlighting; the site brings its words (src/content) and its settings (the options).
import { cpSync, createReadStream, statSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, extname, join, normalize, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import mdx from '@astrojs/mdx';
import sitemap from '@astrojs/sitemap';
import expressiveCode from 'astro-expressive-code';

/** @typedef {import('./src/types').Options} Options */
/** @typedef {import('./src/types').Config} Config */

/** @type {Config['stations']} */
const STATIONS = [
  { key: 'home', label: 'Home', href: '/', room: null, dress: 'home' },
  { key: 'blog', label: 'Blog', href: '/blog', room: 'jungle', dress: 'creatures/birds' },
  { key: 'projects', label: 'Projects', href: '/projects', room: 'lab', dress: 'work' },
  { key: 'about', label: 'About', href: '/about', room: 'office', dress: 'about' },
  { key: 'contact', label: 'Contact', href: '/contact', room: null, dress: 'contact' },
];

/** @type {Config['lobby']} */
const LOBBY = [
  { name: 'owl', to: 'clean', at: 0.17, narrow: 0.3, hover: [0.36, 0.3] },
  { name: 'squirrel', to: 'blog', at: 0.39, narrow: 0.27, on: 'crate' },
  { name: 'bolt', to: 'projects', at: 0.61, narrow: 0.72, hover: [0.56, 0.5] },
  { name: 'gardener', to: 'about', at: 0.83, narrow: 0.75 },
];

/** The site's pages, from src/routes, and the room's content for its monitor. */
const ROUTES = [
  ['/', 'index.astro'],
  ['/about', 'about.astro'],
  ['/contact', 'contact.astro'],
  ['/blog', 'blog/index.astro'],
  ['/blog/[...slug]', 'blog/[...slug].astro'],
  ['/projects', 'projects/index.astro'],
  ['/projects/[...slug]', 'projects/[...slug].astro'],
  ['/rss.xml', 'rss.xml.js'],
  ['/404', '404.astro'],
];

const here = dirname(fileURLToPath(import.meta.url));
const require = createRequire(import.meta.url);
/** The crew's models, textures and rooms' pictures, in the installed creatures package. */
const models = join(dirname(require.resolve('@wisdomousai/creatures/package.json')), 'models');
/** The monitor and the phone. */
const devices = join(here, 'assets', 'devices');

/**
 * @param {Options} [options]
 * @returns {import('astro').AstroIntegration}
 */
export default function creatures(options = {}) {
  const shell = options.shell ?? 'clean';
  const room = shell === 'room';
  /** @type {Config} */
  const config = {
    shell,
    title: options.title ?? 'Lorem Ipsum',
    description: options.description ?? 'Lorem ipsum dolor sit amet, consectetur adipiscing elit.',
    author: options.author ?? 'Lorem Ipsum',
    email: options.email ?? 'hello@example.com',
    links: options.links ?? {},
    nav: options.nav ?? [
      { label: 'Blog', href: '/blog' },
      { label: 'Projects', href: '/projects' },
      { label: 'About', href: '/about' },
      { label: 'Contact', href: '/contact' },
    ],
    crew: {
      roster: ['bolt', 'dog', 'cat', 'corgi', 'hedgehog', 'owl'],
      first: 'bolt',
      max: 2,
      every: [10, 25],
      respectReducedMotion: true,
      // The room paints its pictures on a canvas, which a browser won't read back with
      // another site's picture on it: it serves the crew from the site itself (below).
      models: room ? '/creatures/' : '',
      ...options.crew,
    },
    stations: options.stations ?? STATIONS,
    lobby: options.lobby ?? LOBBY,
    labels: { clean: 'Page', room: 'Room', ...options.labels },
  };

  /** The files served from the site itself: [address under the base, folder]. */
  const served = /** @type {[string, string, (from: string) => boolean][]} */ ([]);
  if (config.crew.models === '/creatures/')
    // (The portraits are for the creatures' own playground.)
    served.push(['creatures/', models, (from) => from !== join(models, 'thumbs')]);
  if (room) served.push(['devices/', devices, () => true]);
  let base = '/';

  return {
    name: '@wisdomousai/astro-creatures',
    hooks: {
      'astro:config:setup': ({ config: astro, updateConfig, injectRoute }) => {
        const has = (/** @type {string} */ name) => astro.integrations.some((i) => i.name === name);
        updateConfig({
          integrations: [
            // Before mdx, so code in .mdx is highlighted too; a light theme and a dark one,
            // following prefers-color-scheme like the colours in global.css.
            ...(has('astro-expressive-code')
              ? []
              : [
                  expressiveCode({
                    themes: ['github-light', 'github-dark'],
                    styleOverrides: {
                      borderRadius: '4px',
                      codeFontFamily: 'var(--font-mono)',
                      codeFontSize: '0.85rem',
                      uiFontFamily: 'var(--font-sans)',
                    },
                  }),
                ]),
            ...(has('@astrojs/mdx') ? [] : [mdx()]),
            ...(has('@astrojs/sitemap') ? [] : [sitemap()]),
          ],
          vite: { plugins: [settings(config)] },
        });
        for (const [pattern, file] of ROUTES)
          injectRoute({ pattern, entrypoint: join(here, 'src', 'routes', file) });
        if (room)
          injectRoute({
            pattern: '/box.json',
            entrypoint: join(here, 'src', 'routes', 'box.json.ts'),
          });
      },
      'astro:config:done': ({ config: astro }) => {
        base = astro.base.replace(/\/?$/, '/');
      },
      'astro:server:setup': ({ server }) => {
        for (const [at, folder] of served)
          server.middlewares.use((req, res, next) => {
            const prefix = base + at;
            const path = decodeURIComponent((req.url ?? '').split('?')[0]);
            if (!path.startsWith(prefix)) return next();
            const file = normalize(join(folder, path.slice(prefix.length)));
            if (!file.startsWith(folder + sep)) return next();
            let size;
            try {
              const stat = statSync(file);
              if (!stat.isFile()) return next();
              size = stat.size;
            } catch {
              return next();
            }
            res.setHeader('Content-Type', TYPES[extname(file)] ?? 'application/octet-stream');
            res.setHeader('Content-Length', size);
            createReadStream(file).pipe(res);
          });
      },
      'astro:build:done': ({ dir, logger }) => {
        for (const [at, folder, filter] of served) {
          cpSync(folder, join(fileURLToPath(dir), at), { recursive: true, filter });
          logger.info(`${at} copied from ${folder}`);
        }
      },
    },
  };
}

const TYPES = /** @type {Record<string, string>} */ ({
  '.glb': 'model/gltf-binary',
  '.webp': 'image/webp',
  '.png': 'image/png',
  '.json': 'application/json',
});

/**
 * The settings, for the pages and the room alike: `virtual:astro-creatures/config`.
 * @param {Config} config
 * @returns {import('vite').Plugin}
 */
function settings(config) {
  const id = 'virtual:astro-creatures/config';
  return {
    name: 'astro-creatures-config',
    resolveId: (source) => (source === id ? `\0${id}` : undefined),
    load: (source) =>
      source === `\0${id}` ? `export default ${JSON.stringify(config)};` : undefined,
  };
}
