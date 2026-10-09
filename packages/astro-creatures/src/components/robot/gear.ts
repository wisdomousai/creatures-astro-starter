/**
 * The things you work to get about the box: a radio's tuning dial on the frame to slide
 * the rail of pages, and the dimmer for the lights (and its twin for the crew's look). Each
 * is a real button or link underneath (keys and screen readers work), and each moves like
 * the thing it is: the needle glides, the knob turns with it.
 */

const SVG = 'http://www.w3.org/2000/svg';

function svg<K extends keyof SVGElementTagNameMap>(tag: K, attrs: Record<string, string> = {}) {
  const e = document.createElementNS(SVG, tag);
  for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, v);
  return e;
}

function clamp(x: number, lo: number, hi: number) {
  return Math.min(hi, Math.max(lo, x));
}

export interface Station {
  label: string;
  href: string;
}

/** Degrees the knob turns from one station to the next. */
const STEP = 64;

/**
 * An old radio's dial: the stations printed along a window, a needle that slides over
 * them, a knurled knob at the end. Click a station, drag the needle or turn the knob; the
 * rail of pages follows the needle as it goes. Where the window is too short for all of
 * them (a phone), the stations slide along under it instead, keeping the needle on the
 * one that's on in the middle as far as the ends allow.
 */
export class Tuner {
  readonly el: HTMLElement;
  private scale: HTMLElement;
  /** What's printed on the dial (the stations, and any extras), which slides when it must. */
  private strip: HTMLElement;
  private sliding = false;
  /** How far the strip is slid along (px, 0 or less). */
  private shift = 0;
  /** The needle is being dragged: the strip keeps still under it till it's let go. */
  private dragging = false;
  private links: HTMLAnchorElement[];
  private needle: HTMLElement;
  private knob: HTMLButtonElement;
  private dial: SVGGElement;
  private centres: number[] = [];
  private value = 0;
  private stations: Station[];
  /** The reader is turning it: where along the stations it is now (continuous). */
  onTurn: (value: number) => void = () => {};
  /** Let go, or a click or key: go to this station (`picked`: its name was clicked). */
  onTune: (station: number, picked?: boolean) => void = () => {};
  /** Picked up (the rail stops following its own spring). */
  onHold: () => void = () => {};

  constructor(stations: Station[], label = 'Sections') {
    this.stations = stations;
    const el = document.createElement('nav');
    el.className = 'tuner';
    el.setAttribute('aria-label', label);
    const scale = document.createElement('div');
    scale.className = 'tuner-scale';
    const strip = document.createElement('div');
    strip.className = 'tuner-strip';
    scale.appendChild(strip);
    this.links = stations.map((s, i) => {
      const a = document.createElement('a');
      a.href = s.href;
      a.textContent = s.label;
      a.className = 'tuner-station';
      // Dragging along the dial turns it; it doesn't pick the link up.
      a.draggable = false;
      a.addEventListener('click', (e) => {
        if (e.metaKey || e.ctrlKey || e.shiftKey || e.button !== 0) return;
        e.preventDefault();
        if (this.dragged) return;
        this.onTune(i, true);
      });
      strip.appendChild(a);
      return a;
    });
    const needle = document.createElement('i');
    needle.className = 'tuner-needle';
    needle.setAttribute('aria-hidden', 'true');
    scale.appendChild(needle);
    const knob = document.createElement('button');
    knob.className = 'tuner-knob';
    knob.type = 'button';
    knob.setAttribute('role', 'slider');
    knob.setAttribute('aria-label', 'Tuning knob');
    knob.setAttribute('aria-valuemin', '0');
    knob.setAttribute('aria-valuemax', String(stations.length - 1));
    const face = svg('svg', { viewBox: '-20 -20 40 40', 'aria-hidden': 'true' });
    const dial = svg('g');
    dial.appendChild(svg('circle', { r: '17', class: 'knob-rim' }));
    // Knurling round the edge, and a notch that points the way it's set.
    let knurl = '';
    for (let i = 0; i < 28; i++) {
      const a = (i / 28) * Math.PI * 2;
      const [c, s] = [Math.cos(a), Math.sin(a)];
      knurl += `M${(c * 14.2).toFixed(2)} ${(s * 14.2).toFixed(2)}L${(c * 17).toFixed(2)} ${(s * 17).toFixed(2)}`;
    }
    dial.appendChild(svg('path', { d: knurl, class: 'knob-knurl' }));
    dial.appendChild(svg('circle', { r: '10.5', class: 'knob-cap' }));
    dial.appendChild(svg('path', { d: 'M0 -13.5V-6', class: 'knob-mark' }));
    face.appendChild(dial);
    knob.appendChild(face);
    el.append(scale, knob);
    this.el = el;
    this.scale = scale;
    this.strip = strip;
    this.needle = needle;
    this.knob = knob;
    this.dial = dial;
    this.dragScale();
    this.turnKnob();
    el.addEventListener('wheel', (e) => this.wheel(e), { passive: false });
    knob.addEventListener('keydown', (e) => {
      const i = Math.round(this.value);
      const to =
        e.key === 'ArrowRight' || e.key === 'ArrowUp'
          ? i + 1
          : e.key === 'ArrowLeft' || e.key === 'ArrowDown'
            ? i - 1
            : e.key === 'Home'
              ? 0
              : e.key === 'End'
                ? this.stations.length - 1
                : null;
      if (to === null) return;
      e.preventDefault();
      this.onTune(clamp(to, 0, this.stations.length - 1));
    });
  }

  /** Where the stations are along the window, and whether they all fit in it (after a
   * resize or the fonts load). */
  measure() {
    this.strip.style.transform = '';
    const box = this.scale.getBoundingClientRect();
    this.centres = this.links.map((a) => {
      const r = a.getBoundingClientRect();
      return r.left + r.width / 2 - box.left;
    });
    this.sliding = this.strip.offsetWidth > this.scale.clientWidth + 0.5;
    this.el.classList.toggle('sliding', this.sliding);
    if (!this.sliding) this.slide(0);
    this.show(this.value, true);
  }

  /** The strip slid this far along, the window fading out on a side with more beyond it. */
  private slide(shift: number) {
    this.shift = shift;
    if (!this.sliding) {
      this.strip.style.transform = '';
      this.scale.style.removeProperty('--fade-l');
      this.scale.style.removeProperty('--fade-r');
      return;
    }
    const room = this.scale.clientWidth - this.strip.offsetWidth;
    this.strip.style.transform = `translateX(${shift.toFixed(1)}px)`;
    this.scale.style.setProperty('--fade-l', shift < -1 ? '1.6rem' : '0px');
    this.scale.style.setProperty('--fade-r', shift > room + 1 ? '1.6rem' : '0px');
  }

  /** Point the needle and the knob at `value` (from the rail, every frame it moves). */
  show(value: number, force = false) {
    if (!force && Math.abs(value - this.value) < 1e-4) return;
    this.value = value;
    if (!this.centres.length) return;
    const x = this.x(value);
    if (this.sliding && !this.dragging) {
      const W = this.scale.clientWidth;
      this.slide(clamp(W / 2 - x, W - this.strip.offsetWidth, 0));
    }
    this.needle.style.transform = `translateX(${(x + this.shift).toFixed(1)}px)`;
    this.dial.setAttribute('transform', `rotate(${(value * STEP).toFixed(1)})`);
    const i = clamp(Math.round(value), 0, this.stations.length - 1);
    this.knob.setAttribute('aria-valuenow', String(i));
    this.knob.setAttribute('aria-valuetext', this.stations[i].label);
  }

  private more: HTMLAnchorElement[] = [];

  /** A last entry on the scale that is no station (it doesn't turn the dial): clicking it
   * calls `fn`. Its `on` state is marked with `mark`'s look. */
  extra(label: string, href: string, fn: () => void) {
    const a = document.createElement('a');
    a.href = href;
    a.textContent = label;
    a.className = 'tuner-station tuner-extra';
    a.draggable = false;
    a.addEventListener('click', (e) => {
      if (e.metaKey || e.ctrlKey || e.shiftKey || e.button !== 0) return;
      e.preventDefault();
      if (this.dragged) return;
      fn();
    });
    this.strip.appendChild(a);
    this.more.push(a);
    return a;
  }

  /** Mark the station that is on (for screen readers and the look). */
  mark(station: number) {
    this.links.forEach((a, i) =>
      i === station ? a.setAttribute('aria-current', 'page') : a.removeAttribute('aria-current'),
    );
  }

  /** The needle's px along the window for a value, between the stations' middles. */
  private x(value: number) {
    const c = this.centres;
    const n = c.length;
    if (n === 1) return c[0];
    const i = clamp(Math.floor(value), 0, n - 2);
    const t = value - i;
    return c[i] + (c[i + 1] - c[i]) * t;
  }

  /** The other way: a px along the window to a value, a little past the ends. */
  private valueAt(px: number) {
    const c = this.centres;
    const n = c.length;
    if (px <= c[0]) return -Math.min(0.35, (c[0] - px) / (c[1] - c[0]) / 3);
    if (px >= c[n - 1]) return n - 1 + Math.min(0.35, (px - c[n - 1]) / (c[n - 1] - c[n - 2]) / 3);
    let i = 0;
    while (i < n - 2 && px > c[i + 1]) i++;
    return i + (px - c[i]) / (c[i + 1] - c[i]);
  }

  private dragged = false;
  /** A flick carries on: aim for where it was heading. */
  private let(v: number) {
    return clamp(Math.round(this.value + v * 0.12), 0, this.stations.length - 1);
  }

  private dragScale() {
    let start: { x: number; id: number } | null = null;
    let live = false;
    let last = { v: 0, t: 0 };
    let speed = 0;
    this.scale.addEventListener('pointerdown', (e) => {
      if (e.button !== 0) return;
      start = { x: e.clientX, id: e.pointerId };
      live = false;
      this.dragged = false;
    });
    this.scale.addEventListener('pointermove', (e) => {
      if (!start || e.pointerId !== start.id) return;
      if (!live && Math.abs(e.clientX - start.x) < 5) return;
      if (!live) {
        live = true;
        this.dragged = true;
        this.scale.setPointerCapture(e.pointerId);
        this.el.classList.add('turning');
        this.dragging = true;
        this.onHold();
        last = { v: this.value, t: e.timeStamp };
        speed = 0;
      }
      const box = this.scale.getBoundingClientRect();
      const v = this.valueAt(e.clientX - box.left - this.shift);
      const dt = (e.timeStamp - last.t) / 1000;
      if (dt > 0) speed = speed * 0.5 + ((v - last.v) / dt) * 0.5;
      last = { v, t: e.timeStamp };
      this.show(v);
      this.onTurn(v);
    });
    const up = (e: PointerEvent) => {
      if (!start || e.pointerId !== start.id) return;
      start = null;
      if (!live) return;
      live = false;
      this.dragging = false;
      this.el.classList.remove('turning');
      this.onTune(this.let(speed));
      // The click that follows a drag is not a pick.
      setTimeout(() => (this.dragged = false), 0);
    };
    this.scale.addEventListener('pointerup', up);
    this.scale.addEventListener('pointercancel', up);
  }

  private turnKnob() {
    let held: { id: number; angle: number; moved: number } | null = null;
    let last = { v: 0, t: 0 };
    let speed = 0;
    const angle = (e: PointerEvent) => {
      const r = this.knob.getBoundingClientRect();
      return Math.atan2(e.clientY - (r.top + r.height / 2), e.clientX - (r.left + r.width / 2));
    };
    this.knob.addEventListener('pointerdown', (e) => {
      if (e.button !== 0) return;
      held = { id: e.pointerId, angle: angle(e), moved: 0 };
      this.knob.setPointerCapture(e.pointerId);
      last = { v: this.value, t: e.timeStamp };
      speed = 0;
    });
    this.knob.addEventListener('pointermove', (e) => {
      if (!held || e.pointerId !== held.id) return;
      const a = angle(e);
      let d = a - held.angle;
      if (d > Math.PI) d -= Math.PI * 2;
      if (d < -Math.PI) d += Math.PI * 2;
      held.angle = a;
      held.moved += Math.abs(d);
      if (held.moved < 0.08) return;
      if (!this.el.classList.contains('turning')) {
        this.el.classList.add('turning');
        this.onHold();
      }
      const n = this.stations.length;
      let v = this.value + (d * 180) / Math.PI / STEP;
      // Past the ends it gets stiff.
      if (v < 0) v = this.value < 0 ? this.value + (v - this.value) * 0.3 : v * 0.3;
      if (v > n - 1)
        v = this.value > n - 1 ? this.value + (v - this.value) * 0.3 : n - 1 + (v - n + 1) * 0.3;
      v = clamp(v, -0.4, n - 0.6);
      const dt = (e.timeStamp - last.t) / 1000;
      if (dt > 0) speed = speed * 0.5 + ((v - last.v) / dt) * 0.5;
      last = { v, t: e.timeStamp };
      this.show(v);
      this.onTurn(v);
    });
    const up = (e: PointerEvent) => {
      if (!held || e.pointerId !== held.id) return;
      const turned = held.moved >= 0.08;
      held = null;
      this.el.classList.remove('turning');
      // A turn goes where it was heading; a click clicks it round to the next station.
      if (turned) this.onTune(this.let(speed));
      else this.onTune((Math.round(this.value) + 1) % this.stations.length);
    };
    this.knob.addEventListener('pointerup', up);
    this.knob.addEventListener('pointercancel', up);
  }

  private wheelSum = 0;
  private wheelAt = 0;
  private wheel(e: WheelEvent) {
    e.preventDefault();
    const d = Math.abs(e.deltaX) > Math.abs(e.deltaY) ? e.deltaX : e.deltaY;
    if (e.timeStamp - this.wheelAt > 400) this.wheelSum = 0;
    this.wheelAt = e.timeStamp;
    this.wheelSum += d;
    if (Math.abs(this.wheelSum) < 60) return;
    const step = Math.sign(this.wheelSum);
    this.wheelSum = 0;
    this.onTune(clamp(Math.round(this.value) + step, 0, this.stations.length - 1));
  }
}

/** A spring: `x` goes to `to`, with this stiffness (rad/s) and damping ratio. */
class Spring {
  x: number;
  v = 0;
  to: number;
  constructor(
    x: number,
    public w: number,
    public z: number,
  ) {
    this.x = this.to = x;
  }
  step(dt: number) {
    const a = this.w * this.w * (this.to - this.x) - 2 * this.z * this.w * this.v;
    this.v += a * dt;
    this.x += this.v * dt;
    return this.x;
  }
  get still() {
    return Math.abs(this.to - this.x) < 0.01 && Math.abs(this.v) < 0.05;
  }
}

/** The lines the gear is drawn with, one layer over the whole window. */
export class Rigging {
  readonly el: SVGSVGElement;
  constructor(host: HTMLElement) {
    const el = svg('svg', { class: 'rigging', 'aria-hidden': 'true' });
    el.style.cssText =
      'position:fixed;inset:0;width:100%;height:100%;pointer-events:none;overflow:visible;';
    host.appendChild(el);
    this.el = el;
  }
  resize() {
    this.el.setAttribute('viewBox', `0 0 ${window.innerWidth} ${window.innerHeight}`);
  }
  path(cls: string) {
    const p = svg('path', { class: cls });
    this.el.appendChild(p);
    return p;
  }
}

/**
 * The dimmer on the frame: turn it from the sun to the moon and the room dims into the
 * night. It reports every step of the turn, so the page can dim as it goes. Its twin under
 * it is the crew's colour switch (`look`): plain at one end, in colour at the other.
 */
export class Dimmer {
  readonly el: HTMLButtonElement;
  value: number;
  onChange: (value: number, settled: boolean) => void = () => {};
  private dial: SVGGElement;
  private turn: Spring;
  private held: { id: number; moved: boolean; a: number } | null = null;

  /** Where it clicks into: day and night, or (the crew's colour switch) the looks. */
  readonly stops: number;

  /** `look` makes it the crew's colour switch, four clicks round: auto (ink by day, paper
   * by night), ink, paper and colour. */
  constructor(
    host: HTMLElement,
    value = 0,
    readonly kind: 'lights' | 'look' = 'lights',
  ) {
    this.stops = kind === 'look' ? LOOK_STOPS.length : 2;
    this.value = value;
    this.turn = new Spring(value, 12, 0.5);
    const el = document.createElement('button');
    el.type = 'button';
    el.className = kind === 'lights' ? 'dimmer' : `dimmer ${kind}`;
    el.setAttribute('role', 'slider');
    el.setAttribute('aria-label', kind === 'look' ? 'Look' : 'Lights');
    el.setAttribute('aria-valuemin', '0');
    el.setAttribute('aria-valuemax', '100');
    const face = svg('svg', { viewBox: '-30 -30 60 60', 'aria-hidden': 'true' });
    // A sun at one end of the turn and a moon at the other, ticks between.
    const glyphs = svg('g', { class: 'dimmer-glyphs' });
    const at = (deg: number, r: number) => {
      const a = ((deg - 90) * Math.PI) / 180;
      return [Math.cos(a) * r, Math.sin(a) * r];
    };
    const [sx, sy] = at(-RANGE, 24);
    let sun = `M${(sx + 2.6).toFixed(2)} ${sy.toFixed(2)}A2.6 2.6 0 1 1 ${(sx - 2.6).toFixed(2)} ${sy.toFixed(2)}A2.6 2.6 0 1 1 ${(sx + 2.6).toFixed(2)} ${sy.toFixed(2)}`;
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2;
      sun += `M${(sx + Math.cos(a) * 4).toFixed(2)} ${(sy + Math.sin(a) * 4).toFixed(2)}L${(sx + Math.cos(a) * 5.4).toFixed(2)} ${(sy + Math.sin(a) * 5.4).toFixed(2)}`;
    }
    const [mx, my] = at(RANGE, 24);
    const moon = `M${(mx + 1).toFixed(2)} ${(my - 3.6).toFixed(2)}A3.8 3.8 0 1 0 ${(mx + 3.4).toFixed(2)} ${(my + 1.8).toFixed(2)}A3 3 0 0 1 ${(mx + 1).toFixed(2)} ${(my - 3.6).toFixed(2)}Z`;
    let ticks = '';
    for (let i = 1; i < 6; i++) {
      const d = -RANGE + (i / 6) * RANGE * 2;
      const [x0, y0] = at(d, 21.5);
      const [x1, y1] = at(d, 23.5);
      ticks += `M${x0.toFixed(2)} ${y0.toFixed(2)}L${x1.toFixed(2)} ${y1.toFixed(2)}`;
    }
    if (kind === 'look') {
      // A mark at each click: auto a disc half ink, half paper; ink a disc of ink; paper
      // an empty one; colour three dots of colour.
      const [ax, ay] = at(-RANGE, 24);
      const [ix, iy] = at(-RANGE / 3, 24);
      const [px, py] = at(RANGE / 3, 24);
      const half = `M${ax.toFixed(2)} ${(ay - 3.4).toFixed(2)}A3.4 3.4 0 0 0 ${ax.toFixed(2)} ${(ay + 3.4).toFixed(2)}Z`;
      glyphs.append(
        svg('circle', { cx: ax.toFixed(2), cy: ay.toFixed(2), r: '3.4', class: 'glyph-plain' }),
        svg('path', { d: half, class: 'glyph-moon' }),
        svg('circle', { cx: ix.toFixed(2), cy: iy.toFixed(2), r: '3', class: 'glyph-moon' }),
        svg('circle', { cx: px.toFixed(2), cy: py.toFixed(2), r: '3', class: 'glyph-plain' }),
        ...['#e0644f', '#e8b64a', '#4f9bd8'].map((fill, i) => {
          const a = (i / 3) * Math.PI * 2 - Math.PI / 2;
          const c = svg('circle', {
            cx: (mx + Math.cos(a) * 2.6).toFixed(2),
            cy: (my + Math.sin(a) * 2.6).toFixed(2),
            r: '2',
          });
          c.style.fill = fill;
          return c;
        }),
      );
    } else
      glyphs.append(
        svg('path', { d: sun, class: 'glyph-sun' }),
        svg('path', { d: moon, class: 'glyph-moon' }),
        svg('path', { d: ticks, class: 'glyph-ticks' }),
      );
    const dial = svg('g');
    dial.append(
      svg('circle', { r: '15', class: 'knob-rim' }),
      svg('circle', { r: '11', class: 'knob-cap' }),
      svg('path', { d: 'M0 -13V-6.5', class: 'knob-mark' }),
    );
    face.append(glyphs, dial);
    el.appendChild(face);
    host.appendChild(el);
    this.el = el;
    this.dial = dial;
    this.show();
    const angle = (e: PointerEvent) => {
      const r = el.getBoundingClientRect();
      return Math.atan2(e.clientX - (r.left + r.width / 2), -(e.clientY - (r.top + r.height / 2)));
    };
    el.addEventListener('pointerdown', (e) => {
      if (e.button !== 0) return;
      this.held = { id: e.pointerId, moved: false, a: angle(e) };
      el.setPointerCapture(e.pointerId);
    });
    el.addEventListener('pointermove', (e) => {
      if (!this.held || e.pointerId !== this.held.id) return;
      const a = angle(e);
      let d = a - this.held.a;
      if (d > Math.PI) d -= Math.PI * 2;
      if (d < -Math.PI) d += Math.PI * 2;
      this.held.a = a;
      if (!this.held.moved && Math.abs(d) < 0.03) return;
      this.held.moved = true;
      const v = clamp(this.turn.x + (d * 180) / Math.PI / (RANGE * 2), 0, 1);
      this.turn.x = this.turn.to = v;
      this.turn.v = 0;
      this.report(false);
    });
    const up = (e: PointerEvent) => {
      if (!this.held || e.pointerId !== this.held.id) return;
      const moved = this.held.moved;
      this.held = null;
      // Turned, it clicks into the nearest stop; clicked, into the next one round.
      // (Counted from where it is going, so two quick clicks go two stops.)
      if (moved) this.set(this.stop(this.at(this.turn.x)));
      else this.set(this.stop((this.at(this.turn.to) + 1) % this.stops));
    };
    el.addEventListener('pointerup', up);
    el.addEventListener('pointercancel', up);
    el.addEventListener('keydown', (e) => {
      const k = this.at(this.turn.to);
      const last = this.stops - 1;
      if (['ArrowRight', 'ArrowUp'].includes(e.key)) this.set(this.stop(Math.min(k + 1, last)));
      else if (['ArrowLeft', 'ArrowDown'].includes(e.key)) this.set(this.stop(Math.max(k - 1, 0)));
      else if (e.key === 'End') this.set(1);
      else if (e.key === 'Home') this.set(0);
      else if (e.key === 'Enter' || e.key === ' ') this.set(this.stop((k + 1) % this.stops));
      else return;
      e.preventDefault();
    });
  }

  /** How far it's turned from the middle (radians, clockwise), as it shows. */
  get angle() {
    return ((-RANGE + clamp(this.turn.x, 0, 1) * RANGE * 2) * Math.PI) / 180;
  }

  /** The stop a value is nearest to, and a stop's value. */
  at(value: number) {
    return Math.round(clamp(value, 0, 1) * (this.stops - 1));
  }

  stop(k: number) {
    return k / (this.stops - 1);
  }

  private settling = false;
  set(value: number) {
    this.glide = null;
    this.turn.to = value;
    this.settling = true;
  }

  /** Turned by itself, slowly, as a hand would (over `seconds`). */
  private glide: { from: number; to: number; t: number; len: number } | null = null;
  slide(value: number, seconds: number) {
    this.glide = { from: this.turn.x, to: value, t: 0, len: seconds };
    this.settling = false;
  }

  private report(settled: boolean) {
    this.value = clamp(this.turn.x, 0, 1);
    this.show();
    this.onChange(this.value, settled);
  }

  private show() {
    this.dial.setAttribute('transform', `rotate(${(-RANGE + this.turn.x * RANGE * 2).toFixed(1)})`);
    this.el.setAttribute('aria-valuenow', String(Math.round(this.turn.x * 100)));
    const k = this.at(this.turn.x);
    this.el.setAttribute(
      'aria-valuetext',
      this.kind === 'look' ? LOOK_STOPS[k] : k ? 'Night' : 'Day',
    );
  }

  update(dt: number) {
    if (this.held) this.glide = null;
    const g = this.glide;
    if (g) {
      g.t = Math.min(1, g.t + dt / g.len);
      const e = g.t * g.t * (3 - 2 * g.t);
      this.turn.x = this.turn.to = g.from + (g.to - g.from) * e;
      this.turn.v = 0;
      if (g.t >= 1) this.glide = null;
      this.report(g.t >= 1);
      return;
    }
    if (this.held || !this.settling) return;
    this.turn.step(dt);
    const done = this.turn.still;
    if (done) {
      this.turn.x = this.turn.to;
      this.turn.v = 0;
      this.settling = false;
    }
    this.report(done);
  }
}

/** The dimmer's turn each way from straight up (degrees). */
const RANGE = 55;
/** The colour switch's clicks, in order round. */
export const LOOK_STOPS = ['Auto', 'Ink', 'Paper', 'Colour'];
