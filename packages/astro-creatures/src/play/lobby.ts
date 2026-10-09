import type { Character, Crew, Frame, Held } from '@wisdomousai/creatures';
import { switchTo } from '../lib/mode';
import { url } from '../site';
import { type Concierge, LOBBY, MODES, STATIONS } from '../stations';

/**
 * The lobby: the room's front page. The room is empty (site.ts holds the page, the set and
 * everyone else back) and the concierges come out, each holding up a sign for a place
 * (the `lobby` option). Pick a sign (click, or Tab to it and Enter) and its concierge
 * leads the way off, sign and all, while that page comes. The signs say only the places'
 * names.
 */

/** A concierge's sign, and where it leads. */
const sign = (c: Concierge) => {
  if (c.to === 'clean') return { label: MODES.clean, go: () => switchTo('serious', url('/')) };
  const s = STATIONS.find((st) => st.key === c.to);
  if (!s) throw new Error(`lobby: no station "${c.to}" in the stations`);
  return { label: s.label, go: () => switchTo('play', url(s.href)) };
};

/** Narrower than this (px), the box is a phone's. */
const NARROW = 720;
/** How long the page waits for a concierge to be out of sight before it goes anyway (ms). */
const LEAD = 1800;
/** How far back into the box they stand. */
const DEPTH = 0.15;
/** How long after each other they come out (ms). */
const STAGGER = 350;

/** Its place along the front of the box (px). */
const place = (f: Frame, c: Concierge) =>
  f.left + (f.right - f.left) * (f.right - f.left < NARROW ? c.narrow : c.at);

const wait = (ms: number) => new Promise((done) => setTimeout(done, ms));

const until = (ok: () => boolean) =>
  new Promise<void>((done) => {
    const id = setInterval(() => {
      if (!ok()) return;
      clearInterval(id);
      done();
    }, 100);
  });

/** Bring the concierges out, `after` ms from now, and hand each its sign. */
export async function lobby(crew: Crew, host: HTMLElement, after = 600) {
  await wait(after);
  const held: Held[] = [];
  let picked = false;

  const pick = (c: Concierge, hold: Held) => {
    if (picked) return;
    picked = true;
    for (const h of held) if (h !== hold && h.button) h.button.disabled = true;
    const f = crew.frame;
    const toward = place(f, c) <= (f.left + f.right) / 2 ? 'left' : 'right';
    void Promise.race([hold.lead(toward), wait(LEAD)]).then(sign(c).go);
  };

  await Promise.all(
    LOBBY.map(async (c, i) => {
      await wait(i * STAGGER);
      const m = await bring(crew, c, crew.frame);
      if (!m || picked) return;
      // Handed its sign as it comes, it goes to its place with it and stays there (out of
      // its own tricks): a flier hovers there, the one on a crate hops up onto it.
      const f = crew.frame;
      const hold = crew.holdUp(m, 'sign', {
        label: sign(c).label,
        host,
        onPick: () => pick(c, hold!),
        hover: c.hover ? hoverSpot(f, c) : undefined,
        at: c.hover ? undefined : { s: place(f, c), depth: DEPTH },
        on: c.on,
      });
      if (hold) held.push(hold);
    }),
  );
}

/** Over its place on the floor, at its height. */
const hoverSpot = (f: Frame, c: Concierge) => ({
  x: place(f, c),
  y: f.top + (f.bottom - f.top) * c.hover![f.right - f.left < NARROW ? 1 : 0],
});

/** Coming on at its place along the floor (or on already). */
async function bring(crew: Crew, c: Concierge, f: Frame): Promise<Character | null> {
  const s = place(f, c);
  let m = crew.members.get(c.name) ?? null;
  if (m && (m.state === 'leaving' || m.state === 'entering'))
    await until(() => m!.state === 'gone' || m!.state === 'here');
  // Up from below the front lip at its place, so nobody has to get past anyone.
  if (!m || m.state === 'gone')
    m = await crew.call(c.name, {
      edge: 'bottom',
      s,
      from: c.hover ? undefined : 'below',
      depth: DEPTH,
    });
  if (!m || m.state === 'gone' || m.state === 'leaving') return null;
  return m;
}
