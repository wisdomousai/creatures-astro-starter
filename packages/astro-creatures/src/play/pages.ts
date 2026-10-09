import { STATIONS } from '../stations';
import { url } from '../site';
import { bodyOf, content } from './content';

/**
 * The site's pages in the room: its lists and cards from /box.json, each page's body read
 * from the page at the same address. Cards pinned on a page lead further in: pull one off
 * and it is the next page.
 *
 * A place is a page's address without its slash: 'blog', 'blog/a-post'. A place the site
 * has no page of its own for is a part of its section's page ('projects#dolor', a project
 * that links out), so the address works on either site.
 */

export { STATIONS };

/** Where a path goes: which station, and the pages pinned on it. */
export interface Route {
  station: number;
  trail: string[];
}

/** An address without the base the site was built for: '/creatures-astro-starter/room/blog' → '/blog'. */
function unbased(path: string) {
  const base = import.meta.env.BASE_URL.replace(/\/$/, '');
  return base && path.startsWith(base) ? path.slice(base.length) || '/' : path;
}

/** Where an address goes in the room, or null if the room has no page for it (the browser
 * goes there instead). */
export function routeOf(address: string): Route | null {
  const [path, hash = ''] = address.split('#');
  const parts = unbased(path)
    .replace(/^\/+|\/+$/g, '')
    .split('/')
    .filter(Boolean);
  if (!parts.length) return { station: 0, trail: [] };
  const i = stationOf(parts[0]);
  if (i < 0 || parts.length > 2) return null;
  if (parts.length === 2) {
    const place = parts.join('/');
    return known(place) ? { station: i, trail: [place] } : null;
  }
  const place = `${parts[0]}#${hash}`;
  return { station: i, trail: hash && known(place) ? [place] : [] };
}

/** Where an address goes, or Home if the room has no page for it. */
export function parse(address: string): Route {
  return routeOf(address) ?? { station: 0, trail: [] };
}

const stationOf = (key: string) => STATIONS.findIndex((s) => s.key === key);

/** The address for a route, under the site's base. */
export function pathOf(route: Route) {
  const last = route.trail[route.trail.length - 1];
  return url(last ? `/${last}` : STATIONS[route.station].href);
}

const known = (place: string) => placesIn(place.split(/[/#]/)[0]).includes(place);

/** The places pinned on a section's page. */
function placesIn(section: string): string[] {
  if (!content) return [];
  if (section === 'blog') return content.posts.map((p) => `blog/${p.slug}`);
  if (section === 'projects') return content.projects.items.map(projectPlace);
  return [];
}

type Project = NonNullable<typeof content>['projects']['items'][number];
type Post = NonNullable<typeof content>['posts'][number];

/** A project with a page of its own is its own place; one that links out is a part of
 * Projects'. */
const projectPlace = (p: Project) => (p.page ? `projects/${p.slug}` : `projects#${p.slug}`);

const postOf = (slug: string) => content?.posts.find((p) => p.slug === slug);
const projectOf = (slug: string) => content?.projects.items.find((p) => p.slug === slug);

/** The title for the tab. */
export function titleOf(place: string) {
  const [section, n] = place.split(/[/#]/);
  const site = content?.title ?? '';
  const named = (title: string) => (title ? `${title} – ${site}` : site);
  if (section === 'blog' && n && postOf(n)) return named(postOf(n)!.title);
  if (section === 'projects' && n && projectOf(n)) return named(projectOf(n)!.title);
  if (place === 'about' && content) return named(content.about.title);
  const s = STATIONS.find((st) => st.key === section);
  return named(s && s.key !== 'home' ? s.label : '');
}

// ---------- Building the pages ----------

/** A little random that is the same every time for the same seed. */
function rng(seed: number) {
  let s = seed * 9301 + 49297;
  return () => {
    s = (s * 9301 + 49297) % 233280;
    return s / 233280;
  };
}

const seed = (place: string) => [...place].reduce((s, c) => s * 31 + c.charCodeAt(0), 7) % 10007;

function el<K extends keyof HTMLElementTagNameMap>(tag: K, cls = '', ...kids: (Node | string)[]) {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  e.append(...kids);
  return e;
}

function link(href: string, text: string, cls = '') {
  const a = el('a', cls, text);
  a.setAttribute('href', href);
  return a;
}

/** A paragraph's worth of grey bars, while the words are read. */
function para(r: () => number, lines = 3 + Math.floor(r() * 3)) {
  const p = el('div', 'para');
  for (let i = 0; i < lines; i++) {
    const bar = el('span', 'bar');
    bar.style.width = i === lines - 1 ? `${35 + r() * 40}%` : `${88 + r() * 12}%`;
    p.appendChild(bar);
  }
  return p;
}

/** A card pinned on the page, leading to `place`; `face` is what's on it. */
function pinned(place: string, seed: number, cls: string, label: string, ...face: Node[]) {
  const r = rng(seed);
  const a = el('a', `card ${cls}`.trim());
  a.href = url(`/${place}`);
  a.dataset.place = place;
  // Pulled with the mouse it comes off the page; it isn't a link being dragged away.
  a.draggable = false;
  const turn = ((r() - 0.5) * 2.6).toFixed(2);
  a.style.setProperty('--turn', `${turn}deg`);
  a.dataset.turn = turn;
  a.append(el('i', 'pin'), ...face);
  a.setAttribute('aria-label', label);
  return a;
}

/** A post's card: its number, its title, its line, and when. */
function postCard(post: Post, seed: number) {
  return pinned(
    `blog/${post.slug}`,
    seed,
    'card-text',
    post.title,
    el('span', 'card-kicker', `No. ${post.number}`),
    el('span', 'card-name', post.title),
    el('span', 'card-line', post.description),
    el('span', 'card-meta', `${post.date}, ${post.minutes} min read`),
  );
}

/** A project's card: its name, its line, and where it is. */
function projectCard(project: Project, seed: number) {
  return pinned(
    projectPlace(project),
    seed,
    'card-text',
    project.title,
    el('span', 'card-name', project.title),
    el('span', 'card-line', project.summary),
    el('span', 'card-meta', project.where),
  );
}

const pile = (...cards: Node[]) => el('div', 'cards', ...cards);

/** A page's head: its title, and its line under it if it has one. */
function top(title: string, lede?: string, kicker?: string) {
  const h = el('header', 'page-head');
  if (kicker) h.append(el('p', 'kicker', kicker));
  const h1 = el('h1', '', title);
  h1.tabIndex = -1;
  h.append(h1);
  if (lede) h.append(el('p', 'lede', lede));
  return h;
}

/** The body of the site's page at `path`: grey bars while it's read. */
function body(path: string, r: () => number) {
  const prose = el('div', 'prose', para(r), para(r), para(r));
  prose.setAttribute('aria-busy', 'true');
  void bodyOf(url(path)).then((nodes) => {
    prose.replaceChildren(...(nodes ?? []));
    prose.removeAttribute('aria-busy');
  });
  return prose;
}

/** The inside of the page for a place. */
export function build(place: string): HTMLElement {
  const [section, n] = place.split(/[/#]/);
  const page = el('article', `page page-${section}${n ? ' page-leaf' : ''}`);
  page.dataset.place = place;
  page.append(...(content ? kids(place, section, n, rng(seed(place))) : []));
  return page;
}

function kids(place: string, section: string, n: string | undefined, r: () => number): Node[] {
  const c = content!;
  const posts = (list: Post[], s: number) => pile(...list.map((p, i) => postCard(p, s + i)));
  const projects = (list: Project[], s: number) =>
    pile(...list.map((p, i) => projectCard(p, s + i)));
  const mail = () => el('p', 'lede', link(`mailto:${c.email}`, c.email, 'mail'));
  if (place === 'home')
    return [
      top(c.title),
      el('h2', '', c.blog.title),
      posts(c.posts.slice(0, 3), 20),
      el('h2', '', c.projects.title),
      projects(c.projects.items.slice(0, 3), 30),
    ];
  if (section === 'blog') {
    const post = n && postOf(n);
    if (!post) return [top(c.blog.title), posts(c.posts, 40)];
    const others = c.posts.filter((p) => p !== post).slice(0, 2);
    return [
      top(post.title, post.description, `No. ${post.number}`),
      el('p', 'meta-line', `${post.date}, ${post.minutes} min read`),
      body(`/blog/${post.slug}`, r),
      ...(others.length ? [el('hr'), posts(others, seed(place))] : []),
    ];
  }
  if (section === 'projects') {
    const project = n && projectOf(n);
    if (!project) return [top(c.projects.title), projects(c.projects.items, 50)];
    if (project.page)
      return [top(project.title, project.summary), body(`/projects/${project.slug}`, r)];
    return [
      top(project.title, project.summary),
      el('p', 'lede', link(project.href, project.where, 'mail')),
    ];
  }
  if (section === 'about') return [top(c.about.title, c.about.description), body('/about', r)];
  if (section === 'contact') return [top(c.contact.title), mail()];
  return [];
}
