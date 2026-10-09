import { loadContent } from './content';
import { routeOf } from './pages';

/**
 * The room played on the site itself (src/lib/mode.ts): over the page, at the same address,
 * with that page's words on the monitor. The page stays in the document under it (hidden),
 * so its body is read from here rather than fetched again.
 */

/** What site.ts finds. */
const SKELETON = `
<a class="skip" href="#room">Skip to content</a>
<div class="frame" aria-hidden="true"></div>
<main id="room"></main>
<canvas id="crew" aria-hidden="true"></canvas>
<div id="hits"></div>
<div id="gear"></div>`;

/** Play the room over the page; false if the room has no page for this address. */
export async function play() {
  await loadContent();
  if (!routeOf(location.pathname + location.hash)) return false;
  document.body.insertAdjacentHTML('afterbegin', SKELETON);
  await import('./site');
  return true;
}
