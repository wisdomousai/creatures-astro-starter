import '@fontsource-variable/newsreader/opsz.css';
import '@fontsource-variable/schibsted-grotesk';
import './styles';
import { Crew, holdSelection } from '@wisdomousai/creatures';
import type { Character, Column, Frame, LookName, Role } from '@wisdomousai/creatures';
import { depthScale, floorDepth, horizon, project, Spring } from '@wisdomousai/creatures';
import { Monitor, RISE, RISE_MAX, glassRect, headroom } from '../components/robot/monitor';
import { Rail, Sheet, type Flight, type Rect, type View } from '../components/robot/sheets';
import { Dimmer, Rigging, Tuner } from '../components/robot/gear';
import { switchTo } from '../lib/mode';
import { Sharpness } from '../lib/sharpness';
import { site, url } from '../site';
import { LOBBY, MODES } from '../stations';
import { lobby } from './lobby';
import { holder } from './holder';
import { STATIONS, build, parse, pathOf, routeOf, titleOf, type Route } from './pages';

/*
 * The room: a box the crew live in, with an old computer standing at the back of its floor
 * that the pages play on. The sections sit side by side behind its glass and the radio dial
 * on the frame slides them along. Cards pinned on a page come off when you pull them (or
 * click) and are pinned up over it as the next page down, with the top of each page under it
 * still showing, to go back by. The monitor's chin knobs are the dials: the left one turns
 * the lights down to night, the right one the crew's look. The crew wander about in front of
 * it. Each section is in a room of its own (the `stations` option), and the front page is the
 * lobby, where the concierges hold up signs for the places (lobby.ts).
 */

// A press that starts anywhere but the page's own text (the room, the frame, the crew) never
// starts a selection: dragging from there would sweep one over the glass.
addEventListener(
  'pointerdown',
  (e) => {
    const on = e.target instanceof Element ? e.target : null;
    if (e.button === 0 && !on?.closest('.page, input, textarea, select, [contenteditable]'))
      holdSelection();
  },
  true,
);

const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
const root = document.documentElement;
const room = document.querySelector<HTMLElement>('#room')!;
const gearLayer = document.querySelector<HTMLElement>('#gear')!;
/** The front page: the room stays empty, the lobby, where the concierges hold up signs for
 * the places, and the page comes once one's picked. */
const welcoming = parse(location.pathname).station === 0;

/** The room each station is in (painted pictures); null is the plain white box. */
const roomOf = (station: number) => STATIONS[station]?.room ?? null;

// ---------- The crew's size ----------

/** The crew's size (px): at the site's own --bot they'd be specks. On a phone (under 40rem)
 * they're smaller, to leave the glass its room. */
const SIZE = 120;
const PHONE = 90;
/** The site's own --bot: the monitor and the gear keep to it, whatever size the crew are. */
let siteBot = 28;
function applySize() {
  const style = root.style;
  style.removeProperty('--bot');
  siteBot = parseFloat(getComputedStyle(root).getPropertyValue('--bot')) || 28;
  style.setProperty('--bot', `${matchMedia('(min-width: 40rem)').matches ? SIZE : PHONE}px`);
  window.dispatchEvent(new Event('resize'));
}
applySize();
for (const w of ['40rem', '60rem'])
  matchMedia(`(min-width: ${w})`).addEventListener('change', applySize);

/** The monitor's px per metre on the front of the box. */
const unit = () => siteBot * 5.2;
/** How far back in the box the monitor stands: at the back, its seat just clear of the
 * back wall, so the crew go about in front (and nothing goes behind it: crew.back). */
const DEPTH = 0.88;

/** Narrower than this (px), the room's a phone's: the pages play on a phone (not the
 * monitor), held up by Bolt. */
const NARROW = 720;
const narrow = (f: Frame) => f.right - f.left < NARROW;
/** Starting out narrow: there are no dials then (a phone has no knobs), so the room is in
 * the light and in colour, and what the visitor set on a bigger screen is kept for that. */
const phone = innerWidth < NARROW;
/** How high his raised hands are, of his height: the phone's case rests on them. */
const HANDS = 0.92;
/** How high Bolt holds the phone (m on the box's scale, from the floor under it): he stands
 * as far back as he can get, just in front of it, and the bottom of its case is on his
 * hands. */
function hold(f: Frame) {
  const b = crew.members.get('bolt');
  const deep = floorDepth(f);
  const at = b ? Math.max(0.2, DEPTH - b.footprint(f).z / deep) : DEPTH - 0.15;
  const cx = (f.left + f.right) / 2;
  const feet = project(f, at, { x: cx, y: f.bottom }).y;
  const hands = feet - HANDS * (b?.spec.size ?? 1.45) * f.bot * depthScale(f, at);
  const floor = project(f, DEPTH, { x: cx, y: f.bottom }).y;
  return Math.max(0, (floor - hands) / (unit() * depthScale(f, DEPTH)));
}

// ---------- The crew ----------

const { roster, max, every, models } = site.crew;
const crew: Crew = new Crew({
  canvas: document.querySelector<HTMLCanvasElement>('#crew')!,
  hits: document.querySelector<HTMLElement>('#hits')!,
  models: url(models),
  // In the lobby only the concierges: anyone sent for is there already.
  roster: welcoming ? LOBBY.map((c) => c.name) : roster,
  every: welcoming ? [1e9, 1e9] : every,
  // (On a phone too: one of them is Bolt, holding it up. In the lobby, the concierges.)
  max: welcoming ? LOBBY.length : max + 1,
  clear: () => column(),
  behind: (c) => behind(c),
  tick: (dt, f) => tick(dt, f),
});
// The box's drawing goes in just before the crew's canvas: the pages show between.
crew.box?.el.after(room);
const scene = crew.stage.scene;
/** Drawn no sharper than the window's worth of pixels allows, and less while it's slow. */
const sharpness = new Sharpness(crew);

const monitor = new Monitor(scene, url('/devices/'), phone ? 'phone' : 'monitor');
monitor.depth = DEPTH;
crew.back = DEPTH;
// The lobby is empty: the monitor isn't fitted there (so never shown), and nobody walks
// round it or lands on it.
if (!welcoming) {
  void monitor.ready.then(() => crew.add(monitor));
  crew.obstacles.push(monitor.body);
}
/** Bolt, holding up the phone (holder.ts), just in front of it. */
const holding = holder(crew, DEPTH - 0.02, () => null);
/** The monitor's seat is in the crew's way; a phone has none (Bolt holding it is crew). */
function seated(on: boolean) {
  const i = crew.obstacles.indexOf(monitor.body);
  if (on && i < 0 && !welcoming) crew.obstacles.push(monitor.body);
  else if (!on && i >= 0) crew.obstacles.splice(i, 1);
}
// A flier let go over the monitor comes down on top of it.
crew.tops.push((f) => {
  const o = monitor.outer;
  if (welcoming || monitor.depth !== DEPTH || !(o.w > 0)) return null;
  const depth = monitor.depth - 0.03;
  const k = depthScale(f, depth);
  const vx = (f.left + f.right) / 2;
  const floor = project(f, depth, { x: vx, y: f.bottom }).y;
  const corner = siteBot * 0.6;
  return {
    key: monitor,
    s0: vx + (o.x + corner - vx) / k,
    s1: vx + (o.x + o.w - corner - vx) / k,
    depth,
    h: (floor - o.y) / k,
  };
});
if (crew.set)
  crew.set.clear = () => ({
    x: [monitor.outer.x, monitor.outer.x + monitor.outer.w],
    glass: monitor.glass.y + monitor.glass.h,
    under: monitor.under,
    depth: monitor.depth,
    base: monitor.base,
  });

/** The monitor in the viewport, which the ceiling decorations keep clear of. */
function column(): Column {
  const o = monitor.outer;
  return { left: o.x, right: o.x + o.w, top: o.y };
}

/** Is this crewmate out of sight behind the monitor? Then clicks go through it. */
function behind(c: Character) {
  const e = c.eyePoint(crew.frame);
  return monitor.hides(e.x, e.y, c.depth);
}

// ---------- The glass ----------

/** The tuner's bottom edge (the glass stays under it), and the window's foot. */
let tunerBottom = 0;
let floorTop = 0;

/** How high the monitor's seat reaches (m), as fitted last. */
let rise = RISE;

/** How much of the room the glass takes on a wide screen, at most: of its width, and of its
 * height. The rest is the room's (its pictures) and the crew's. Its shape: 16:10. */
const WIDE = 0.62;
const TALL = 0.58;
const ASPECT = 16 / 10;

/** Where the glass is in the viewport: under the tuner, 16:10 on a wide screen, and no more
 * than WIDE of the room across or TALL of it up; it sits on its seat, raised as far as the
 * seat goes to keep it up under the tuner. On a phone it's a phone's, as big as the room
 * allows: the width less a thin bezel, from under the tuner down to Bolt's raised hands. */
function glassOf(f: Frame): Rect {
  const W = f.right - f.left;
  if (narrow(f)) {
    const bezel = 0.06 * unit() * depthScale(f, DEPTH);
    const top = Math.max(
      f.top + siteBot * 0.3 + headroom(f, DEPTH, unit(), 'phone'),
      tunerBottom + headroom(f, DEPTH, unit(), 'phone') + siteBot * 0.2,
    );
    rise = hold(f);
    return glassRect(
      f,
      DEPTH,
      top,
      W - 2 * (bezel + Math.max(siteBot * 0.3, 6)),
      unit(),
      rise,
      'phone',
    );
  }
  const side = siteBot * 3.6;
  const bezel = 0.12 * unit() * depthScale(f, DEPTH);
  const top = Math.max(
    f.top + siteBot * 0.3 + headroom(f, DEPTH, unit()),
    tunerBottom + bezel + siteBot * 0.25,
  );
  rise = RISE;
  const g = glassRect(f, DEPTH, top, W - side * 2, unit(), rise);
  const w = Math.min(g.w, W * WIDE, Math.min(g.h, (f.bottom - f.top) * TALL) * ASPECT);
  const h = w / ASPECT;
  const S = unit() * depthScale(f, DEPTH);
  const lift = Math.max(0, Math.min(g.h - h, (RISE_MAX - RISE) * S));
  rise += lift / S;
  return { x: g.x + (g.w - w) / 2, y: g.y + g.h - h - lift, w, h };
}

/** A rect in the viewport, as a rect on the front of the box that `depth` puts there. */
function toFront(r: Rect, f: Frame, depth = DEPTH): Rect {
  const k = depthScale(f, depth);
  const vx = (f.left + f.right) / 2;
  const vy = horizon(f);
  return { x: vx + (r.x - vx) / k, y: vy + (r.y - vy) / k, w: r.w / k, h: r.h / k };
}

/** Where a page pinned `level` deep hangs: a little lower each time, so the top of each
 * page under it shows (its title, to go back by), and a little narrower. */
function pinnedRect(base: Rect, level: number, f: Frame): Rect {
  const strip = narrow(f) ? 36 : 44;
  const inset = siteBot * 0.3 * level;
  return {
    x: base.x + inset,
    y: base.y + strip * level,
    w: base.w - inset * 2,
    h: base.h - strip * level,
  };
}

// A sheen over the glass, over whatever page is on it.
const sheen = document.createElement('div');
sheen.className = 'sheen';
sheen.setAttribute('aria-hidden', 'true');
room.appendChild(sheen);

let glassKey = '';
/** Cut the pages to the glass, and lay the sheen on it. */
function cutToGlass(g: Rect, radius: number) {
  const n = (v: number) => Math.round(v * 10) / 10;
  const key = [g.x, g.y, g.w, g.h, radius].map(n).join();
  if (key === glassKey) return;
  glassKey = key;
  const [t, l] = [n(g.y), n(g.x)];
  const [r, b] = [n(innerWidth - g.x - g.w), n(innerHeight - g.y - g.h)];
  room.style.clipPath = `inset(${t}px ${r}px ${b}px ${l}px round ${n(radius)}px)`;
  Object.assign(sheen.style, {
    left: `${l}px`,
    top: `${t}px`,
    width: `${n(g.w)}px`,
    height: `${n(g.h)}px`,
    borderRadius: `${n(radius)}px`,
  });
}

// ---------- Focus ----------

/** Focused, the page fills the window under the tuner, over the room and the crew (for
 * reading), on whatever screen: a button at the glass's top right corner, pressed or not.
 * Remembered in this browser. Never in the lobby. */
let focused = (() => {
  try {
    return localStorage.getItem('focus') === '1';
  } catch {
    return false;
  }
})();
const focusing = new Spring(2.2, 1, 0, focused ? 1 : 0);
const focusButton = document.createElement('button');
focusButton.type = 'button';
focusButton.className = 'focus';
focusButton.setAttribute('aria-label', 'Focus');
focusButton.innerHTML =
  '<svg viewBox="0 0 24 24" aria-hidden="true"><path class="out" d="M4 9V4h5M15 4h5v5M20 15v5h-5M9 20H4v-5"/><path class="in" d="M9 4v5H4M20 9h-5V4M15 20v-5h5M4 15h5v5"/></svg>';
gearLayer.appendChild(focusButton);
function setFocus(on: boolean) {
  focused = on;
  focusButton.setAttribute('aria-pressed', String(on));
  try {
    if (on) localStorage.setItem('focus', '1');
    else localStorage.removeItem('focus');
  } catch {
    /* no storage: it just won't be remembered */
  }
}
setFocus(focused);
focusButton.addEventListener('click', () => setFocus(!focused));

/** The window under the tuner, inside the frame: the focused page's. */
function focusRect(f: Frame): Rect {
  const y = tunerBottom + siteBot * 0.2;
  return { x: f.left + 2, y, w: f.right - f.left - 4, h: floorTop - siteBot * 0.2 - y };
}

/** How far focused (0..1, eased), and the glass that makes: from the room's to the
 * window's. Lifts the page over the crew while it's any way focused. */
function focus(dt: number, f: Frame, roomGlass: Rect): [Rect, number] {
  const allowed = !welcoming && holding.settled;
  const k = ease(clamp(focusing.update(dt, focused && allowed ? 1 : 0), 0, 1));
  const lifted = k > 0.001 || (focused && allowed);
  if (lifted !== root.hasAttribute('data-focus')) root.toggleAttribute('data-focus', lifted);
  focusButton.hidden = !allowed;
  if (k <= 0.001) return [roomGlass, 0];
  const to = focusRect(f);
  const mix = (a: number, b: number) => a + (b - a) * k;
  return [
    {
      x: mix(roomGlass.x, to.x),
      y: mix(roomGlass.y, to.y),
      w: mix(roomGlass.w, to.w),
      h: mix(roomGlass.h, to.h),
    },
    k,
  ];
}

/** The focus button in the glass's top right corner. */
function layFocus(glass: Rect) {
  if (focusButton.hidden) return;
  const size = focusButton.offsetWidth || 40;
  const inset = Math.max(6, siteBot * 0.25);
  focusButton.style.transform = `translate(${(glass.x + glass.w - size - inset).toFixed(1)}px, ${(glass.y + inset).toFixed(1)}px)`;
}

// ---------- The pages ----------

const rail = new Rail(
  STATIONS.map((s) => {
    const sheet = new Sheet(scene, 'screen', build(s.key));
    sheet.el.style.zIndex = '1';
    room.appendChild(sheet.el);
    return sheet;
  }),
  DEPTH,
);
rail.swings = false;
rail.sheets.forEach((s, i) => watchCards(s, i, () => 0));

/** A page pinned over another. */
interface Pinned {
  place: string;
  sheet: Sheet;
  /** How deep it is pinned (1: straight on the section's page). */
  level: number;
  /** The card on the page under it that it came off, and where that was when it did. */
  card: HTMLElement | null;
  from: Spot | null;
  pin: HTMLButtonElement;
  /** 0: still the card; 1: up as a page. */
  t: number;
  going: 1 | -1;
  /** The card's face over the page while it flies. */
  cover: HTMLElement | null;
}

/** Where a card is in the viewport: its middle, its size and its turn. */
interface Spot {
  x: number;
  y: number;
  w: number;
  h: number;
  turn: number;
}

const piles: Pinned[][] = STATIONS.map(() => []);

/** The station the reader is on (the rail may be anywhere while the dial is turned). */
let here = 0;

/** Where things are now, as a route. */
function current(): Route {
  return { station: here, trail: piles[here].filter((p) => p.going > 0).map((p) => p.place) };
}

/** Go somewhere: slide the rail, pin pages up or take them down. */
function go(route: Route, how: 'push' | 'replace' | 'none' = 'push', animate = true) {
  // The lobby isn't a page: nothing moves until a sign's picked.
  if (welcoming && how !== 'replace') return;
  // Home is the lobby: the concierges come out again (back to it, it takes the place of the
  // page it's back from).
  if (how !== 'replace' && route.station === 0 && !route.trail.length) {
    if (how === 'push') location.assign(url('/'));
    else location.replace(url('/'));
    return;
  }
  const now = current();
  if (route.station !== now.station || !animate) {
    here = route.station;
    rail.to = route.station;
    if (!animate || reduce) rail.jump(route.station);
    else {
      crew.watch(() => rail.sheets[route.station].centre, 1.6);
      haul(Math.sign(route.station - now.station), route.station);
      monitor.busyFor(0.7);
    }
  }
  const live = piles[route.station].filter((p) => p.going > 0);
  let keep = 0;
  while (keep < live.length && keep < route.trail.length && live[keep].place === route.trail[keep])
    keep++;
  for (let j = live.length - 1; j >= keep; j--) unpin(live[j]);
  for (let j = keep; j < route.trail.length; j++)
    pin(route.station, route.trail[j], animate && j === route.trail.length - 1 ? null : false);
  restage();
  tuner.mark(route.station);
  document.title = titleOf(route.trail[route.trail.length - 1] ?? STATIONS[route.station].key);
  if (how === 'push') history.pushState(route, '', address(route));
  else if (how === 'replace') history.replaceState(route, '', address(route));
}

/** An address for a route, keeping the query (a part of a page keeps its #). */
const address = (route: Route) => {
  const [path, part] = pathOf(route).split('#');
  return `${path}${location.search}${part ? `#${part}` : ''}`;
};

/** The page a new one at `level` on this station would be pinned on. */
function under(station: number, level: number) {
  if (level <= 1) return rail.sheets[station];
  const live = piles[station].filter((p) => p.going > 0);
  return live[level - 2]?.sheet ?? rail.sheets[station];
}

/**
 * The rail slides: one or two of those about on the floor run after the page the way it
 * goes (as if they were pushing it along), watching the new one come in, and give a
 * little hop when it's there.
 */
const hauling = new Set<Character>();
function haul(dir: number, station: number) {
  if (!dir || crew.play?.playing) return;
  const f = crew.frame;
  const free = [...crew.members.values()].filter(
    (c) =>
      c.state === 'here' &&
      c.edge === 'bottom' &&
      !c.free &&
      !c.role &&
      !c.door &&
      !hauling.has(c) &&
      (c.spec.speed ?? 1) > 0.4,
  );
  const sheet = rail.sheets[station];
  // Those nearest the side the page comes in from, first.
  free.sort((a, b) => dir * (b.s - a.s));
  for (const c of free.slice(0, Math.random() < 0.5 ? 1 : 2)) {
    hauling.add(c);
    const role: Role = { hurry: 2.4, face: 'happy', look: () => sheet.centre };
    c.direct(role);
    const run = (f.right - f.left) * (0.22 + Math.random() * 0.12);
    c.walkTo(c.s - dir * run, clamp(c.depth, 0.1, 0.4));
    setTimeout(() => {
      if (c.role === role) c.hopUp(0.25);
    }, 1100);
    setTimeout(() => {
      if (c.role === role) c.release();
      hauling.delete(c);
    }, 2000);
  }
}

/**
 * Pin the page for `place` up over the top page on `station`. `from` is where its card
 * was pulled to (null: where the card is; false: no flight, it is just there).
 */
function pin(station: number, place: string, from: Spot | null | false) {
  const pile = piles[station];
  const level = pile.filter((p) => p.going > 0).length + 1;
  const below = under(station, level);
  const card = below.paper.querySelector<HTMLElement>(`a.card[data-place="${CSS.escape(place)}"]`);
  const trail = pile.filter((q) => q.going > 0).map((q) => q.place);
  const back = level === 1 ? STATIONS[station].label : label(trail[trail.length - 1] ?? '');
  const goBack = () => {
    const r = current();
    go({ ...r, trail: r.trail.slice(0, level - 1) });
  };
  // The way back by name at the top of the page; the pin through it does the same.
  const page = build(place);
  const up = document.createElement('a');
  up.className = 'back';
  up.href = pathOf({ station, trail });
  up.textContent = `← ${back}`;
  up.setAttribute('aria-label', `Back to ${back}`);
  up.addEventListener('click', (e) => {
    if (e.metaKey || e.ctrlKey || e.shiftKey || e.button !== 0) return;
    e.preventDefault();
    goBack();
  });
  page.prepend(up);
  const sheet = new Sheet(scene, 'pin', page, false);
  sheet.el.style.zIndex = String(10 + level);
  room.appendChild(sheet.el);
  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'pushpin';
  button.setAttribute('aria-label', `Back to ${back}`);
  button.title = `Back to ${back}`;
  button.addEventListener('click', goBack);
  sheet.fixtures.appendChild(button);
  watchCards(sheet, station, () => p.level);
  const flies = from !== false && !reduce && !!card;
  const p: Pinned = {
    place,
    sheet,
    level,
    card,
    from: from || null,
    pin: button,
    t: flies ? 0 : 1,
    going: 1,
    cover: null,
  };
  card?.classList.add('off');
  if (flies && card) {
    p.from ??= spotOf(card, below);
    p.cover = coverOf(card);
    sheet.paper.appendChild(p.cover);
    // The page under it goes back to its top, so its title shows above the new one.
    below.paper.scrollTo({ top: 0, behavior: 'smooth' });
    monitor.busyFor(0.6);
  } else button.classList.add('in');
  pile.push(p);
  crew.watch(() => sheet.centre, 1.6);
  return p;
}

/** A place's name, for the way back to it: the page's title without the site's. */
const label = (place: string) => titleOf(place).split(' – ')[0];

/** Take a pinned page down: its pin comes out and it flies back onto its card. */
function unpin(p: Pinned) {
  if (p.going < 0) return;
  p.going = -1;
  p.from = null;
  p.pin.classList.remove('in');
  p.pin.classList.add('out');
  if (reduce) p.t = 0;
  if (p.card && !p.cover && !reduce) {
    p.card.scrollIntoView({ block: 'nearest' });
    p.sheet.paper.scrollTop = 0;
    p.cover = coverOf(p.card);
    p.sheet.paper.appendChild(p.cover);
  }
  crew.watch(() => p.sheet.centre, 1.2);
}

/** A copy of a card's face, to lay over the page while it flies. */
function coverOf(card: HTMLElement) {
  const c = card.cloneNode(true) as HTMLElement;
  c.classList.remove('off', 'pulling', 'back');
  c.classList.add('cover');
  c.removeAttribute('href');
  c.removeAttribute('aria-label');
  c.setAttribute('aria-hidden', 'true');
  c.style.setProperty('--turn', '0deg');
  c.style.translate = '';
  c.style.width = `${card.offsetWidth}px`;
  c.style.height = `${card.offsetHeight}px`;
  return c;
}

/** Where a card on a page is in the viewport now. */
function spotOf(card: HTMLElement, on: Sheet): Spot {
  const r = card.getBoundingClientRect();
  const f = crew.frame;
  const k = depthScale(f, on.depth) * (on.flight?.scale ?? 1);
  return {
    x: r.left + r.width / 2,
    y: r.top + r.height / 2,
    w: card.offsetWidth * k,
    h: card.offsetHeight * k,
    turn: Number(card.dataset.turn ?? 0) + on.tilt + (on.flight?.turn ?? 0),
  };
}

/** A sheet's paper middle and width in the viewport where it hangs (not flying). */
function restingAt(s: Sheet, f: Frame) {
  const k = depthScale(f, s.depth);
  const vx = (f.left + f.right) / 2;
  const vy = horizon(f);
  const { x, y, w, h } = s.rect;
  return { x: vx + (x + w / 2 - vx) * k, y: vy + (y + h / 2 - vy) * k, w: w * k };
}

/**
 * Clicks on the cards on a page open them; so does pulling one off (with a mouse): it
 * gives a little, then comes away. Clicks on a page with others pinned over it go back
 * to it. A named link in the writing goes there in the room, if the room has that page.
 */
function watchCards(sheet: Sheet, station: number, level: () => number) {
  const paper = sheet.paper;
  let drag: { card: HTMLElement; x: number; y: number; id: number; live: boolean } | null = null;
  /** The click that ends a pull is not a click (a fresh press or key clears it). */
  let swallow = false;
  const covered = () => piles[station].some((p) => p.going > 0 && p.level > level());
  paper.addEventListener(
    'click',
    (e) => {
      if (swallow) {
        swallow = false;
        e.preventDefault();
        e.stopPropagation();
        return;
      }
      if (covered()) {
        e.preventDefault();
        e.stopPropagation();
        const r = current();
        go({ ...r, station, trail: r.trail.slice(0, level()) });
        return;
      }
      if (e.metaKey || e.ctrlKey || e.shiftKey || e.button !== 0) return;
      const card = (e.target as Element).closest<HTMLElement>('a.card');
      if (card) {
        e.preventDefault();
        openCard(card, station, level(), null);
        return;
      }
      const link = (e.target as Element).closest<HTMLAnchorElement>('a[href^="/"]:not(.back)');
      const to = link && routeOf(link.pathname + link.hash);
      if (!to) return;
      e.preventDefault();
      go(to);
    },
    true,
  );
  paper.addEventListener('keydown', () => (swallow = false));
  paper.addEventListener('pointerdown', (e) => {
    swallow = false;
    const card = (e.target as Element).closest<HTMLElement>('a.card');
    if (!card || e.pointerType === 'touch' || e.button !== 0 || covered()) return;
    drag = { card, x: e.clientX, y: e.clientY, id: e.pointerId, live: false };
  });
  paper.addEventListener('pointermove', (e) => {
    if (!drag || e.pointerId !== drag.id) return;
    const [dx, dy] = [e.clientX - drag.x, e.clientY - drag.y];
    const d = Math.hypot(dx, dy);
    if (!drag.live && d < 6) return;
    if (!drag.live) {
      drag.live = true;
      swallow = true;
      drag.card.setPointerCapture(e.pointerId);
      drag.card.classList.add('pulling');
    }
    // It gives, less and less, then lets go.
    const give = 0.5 - Math.min(d, 90) / 400;
    drag.card.style.translate = `${(dx * give).toFixed(1)}px ${(dy * give).toFixed(1)}px`;
    drag.card.style.rotate = `${(dx * 0.06).toFixed(2)}deg`;
    if (d > 72) {
      const { card } = drag;
      drag = null;
      const spot = spotOf(card, sheet);
      spot.turn += dx * 0.06;
      card.classList.remove('pulling');
      card.style.translate = card.style.rotate = '';
      openCard(card, station, level(), spot);
    }
  });
  const up = (e: PointerEvent) => {
    if (!drag || e.pointerId !== drag.id) return;
    const { card, live } = drag;
    drag = null;
    if (!live) return;
    // Let go too soon: it springs back onto its pin.
    card.classList.remove('pulling');
    card.style.translate = card.style.rotate = '';
  };
  paper.addEventListener('pointerup', up);
  paper.addEventListener('pointercancel', up);
}

function openCard(card: HTMLElement, station: number, level: number, from: Spot | null) {
  const place = card.dataset.place;
  if (!place) return;
  const r = current();
  if (station !== r.station) return;
  // It comes off the page it's on: anything pinned above that page goes first.
  const trail = [...r.trail.slice(0, level), place];
  const live = piles[station].filter((p) => p.going > 0);
  for (let j = live.length - 1; j >= level; j--) unpin(live[j]);
  pin(station, place, from);
  restage();
  const route = { station, trail };
  tuner.mark(station);
  document.title = titleOf(place);
  history.pushState(route, '', address(route));
}

/** The room follows the page: its set pieces, decorations and games (the `stations` option). */
let staged = -1;
function restage() {
  if (welcoming || here === staged) return;
  staged = here;
  const dress = STATIONS[here].dress;
  if (dress) crew.page(dress);
}

// ---------- The gear ----------

const rigging = new Rigging(gearLayer);
const tuner = new Tuner(STATIONS.map(({ label, href }) => ({ label, href: url(href) })));
gearLayer.appendChild(tuner.el);
// The way to the plain site, at the same address.
tuner.extra(MODES.clean, '?serious', () => switchTo('serious'));

const storedDim = (() => {
  try {
    return localStorage.getItem('dim');
  } catch {
    return null;
  }
})();
const startDim = phone
  ? 0
  : storedDim !== null
    ? Number(storedDim)
    : matchMedia('(prefers-color-scheme: dark)').matches
      ? 1
      : 0;
const dimmer = new Dimmer(gearLayer, startDim);
dim(startDim);

// The crew's colour switch, beside the dimmer: auto (ink by day, paper by night), ink,
// paper or colour, kept in this browser.
const storedLook = (() => {
  if (phone) return null;
  try {
    return localStorage.getItem('look');
  } catch {
    return null;
  }
})();
/** The looks the colour switch clicks through, in order. */
const LOOKS: (LookName | 'auto')[] = ['auto', 'ink', 'paper', 'colour'];
const colours = new Dimmer(
  gearLayer,
  Math.max(0, LOOKS.indexOf((storedLook ?? 'colour') as LookName)) / (LOOKS.length - 1),
  'look',
);
// In colour unless another look was picked.
crew.look = LOOKS.includes(storedLook as LookName) ? (storedLook as LookName | 'auto') : 'colour';
colours.onChange = (v, settled) => {
  if (!settled) return;
  const look = LOOKS[colours.at(v)];
  if (crew.lookChosen === look) return;
  crew.look = look;
  try {
    if (look === 'colour') localStorage.removeItem('look');
    else localStorage.setItem('look', look);
  } catch {
    /* no storage: it just won't be remembered */
  }
};

/**
 * The dials are the monitor's two chin knobs, like an old set's: the left one the lights,
 * the right one the look. Each frame the knobs turn to the dials' settings, and the dials'
 * own controls (turned with a finger, clicked round, stepped with the keys) lie over them,
 * unseen but for a focus ring.
 */
function onChin(view: { width: number; height: number; eye: number }) {
  monitor.channel = dimmer.angle;
  monitor.volume = colours.angle;
  const knobs = [0, 1].map((i) => (welcoming ? null : monitor.knobOnScreen(i, view)));
  const [a, b] = knobs;
  // A thumb's room each (44 px), the knobs being close: each reaches away from the other,
  // the two meeting halfway between them.
  const mid = a && b ? (a.x + b.x) / 2 : 0;
  [dimmer, colours].forEach((d, i) => {
    const at = knobs[i];
    d.el.style.visibility = at ? '' : 'hidden';
    if (!at) return;
    const r = at.size / 2;
    const [x0, x1] =
      a && b
        ? i === 0
          ? [Math.min(at.x - r, mid - 44), mid]
          : [mid, Math.max(at.x + r, mid + 44)]
        : [at.x - Math.max(r, 22), at.x + Math.max(r, 22)];
    const h = Math.max(at.size, 44);
    d.el.style.width = `${(x1 - x0).toFixed(1)}px`;
    d.el.style.height = `${h.toFixed(1)}px`;
    d.el.style.transform = `translate(${x0.toFixed(1)}px, ${(at.y - h / 2).toFixed(1)}px)`;
  });
}

function dim(v: number) {
  root.style.setProperty('--dim', v.toFixed(3));
  const theme = v > 0.5 ? 'dark' : 'light';
  if (root.dataset.theme !== theme) root.dataset.theme = theme;
  // After the crew has seen the theme change (it shades the box all the way over).
  queueMicrotask(() => crew.box?.theme(v));
}
dimmer.onChange = (v, settled) => {
  dim(v);
  if (!settled) return;
  try {
    localStorage.setItem('dim', String(v));
  } catch {
    /* no storage: it just won't be remembered */
  }
};

let turnedAt = 0;
tuner.onHold = () => {
  rail.held = true;
  turnedAt = performance.now();
};
tuner.onTurn = (v) => {
  const now = performance.now();
  rail.follow(v, Math.max(0.008, (now - turnedAt) / 1000));
  turnedAt = now;
};
tuner.onTune = (station, picked) => {
  rail.held = false;
  const r = current();
  // Its own name again, from further in: back to the top of it.
  const top = picked && station === r.station;
  const trail = top ? [] : piles[station].filter((p) => p.going > 0).map((p) => p.place);
  if (station === r.station && !top) {
    rail.to = station; // let go on the same one: it slides back
    return;
  }
  go({ station, trail });
};

addEventListener('keydown', (e) => {
  if (e.key !== 'Escape') return;
  const r = current();
  if (r.trail.length) go({ ...r, trail: r.trail.slice(0, -1) });
});
addEventListener('popstate', (e) => {
  const route = (e.state as Route | null) ?? parse(location.pathname + location.hash);
  go(route, 'none');
});

// ---------- Every frame ----------

function tick(dt: number, f: Frame) {
  sharpness.frame();
  const view: View = {
    width: innerWidth,
    height: innerHeight,
    eye: crew.stage.camera.position.z,
  };
  const [glass, focusK] = focus(dt, f, glassOf(f));
  monitor.kind = narrow(f) ? 'phone' : 'monitor';
  seated(monitor.kind === 'monitor');
  // A phone reaches the ceiling, with no room beside it: nothing hangs over it.
  if (monitor.kind === 'phone' && crew.decor?.names.length) crew.decor.show([], f);
  // The phone stands on Bolt's hands.
  const phoneUp = monitor.kind === 'phone' && !welcoming;
  const placed = { glass, depth: DEPTH, unit: unit(), rise };
  const stand = holding.tick(
    dt,
    phoneUp ? 'hold' : 'none',
    f,
    (f.left + f.right) / 2,
    unit(),
    placed,
  );
  monitor.away = holding.away;
  monitor.depth = stand.depth;
  monitor.rise = stand.rise;
  // Nobody and nothing goes behind it: the crew, the set, the toys, what hangs up.
  crew.back = phoneUp ? DEPTH : stand.depth;
  if (!welcoming) monitor.fit(f, view, stand.glass, stand.unit);
  cutToGlass(glass, monitor.radius + (Math.max(8, siteBot * 0.4) - monitor.radius) * focusK);
  layFocus(glass);
  // The pages lie a pixel over the glass's edge, under the case's bevel.
  const face = toFront({ x: glass.x - 1, y: glass.y - 1, w: glass.w + 2, h: glass.h + 2 }, f);
  rail.update(dt, f, face, face.w + siteBot, [face.x, face.x + face.w]);
  tuner.show(rail.at);
  rail.sheets.forEach((s, i) => {
    const covered = piles[i].some((p) => p.going > 0);
    s.veil = covered ? 0.2 : 0;
    s.floorless = focusK > 0;
    s.paper.classList.toggle('covered', covered);
    s.place(f, view);
  });
  piles.forEach((pile, i) => {
    for (const p of [...pile]) layPinned(p, i, dt, f, view);
  });
  dimmer.update(dt);
  colours.update(dt);
  onChin(view);
  crew.box?.room(welcoming ? null : roomOf(here));
  // The monitor is dressed for the room (its case, trim and seat): changed as the old room
  // has faded out and the new one comes in.
  monitor.suit(crew.box?.roomShown ?? 'box');
}

const ease = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2);
const easeBack = (t: number) => 1 + 2.2 * (t - 1) ** 3 + 1.2 * (t - 1) ** 2;
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
const clamp = (x: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, x));

function layPinned(p: Pinned, station: number, dt: number, f: Frame, view: View) {
  const s = p.sheet;
  const hung = rail.sheets[station];
  const r = pinnedRect(hung.rect, p.level, f);
  s.rect = r;
  s.depth = DEPTH;
  s.walls = hung.walls;
  p.t = clamp(p.t + p.going * dt * (reduce ? 100 : 1 / 0.6), 0, 1);
  const pile = piles[station];
  const covered = pile.some((o) => o.going > 0 && o.level > p.level);
  s.veil = covered ? 0.2 : 0;
  s.paper.classList.toggle('covered', covered);
  if (p.t < 1 && p.card?.isConnected) {
    const below = under(station, p.level);
    const from = p.from ?? spotOf(p.card, below);
    const rest = restingAt(s, f);
    const e = ease(p.t);
    const s0 = from.w / rest.w;
    const lift = Math.sin(Math.PI * p.t);
    const folded = (from.h * r.w) / from.w;
    s.reveal = lerp(folded, r.h, ease(clamp((p.t - 0.06) / 0.82, 0, 1)));
    const flight: Flight = {
      x: lerp(from.x, rest.x, e),
      y: lerp(from.y, rest.y, e) - lift * siteBot * 1.1,
      oy: lerp(folded / 2, r.h / 2, e),
      scale: lerp(s0, 1, easeBack(p.t)),
      turn: lerp(from.turn, 0, e) - lift * 4,
    };
    s.flight = flight;
    s.lift = lift;
    if (p.cover) {
      p.cover.style.opacity = String(clamp(1 - p.t / 0.42, 0, 1).toFixed(3));
      p.cover.style.transform = `scale(${(r.w / p.card.offsetWidth).toFixed(4)})`;
    }
  } else {
    s.flight = null;
    s.reveal = null;
    s.lift = 0;
    s.opacity = p.card ? 1 : p.t;
  }
  s.place(f, view);
  if (p.going > 0 && p.t >= 1 && p.cover) {
    p.cover.remove();
    p.cover = null;
    p.pin.classList.add('in');
    s.paper.querySelector<HTMLElement>('h1')?.focus({ preventScroll: true });
  }
  if (p.going < 0 && p.t <= 0) {
    s.dispose();
    pile.splice(pile.indexOf(p), 1);
    if (p.card) {
      const card = p.card;
      card.classList.remove('off');
      card.classList.add('back');
      setTimeout(() => card.classList.remove('back'), 700);
      if (document.activeElement === document.body) card.focus({ preventScroll: true });
    }
  }
}

// ---------- Go ----------

/** The page in front: what the reader is on. */
function frontSheet() {
  const live = piles[here].filter((p) => p.going > 0);
  return live[live.length - 1]?.sheet ?? rail.sheets[here];
}
document.querySelector('.skip')?.addEventListener('click', (e) => {
  e.preventDefault();
  frontSheet().paper.querySelector<HTMLElement>('h1')?.focus();
});

function measure() {
  rigging.resize();
  tuner.measure();
  tunerBottom = tuner.el.getBoundingClientRect().bottom;
  floorTop = innerHeight;
}
if (welcoming) root.dataset.welcome = '';
go(parse(location.pathname + location.hash), 'replace', false);
addEventListener('resize', measure);
void document.fonts.ready.then(measure);
measure();
crew.start();
// The front page is the lobby: the concierges come out with their signs.
if (welcoming) void lobby(crew, gearLayer);
// In the console: crew.members.get('bolt')?.perform('sweep'), crew.call('owl'), …
Object.assign(window, { crew, monitor, go });
