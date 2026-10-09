import { Mesh, MeshBasicMaterial, PlaneGeometry, type Object3D } from 'three';
import type { Frame } from '@wisdomousai/creatures';
import { depthScale, horizon } from '@wisdomousai/creatures';

/**
 * Pages in the box. A page is a sheet of paper in the room, somewhere between the front
 * (depth 0) and the back wall (1): hung on a rail under the ceiling, pinned on another
 * sheet, let down from the ceiling on strings or pushed up through the floor on posts.
 * The sheet is plain DOM, so its words are real text; it is drawn where the box's
 * perspective puts it, and an invisible plane at the same place in the crew's scene hides
 * whoever walks behind it.
 */

/** Where a sheet's paper is, in px on the front of the box (as if at depth 0). */
export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

/** While a sheet flies (a card coming off to be a page): where the point `oy` px down its
 * middle is in the viewport, its size against where it would be, and how far it is
 * turned. */
export interface Flight {
  x: number;
  y: number;
  oy: number;
  scale: number;
  turn: number;
}

/** What holds it up ('screen': nothing, it is shown on the monitor's glass). */
export type Hang = 'rail' | 'strings' | 'posts' | 'pin' | 'screen';

/** The crew's camera, for lining the hiding planes up with the page. */
export interface View {
  width: number;
  height: number;
  /** How far the camera is from the page plane (world px). */
  eye: number;
}

/** Room either side of the paper for its shadow and its rigging, in px. */
const SIDE = 48;

const SVG = 'http://www.w3.org/2000/svg';

export class Sheet {
  /** The whole of it, from the ceiling to the floor at its depth: rigging and paper. */
  readonly el: HTMLElement;
  /** The page itself; it scrolls. */
  readonly paper: HTMLElement;
  /** Things fixed to the paper that don't scroll with it (a pin through its top), placed
   * from its top left corner. */
  readonly fixtures: HTMLElement;
  readonly hang: Hang;
  depth = 0.6;
  rect: Rect = { x: 0, y: 0, w: 1, h: 1 };
  /** The side walls, in front px, where a sheet on the rail goes out of the room. */
  walls: [number, number] | null = null;
  /** Its swing about the top middle (degrees, clockwise). */
  tilt = 0;
  /** How far it has gone back behind the sheets in front of it (0..1). */
  veil = 0;
  /** How far off its backing it is (0..1): the shadow grows. */
  lift = 0;
  opacity = 1;
  flight: Flight | null = null;
  /** While it flies: how much of the paper shows, px from the top (the rest is still
   * folded away behind the card it was). */
  reveal: number | null = null;
  /** Not cut at the floor: a page over the room (focused), its paper as long as it goes. */
  floorless = false;
  private rig: SVGSVGElement;
  private lines: SVGPathElement;
  private parts: SVGPathElement;
  /** Hides whoever is behind it (none on the monitor: its glass does that). */
  private hider: Mesh | null = null;
  /** Where the seen part of the paper is in the viewport now (for hides()). */
  private quad = { x: 0, y: 0, w: 0, h: 0, angle: 0, on: false };
  private shown = true;
  private last = '';

  /** `hides`: hide whoever walks behind it (not on the monitor's glass: that does it). */
  constructor(scene: Object3D, hang: Hang, content?: Node, hides = hang !== 'screen') {
    this.hang = hang;
    const el = document.createElement('div');
    el.className = `sheet sheet-${hang}`;
    el.style.cssText =
      'position:fixed;left:0;top:0;transform-origin:0 0;pointer-events:none;contain:layout style;';
    const rig = document.createElementNS(SVG, 'svg');
    rig.setAttribute('class', 'sheet-rig');
    rig.setAttribute('aria-hidden', 'true');
    rig.style.cssText = 'position:absolute;inset:0;width:100%;height:100%;overflow:visible;';
    this.lines = document.createElementNS(SVG, 'path');
    this.lines.setAttribute('class', 'sheet-lines');
    this.parts = document.createElementNS(SVG, 'path');
    this.parts.setAttribute('class', 'sheet-parts');
    rig.append(this.lines, this.parts);
    const paper = document.createElement('div');
    paper.className = 'paper';
    paper.style.cssText = 'position:absolute;pointer-events:auto;';
    if (content) paper.appendChild(content);
    const fixtures = document.createElement('div');
    fixtures.className = 'fixtures';
    fixtures.style.cssText = 'position:absolute;height:0;pointer-events:none;';
    el.append(rig, paper, fixtures);
    this.el = el;
    this.fixtures = fixtures;
    this.rig = rig;
    this.paper = paper;
    // Writes depth and nothing else, before anyone is drawn: whoever is behind it is not.
    if (hides) {
      this.hider = new Mesh(
        new PlaneGeometry(1, 1),
        new MeshBasicMaterial({ colorWrite: false, depthWrite: true }),
      );
      this.hider.renderOrder = -100;
      scene.add(this.hider);
    }
  }

  /** Draw it where it is now. */
  place(f: Frame, view: View) {
    const { x, y, w, h } = this.rect;
    const k = depthScale(f, this.depth);
    const vx = (f.left + f.right) / 2;
    const vy = horizon(f);
    const W = w + SIDE * 2;
    // The el's corner, in front px, and the paper's top middle in the el (it hangs there).
    const [ox, oy] = [x - SIDE, f.top];
    const [px, py] = [SIDE + w / 2, y - oy];
    const H = this.floorless ? Math.max(f.bottom - f.top, py + h) : f.bottom - f.top;
    let m = new DOMMatrix()
      .translateSelf(vx, vy)
      .scaleSelf(k)
      .translateSelf(ox - vx, oy - vy)
      .translateSelf(px, py)
      .rotateSelf(this.tilt)
      .translateSelf(-px, -py);
    const fl = this.flight;
    if (fl) {
      const c = m.transformPoint(new DOMPoint(px, py + fl.oy));
      m = new DOMMatrix()
        .translateSelf(fl.x, fl.y)
        .rotateSelf(fl.turn)
        .scaleSelf(fl.scale)
        .translateSelf(-c.x, -c.y)
        .multiplySelf(m);
    }
    // Cut at the side walls (on the rail), and at the ceiling and the floor.
    let [l, r] = [0, 0];
    if (this.walls && !fl) {
      l = Math.max(0, this.walls[0] - ox);
      r = Math.max(0, ox + W - this.walls[1]);
    }
    const seen = !(l >= W - SIDE || r >= W - SIDE) && this.opacity > 0.01;
    if (seen !== this.shown) {
      this.shown = seen;
      this.el.style.visibility = seen ? '' : 'hidden';
    }
    const shown = this.reveal ?? h;
    this.placeHider(f, view, m, seen ? [Math.max(SIDE, l), Math.min(SIDE + w, W - r)] : null, [
      Math.max(py, fl ? py : 0),
      Math.min(py + shown, fl ? py + h : H),
    ]);
    if (!seen) return;
    const n = (v: number) => Math.round(v * 100) / 100;
    const key = [m, W, H, px, py, w, h, l, r, this.veil, this.lift, this.opacity, shown].join();
    if (key === this.last) return;
    this.last = key;
    const s = this.el.style;
    s.width = `${n(W)}px`;
    s.height = `${n(H)}px`;
    s.transform = m.toString();
    // Flying, it is cut only to the part unfolded so far (and room above for its pin).
    s.clipPath = fl
      ? `inset(${n(Math.max(0, py - SIDE))}px 0 ${n(Math.max(0, H - py - shown))}px 0)`
      : `inset(0 ${n(r)}px 0 ${n(l)}px)`;
    s.opacity = this.opacity < 1 ? String(n(this.opacity)) : '';
    const p = this.paper.style;
    p.left = `${SIDE}px`;
    p.top = `${n(py)}px`;
    p.width = `${n(w)}px`;
    p.height = `${n(h)}px`;
    const fx = this.fixtures.style;
    fx.left = `${SIDE}px`;
    fx.top = `${n(py)}px`;
    fx.width = `${n(w)}px`;
    this.paper.style.setProperty('--veil', String(n(this.veil)));
    this.paper.style.setProperty('--lift', String(n(this.lift)));
    this.paper.inert = this.veil > 0.5;
    this.drawRig(f, W, H, px, py, w, h);
  }

  /** Strings, posts and the bits that hold it, in the el's own px. */
  private drawRig(f: Frame, W: number, H: number, px: number, py: number, w: number, h: number) {
    const n = (v: number) => v.toFixed(1);
    const bot = f.bot;
    let lines = '';
    let parts = '';
    const at = [px - w * 0.36, px + w * 0.36];
    if (this.hang === 'rail' || this.hang === 'strings') {
      // Two strings from the ceiling to two clips on the top edge; on the rail each hangs
      // from a little trolley.
      for (const x of at) {
        lines += `M${n(x)} 0V${n(py)}`;
        const cw = bot * 0.28;
        parts += `M${n(x - cw / 2)} ${n(py - bot * 0.12)}h${n(cw)}v${n(bot * 0.3)}h${n(-cw)}Z`;
        if (this.hang === 'rail') {
          const tw = bot * 0.5;
          parts += `M${n(x - tw / 2)} 0h${n(tw)}v${n(bot * 0.16)}h${n(-tw)}Z`;
        }
      }
    } else if (this.hang === 'posts') {
      // Two telescoping posts from the floor, thicker lower down.
      for (const x of at) {
        const top = py + h;
        const mid = top + (H - top) * 0.45;
        const [a, b] = [bot * 0.07, bot * 0.12];
        parts += `M${n(x - a)} ${n(top)}h${n(a * 2)}V${n(mid)}h${n(-a * 2)}Z`;
        parts += `M${n(x - b)} ${n(mid)}h${n(b * 2)}V${n(H + 2)}h${n(-b * 2)}Z`;
      }
    }
    this.lines.setAttribute('d', lines);
    this.parts.setAttribute('d', parts);
    this.rig.setAttribute('viewBox', `0 0 ${n(W)} ${n(H)}`);
  }

  /** Line the hiding plane up with the paper's seen part: [x0, x1] and [y0, y1] in the el. */
  private placeHider(
    f: Frame,
    view: View,
    m: DOMMatrix,
    xs: [number, number] | null,
    ys: [number, number],
  ) {
    const on = xs !== null && xs[1] > xs[0] && ys[1] > ys[0] && this.opacity > 0.5;
    if (this.hider) this.hider.visible = on;
    this.quad.on = on;
    if (!on) return;
    const [x0, x1] = xs;
    const [y0, y1] = ys;
    const c = m.transformPoint(new DOMPoint((x0 + x1) / 2, (y0 + y1) / 2));
    const a = m.transformPoint(new DOMPoint(x0, y0));
    const b = m.transformPoint(new DOMPoint(x1, y0));
    const d = m.transformPoint(new DOMPoint(x0, y1));
    const width = Math.hypot(b.x - a.x, b.y - a.y);
    const height = Math.hypot(d.x - a.x, d.y - a.y);
    const angle = Math.atan2(b.y - a.y, b.x - a.x);
    Object.assign(this.quad, { x: c.x, y: c.y, w: width, h: height, angle });
    if (!this.hider) return;
    // A shade behind the crew at its depth, so a crewmate level with it stays in front; and
    // sized up for the camera's perspective, which shrinks what is further back.
    const z = -(this.depth + 0.01) * f.depth * 3;
    const s = (view.eye - z) / view.eye;
    const [cx, cy] = [view.width / 2, view.height / 2];
    this.hider.position.set(cx + (c.x - cx) * s, -(cy + (c.y - cy) * s), z);
    this.hider.rotation.set(0, 0, -angle);
    this.hider.scale.set(width * s, height * s, 1);
  }

  /** The middle of the paper's seen part in the viewport, as drawn last. */
  get centre() {
    return { x: this.quad.x, y: this.quad.y };
  }

  /** Is the point (viewport px) on the paper, and is something at `depth` behind it? */
  hides(x: number, y: number, depth: number) {
    const q = this.quad;
    if (!q.on || depth <= this.depth) return false;
    const [dx, dy] = [x - q.x, y - q.y];
    const [c, s] = [Math.cos(q.angle), Math.sin(q.angle)];
    return Math.abs(dx * c + dy * s) <= q.w / 2 && Math.abs(-dx * s + dy * c) <= q.h / 2;
  }

  dispose() {
    if (this.hider) {
      this.hider.removeFromParent();
      this.hider.geometry.dispose();
      (this.hider.material as MeshBasicMaterial).dispose();
    }
    this.el.remove();
  }
}

/**
 * The sheets hung side by side on one rail, a room's width apart, so one hangs in the
 * middle and the rest are out through the side walls. Turning to another station slides
 * the rail; the sheets swing on their trolleys as it starts and stops.
 */
export class Rail {
  readonly sheets: Sheet[];
  depth: number;
  /** Where it is along the stations (0..n-1), and where it's going. */
  at = 0;
  to = 0;
  /** Held by the reader (the tuner): it follows exactly and does not spring. */
  held = false;
  /** The sheets swing on their trolleys as it starts and stops (not on a screen). */
  swings = true;
  private speed = 0;
  private swing: { a: number; v: number }[];

  constructor(sheets: Sheet[], depth = 0.6) {
    this.sheets = sheets;
    this.depth = depth;
    this.swing = sheets.map(() => ({ a: 0, v: 0 }));
  }

  /** Is it still going (or still swinging)? */
  get moving() {
    return (
      Math.abs(this.speed) > 0.005 ||
      Math.abs(this.to - this.at) > 0.001 ||
      this.swing.some((s) => Math.abs(s.a) > 0.02 || Math.abs(s.v) > 0.05)
    );
  }

  /** Straight there, no sliding (a page loaded at its station). */
  jump(station: number) {
    this.at = this.to = station;
    this.speed = 0;
  }

  /** `slot` is where the one in the middle hangs, `gap` how far apart they hang (a room's
   * width), and `walls` where they go out of sight (the room's side walls), in front px. */
  update(
    dt: number,
    f: Frame,
    slot: Rect,
    gap = f.right - f.left,
    walls: [number, number] = [f.left, f.right],
  ) {
    const was = this.speed;
    if (this.held) {
      this.to = this.at;
    } else {
      // A critically damped spring: quick, no overshoot (the sheets do the swinging).
      const w = 8.5;
      const acc = w * w * (this.to - this.at) - 2 * w * this.speed;
      this.speed += acc * dt;
      this.at += this.speed * dt;
      if (Math.abs(this.to - this.at) < 0.0005 && Math.abs(this.speed) < 0.002) {
        this.at = this.to;
        this.speed = 0;
      }
    }
    // How fast the trolleys are going across the room, px/s², for the swing.
    const accel = dt > 0 ? (-(this.speed - was) / dt) * gap : 0;
    this.sheets.forEach((s, i) => {
      s.depth = this.depth;
      s.rect = { ...slot, x: slot.x + (i - this.at) * gap };
      s.walls = walls;
      if (!this.swings) return;
      // A pendulum on its trolley: it lags as the rail speeds up and runs on as it stops.
      const sw = this.swing[i];
      const w = 5.2;
      const push = clamp(accel * 0.0009, -40, 40);
      sw.v += (-w * w * sw.a - 2 * 0.22 * w * sw.v + push * w * w * 0.05) * dt;
      sw.a = clamp(sw.a + sw.v * dt, -7, 7);
      s.tilt = sw.a;
    });
  }

  /** Set the speed the reader's hand has (for the swing, and a flick on letting go). */
  follow(at: number, dt: number) {
    if (dt > 0) this.speed = this.speed * 0.6 + ((at - this.at) / dt) * 0.4;
    this.at = at;
  }

  get velocity() {
    return this.speed;
  }
}

function clamp(x: number, lo: number, hi: number) {
  return Math.min(hi, Math.max(lo, x));
}
