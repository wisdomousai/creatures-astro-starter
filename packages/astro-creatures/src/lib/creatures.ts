import { Crew } from '@wisdomousai/creatures';
import { version } from '@wisdomousai/creatures/package.json';
import { site, url } from '../site';

/** The models of the version that's installed, from jsDelivr. */
const MODELS = `https://cdn.jsdelivr.net/npm/@wisdomousai/creatures@${version}/models/`;

/**
 * The crew on the window's frame: they turn up one at a time, walk along its edges (or fly
 * up its sides, if they can), potter about for a minute and go home. Poke one and it jumps;
 * three quick pokes and it's dizzy; rest the mouse on it and it goes soppy; hold one down and
 * it follows the pointer.
 *
 * They're sized by --bot and stand on the line at --frame-inset (global.css), drawn in ink
 * by day and paper by night. Their models come from jsDelivr, the version installed, unless
 * `crew.models` says where else.
 */
export function creatures() {
  const { roster, first, max, every, respectReducedMotion, models } = site.crew;
  if (!roster.length) return;
  if (respectReducedMotion && matchMedia('(prefers-reduced-motion: reduce)').matches) return;

  const canvas = document.createElement('canvas');
  canvas.className = 'crew';
  canvas.setAttribute('aria-hidden', 'true');
  const hits = document.createElement('div');
  hits.className = 'crew-hits';
  document.body.append(canvas, hits);

  const crew = new Crew({
    canvas,
    hits,
    models: models ? url(models) : MODELS,
    box: false,
    roster,
    max,
    every,
  });
  crew.start();
  if (first) setTimeout(() => void crew.call(first), 800);
  return crew;
}
