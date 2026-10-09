/**
 * The page or the room: the same site at the same addresses. The page is the site as it is,
 * with the crew on its frame; the room is src/play played over it, with the page's own words
 * on its monitor. Its front page is the lobby, where the concierges hold up signs for the
 * places. ?play or ?serious on any address picks one, and this browser keeps it
 * (Base.astro's head script reads it before the page shows). Search engines and anyone
 * without scripts get the page.
 */

export type Mode = 'play' | 'serious';

export const playing = () => document.documentElement.dataset.mode === 'play';

/** Over to the other one, at the same address (or at `path`). */
export function switchTo(mode: Mode, path?: string) {
  const q = new URLSearchParams(location.search);
  q.delete(mode === 'play' ? 'serious' : 'play');
  q.set(mode, '');
  const query = `?${q.toString().replace(/=(&|$)/g, '$1')}`;
  location.assign(path ? `${path}${query}` : `${location.pathname}${query}${location.hash}`);
}

/** What goes with the page: the room over it, or the crew on its frame. */
export async function start() {
  if (!playing()) {
    // The crew come once the page has what it needs.
    const idle = window.requestIdleCallback ?? ((fn: () => void) => setTimeout(fn, 1500));
    idle(() => void import('./creatures').then(({ creatures }) => creatures()));
    return;
  }
  try {
    const { play } = await import('../play/embed');
    if (await play()) return;
  } catch (e) {
    console.error(e);
  }
  // The room has no page here (or couldn't start): this one is shown as it is.
  delete document.documentElement.dataset.mode;
}
