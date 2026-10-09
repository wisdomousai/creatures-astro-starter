import {
  Group,
  Matrix4,
  type Mesh,
  MeshBasicMaterial,
  MeshStandardMaterial,
  type Object3D,
  Quaternion,
  Vector3,
} from 'three';
import { depthScale, floorDepth, project } from '@wisdomousai/creatures';
import type { Setting } from '@wisdomousai/creatures';
import { type Body, type Env, type Frame, loadModel } from '@wisdomousai/creatures';
import { dress, type LookName, type Outfit } from '@wisdomousai/creatures';
import type { Rect, View } from './sheets';
import { Spring } from '@wisdomousai/creatures';

/**
 * The monitor in the middle of the box (monitor.py in the creatures package's blender/),
 * that the pages play on. Its glass is sized to the room every frame: the corners of the
 * case sit on four bones at the glass's corners, and moving them apart stretches the
 * straight runs of the case and nothing else. The glass itself is drawn as a hole (depth
 * only, no colour), so the page under the crew's canvas shows through it, and whoever walks
 * behind the monitor is hidden by it just as they are by its case and what it sits on.
 *
 * Its case and what it sits on suit the room it is in (suit()): plain on a plinth in the white
 * box, pale oak on a cabinet in the office, walnut and gilt on a turned column in the
 * library, riveted steel on a steel post in the lab, framed in bamboo on a tree trunk in the
 * jungle. The seat reaches from the floor up to its chin however high it is raised.
 *
 * It is quietly alive: the knob turns with the tuning dial, the power light flickers while
 * a page comes up, and the camera in its top blinks now and then, and wakes when someone
 * is in front.
 *
 * On a phone it's a phone (phone.py there, `kind`): the same glass on the same four
 * corner bones, in a thin case with no seat, knobs or feet (what holds it up is the site's
 * business: Bolt). The phone's model is loaded the first time it's wanted.
 */

export type Kind = 'monitor' | 'phone';

/** From monitor.py and phone.py, in metres: the glass's half-width as built, the case at its
 * sides and over its top, the chin under it, the glass's corner radius, and how far its
 * glass sits in front of the middle. */
const SHAPES: Record<
  Kind,
  { hw: number; bezel: number; top: number; chin: number; corner: number; glassZ: number }
> = {
  monitor: { hw: 0.9, bezel: 0.12, top: 0.12, chin: 0.26, corner: 0.04, glassZ: 0.07 },
  phone: { hw: 0.36, bezel: 0.06, top: 0.1, chin: 0.08, corner: 0.07, glassZ: 0.026 },
};
/** The floor to the monitor's chin as built (the lowest it sits), and its chin (m). */
export const RISE = 0.34;
export const CHIN = SHAPES.monitor.chin;
/** A chin knob's width, about (m, as built). */
const KNOB = 0.12;
/** As high as it is raised on its seat (m). */
export const RISE_MAX = 0.95;
/** The monitor's depth front to back (m): what the box's depth is measured out in, for both. */
const THICK = 0.24;

/** The rooms it suits (monitor.py): the parts it wears in each, by their roles (the case,
 * its trim, its seat), and how big its seat is as built (m): half its width, which scales
 * with the glass's, and half its depth front to back. */
export type Suit = Setting | 'box';
const SUITS: Record<Suit, { roles: string[]; half: number; deep: number }> = {
  box: { roles: ['Case', 'Plinth', 'PlinthTrim'], half: 0.31, deep: 0.2 },
  office: { roles: ['Oak', 'OakLip', 'Cabinet', 'CabinetDoor'], half: 0.64, deep: 0.235 },
  library: { roles: ['Walnut', 'Gilt', 'Column', 'ColumnRing'], half: 0.28, deep: 0.28 },
  lab: { roles: ['Steel', 'Rivet', 'Post', 'PostSteel'], half: 0.36, deep: 0.2 },
  jungle: {
    roles: ['Bamboo', 'BambooPole', 'Lashing', 'Leaf', 'Trunk', 'TrunkRing', 'TrunkMoss'],
    half: 0.36,
    deep: 0.24,
  },
};
/** The room a part is worn in, from its role (Shell_Oak, Joint_Gilt, ...), if it's one's. */
const suitOf = (name: string) => {
  const role = name.replace(/\.\d+$/, '').split('_')[1];
  return (Object.keys(SUITS) as Suit[]).find((s) => role && SUITS[s].roles.includes(role));
};

type CornerName = 'BL' | 'BR' | 'TL' | 'TR';
const CORNERS: CornerName[] = ['BL', 'BR', 'TL', 'TR'];

/** Where the glass goes for a monitor `depth` back in the box, its glass's top at `top`
 * and `width` wide (viewport px), at `unit` px per metre on the front of the box: its
 * bottom is where the chin and its seat, `rise` (m) high, put it. */
export function glassRect(
  f: Frame,
  depth: number,
  top: number,
  width: number,
  unit: number,
  rise = RISE,
  kind: Kind = 'monitor',
) {
  const S = unit * depthScale(f, depth);
  const cx = (f.left + f.right) / 2;
  const bottom = project(f, depth, { x: cx, y: f.bottom }).y - (rise + SHAPES[kind].chin) * S;
  const h = Math.max(bottom - top, S * 0.3);
  return { x: cx - width / 2, y: bottom - h, w: width, h };
}

/** Where the glass goes for a monitor standing `depth` back with its glass's middle at x
 * (viewport px), `width` by `height`: on its seat (`rise` m) on the floor. */
export function glassOn(
  f: Frame,
  depth: number,
  x: number,
  width: number,
  height: number,
  unit: number,
  rise = RISE,
  kind: Kind = 'monitor',
) {
  const S = unit * depthScale(f, depth);
  const bottom = project(f, depth, { x, y: f.bottom }).y - (rise + SHAPES[kind].chin) * S;
  return { x: x - width / 2, y: bottom - height, w: width, h: height };
}

/** How far above the glass the case reaches (viewport px). */
export function headroom(f: Frame, depth: number, unit: number, kind: Kind = 'monitor') {
  return SHAPES[kind].top * unit * depthScale(f, depth);
}

/** A bone that turns about the model's front axis (a knob), from where it rests. */
class Turner {
  private rest: Quaternion;
  private axis = new Vector3();
  private q = new Quaternion();

  constructor(
    readonly bone: Object3D,
    model: Object3D,
  ) {
    this.rest = bone.quaternion.clone();
    // The model's front axis, in the bone's own frame.
    const own = bone.getWorldQuaternion(new Quaternion());
    const m = model.getWorldQuaternion(new Quaternion());
    this.axis.set(0, 0, 1).applyQuaternion(m).applyQuaternion(own.invert());
  }

  set(angle: number) {
    this.bone.quaternion.copy(this.rest).multiply(this.q.setFromAxisAngle(this.axis, angle));
  }
}

interface Placed {
  bone: Object3D;
  /** From the model's space into the bone's parent's (fixed: its parents never move). */
  toParent: Matrix4;
  rest: Vector3;
}

interface Rig {
  model: Object3D;
  corners: Map<CornerName, Placed>;
  /** The seat's feet, left and right: they stay on the floor, as far apart as the glass's
   * corners (none on the phone). */
  feet: Placed[];
  knobs: Turner[];
  outfit: Outfit | null;
  glass: Mesh[];
}

export class Monitor {
  readonly holder = new Group();
  /** How far back in the box it stands (0 front, 1 back wall). */
  depth = 0.5;
  /** Where its glass is in the viewport, as fitted last. */
  glass: Rect = { x: 0, y: 0, w: 0, h: 0 };
  /** Px per metre where it stands, as fitted last. */
  scale = 1;
  /** The floor to its chin (m): how high its seat reaches (or whatever holds it up). */
  rise = RISE;
  /** A monitor or a phone (see the top); the phone's loaded the first time it's asked for. */
  private worn: Kind = 'monitor';
  private rigs: Partial<Record<Kind, Rig>> = {};
  private loading = new Set<Kind>();
  private models: string;
  /** The room it's dressed for (see suit()). */
  private dressedFor: Suit = 'box';
  /** Its seat's left and right across the viewport (px), as fitted last. */
  base: [number, number] = [0, 0];
  /** Its seat on the floor, for the crew to walk round (character.ts Body), in front px. */
  readonly body: Body = {
    floorPoint: (f) => {
      const vx = (f.left + f.right) / 2;
      const cx = (this.base[0] + this.base[1]) / 2;
      return { x: vx + (cx - vx) / depthScale(f, this.depth), z: this.depth * floorDepth(f) };
    },
    footprint: (f) => ({
      x: (this.base[1] - this.base[0]) / 2 / depthScale(f, this.depth),
      // Model metres front to back are half as much of the box's depth (fit()'s sz).
      z:
        this.worn === 'phone'
          ? 0
          : SUITS[this.dressedFor].deep * (0.36 / THICK / 3) * floorDepth(f),
    }),
    stride: 0,
    // Here longer than anyone: whoever is in its way makes room.
    t: Infinity,
  };
  /** Loaded (the monitor): it can be dressed and fitted. */
  readonly ready: Promise<void>;
  private look: LookName | null = null;
  private knobTurn = [new Spring(9, 0.8), new Spring(9, 0.8)];
  private hole = new MeshBasicMaterial({ colorWrite: false, depthWrite: true });
  /** The glass when it's off: a dark screen, a little glossy. */
  private dark = new MeshStandardMaterial({ color: 0x1b1c1c, roughness: 0.32, metalness: 0.1 });
  /** On: the pages show through its glass; off, a dark screen. */
  on = true;
  /** Gone out of the room (the phone, with Bolt through the door): not drawn. */
  away = false;
  /** Tipped about its feet (radians): a waddle as it walks. */
  rock = 0;
  private time = 0;
  /** Seconds left of the power light's flicker (a page coming up). */
  private busy = 0;
  private blinkAt = 3;
  private p = new Vector3();

  /** What the knobs are turned to (radians): on the site, the lights and the look (its
   * dials are these knobs). */
  channel = 0;
  volume = 0;

  constructor(scene: Object3D, models: string, kind: Kind = 'monitor') {
    scene.add(this.holder);
    this.holder.visible = false;
    this.models = models;
    this.worn = kind;
    this.ready = this.load(kind);
  }

  /** The rig it's wearing, if that's loaded. */
  private get rig() {
    return this.rigs[this.worn] ?? null;
  }

  /** A monitor or a phone: the other's put away (and the phone loaded, the first time). */
  get kind() {
    return this.worn;
  }
  set kind(kind: Kind) {
    if (kind === this.worn) return;
    this.worn = kind;
    for (const k of Object.keys(this.rigs) as Kind[]) this.rigs[k]!.model.visible = k === kind;
    void this.load(kind);
  }

  private load(kind: Kind) {
    if (this.rigs[kind] || this.loading.has(kind)) return Promise.resolve();
    this.loading.add(kind);
    return loadModel(`${this.models}${kind}.glb`).then((model) => this.mount(kind, model));
  }

  private mount(kind: Kind, model: Object3D) {
    model.visible = kind === this.worn;
    this.holder.add(model);
    this.holder.updateMatrixWorld(true);
    const bone = (name: string) => {
      const b = model.getObjectByName(name);
      if (!b) throw new Error(`${kind}: no bone ${name}`);
      return b;
    };
    const placed = (name: string): Placed => {
      const b = bone(name);
      const toParent = b.parent!.matrixWorld.clone().invert().multiply(model.matrixWorld);
      const rest = model.worldToLocal(b.getWorldPosition(new Vector3()));
      return { bone: b, toParent, rest };
    };
    const seated = kind === 'monitor';
    this.rigs[kind] = {
      model,
      corners: new Map(CORNERS.map((name) => [name, placed(name)])),
      feet: seated ? ['footL', 'footR'].map(placed) : [],
      knobs: seated ? ['knobA', 'knobB'].map((n) => new Turner(bone(n), model)) : [],
      outfit: null,
      glass: [],
    };
    if (this.look) this.dress(this.look);
  }

  dress(look: LookName) {
    this.look = look;
    for (const rig of Object.values(this.rigs)) this.dressRig(rig, look);
    this.power(this.on);
    this.lights();
    this.suit(this.dressedFor, true);
  }

  private dressRig(rig: Rig, look: LookName) {
    const model = rig.model;
    rig.outfit?.dispose();
    rig.outfit = dress(model, look, { model: 'monitor' });
    // The glass is a hole the page shows through: it writes depth before anyone is drawn,
    // and no colour. No ink line round it either (the case's own edge is the line).
    const glass: Mesh[] = [];
    model.traverse((o) => {
      if ((o as Mesh).isMesh && o.userData.role === 'Glass' && !o.userData.outline)
        glass.push(o as Mesh);
    });
    const hulls: Object3D[] = [];
    model.traverse((o) => {
      if (o.userData.outline && glass.some((g) => (o as Mesh).geometry === g.geometry))
        hulls.push(o);
    });
    hulls.forEach((h) => h.removeFromParent());
    rig.glass = glass;
  }

  /** Dress it for a room (a section's, box-texture.ts's Setting, or the white box): that
   * room's case, trim and seat show (and their outlines, in the paper look), the rest hide. */
  suit(room: Suit, again = false) {
    if (room === this.dressedFor && !again) return;
    this.dressedFor = room;
    // (The phone has nothing it wears by the room.)
    const model = this.rigs.monitor?.model;
    if (!model) return;
    const meshes: Mesh[] = [];
    model.traverse((o) => {
      if ((o as Mesh).isMesh && !o.userData.outline) meshes.push(o as Mesh);
    });
    model.traverse((o) => {
      const own = o.userData.outline
        ? meshes.find((m) => m.geometry === (o as Mesh).geometry)
        : (o as Mesh).isMesh && o;
      const worn = own && suitOf(String(own.userData.role ?? ''));
      if (worn) o.visible = worn === room;
    });
  }

  /** Switch it on (its glass a hole the pages show through) or off (a dark screen). */
  power(on: boolean) {
    this.on = on;
    for (const g of Object.values(this.rigs).flatMap((r) => r.glass)) {
      g.material = on ? this.hole : this.dark;
      g.renderOrder = on ? -100 : 0;
    }
  }

  /** Stand it on the floor with its glass over `glass` (viewport px; see glassRect()), at
   * `unit` px per metre on the front of the box. */
  fit(f: Frame, view: View, glass: Rect, unit: number) {
    const S = unit * depthScale(f, this.depth);
    this.glass = glass;
    this.scale = S;
    const rig = this.rig;
    // (Hidden till what it's wearing is loaded.)
    this.holder.visible = !!rig && !this.away;
    if (!rig) return;
    const shape = SHAPES[this.worn];
    const cx = glass.x + glass.w / 2;
    const zb = this.rise + shape.chin;
    const floor = glass.y + glass.h + zb * S;
    // The corners where the glass's are, in metres from its feet.
    const hw = glass.w / 2 / S;
    const zt = zb + glass.h / S;
    for (const [name, c] of rig.corners) {
      this.p.set(name[1] === 'L' ? -hw : hw, name[0] === 'T' ? zt : zb, c.rest.z);
      c.bone.position.copy(this.p.applyMatrix4(c.toParent));
    }
    // The seat's feet on the floor, as far apart as the corners: it scales with the glass.
    const out = hw - rig.corners.get('BR')!.rest.x;
    for (const c of rig.feet) {
      this.p.set(c.rest.x + Math.sign(c.rest.x) * out, c.rest.y, c.rest.z);
      c.bone.position.copy(this.p.applyMatrix4(c.toParent));
    }
    const half = rig.feet.length ? (SUITS[this.dressedFor].half / shape.hw) * (glass.w / 2) : 0;
    this.base = [cx - half, cx + half];
    // At its depth among the crew, with its glass on the plane of that depth, and drawn a
    // touch larger for the camera's perspective, so it lies exactly over the page.
    const z = -this.depth * f.depth * 3;
    const sz = (f.depth * 0.36) / THICK;
    const s = (view.eye - z) / view.eye;
    const [vx, vy] = [view.width / 2, view.height / 2];
    this.holder.position.set(vx + (cx - vx) * s, -(vy + (floor - vy) * s), z - shape.glassZ * sz);
    this.holder.scale.set(S * s, S * s, sz);
    this.holder.rotation.z = this.rock;
  }

  /** The whole of it in the viewport: case and seat (or, a phone, down to the floor where
   * what holds it up stands). */
  get outer(): Rect {
    const g = this.glass;
    const S = this.scale;
    const shape = SHAPES[this.worn];
    const top = g.y - shape.top * S;
    const bottom = g.y + g.h + (this.rise + shape.chin) * S;
    return { x: g.x - shape.bezel * S, y: top, w: g.w + 2 * shape.bezel * S, h: bottom - top };
  }

  /** The underside of its chin in the viewport (px): what stands behind it shows below. */
  get under() {
    return this.glass.y + this.glass.h + SHAPES[this.worn].chin * this.scale;
  }

  /** The glass's corner radius in the viewport (px). */
  get radius() {
    return SHAPES[this.worn].corner * this.scale;
  }

  /** Is the point (viewport px) on its glass, case or seat, with something at `depth`
   * behind? */
  hides(x: number, y: number, depth: number) {
    if (depth <= this.depth) return false;
    const g = this.glass;
    const shape = SHAPES[this.worn];
    const b = shape.bezel * this.scale;
    const chin = this.under;
    if (x >= g.x - b && x <= g.x + g.w + b && y >= g.y - shape.top * this.scale && y <= chin)
      return true;
    return x >= this.base[0] && x <= this.base[1] && y > chin && y <= chin + this.rise * this.scale;
  }

  /** Where a knob is (0 the channel's, 1 the volume's) in the viewport (px), and how big
   * it looks (px across); null before it's loaded, while it's put away, or on a phone. */
  knobOnScreen(i: number, view: { width: number; height: number; eye: number }) {
    const rig = this.rig;
    if (!rig?.knobs.length || !this.holder.visible) return null;
    const p = rig.knobs[i].bone.getWorldPosition(this.p);
    const k = view.eye / (view.eye - p.z);
    return {
      x: view.width / 2 + (p.x - view.width / 2) * k,
      y: view.height / 2 + (-p.y - view.height / 2) * k,
      size: KNOB * this.scale * k,
    };
  }

  /** A page is coming up: the power light flickers. */
  busyFor(seconds: number) {
    this.busy = Math.max(this.busy, seconds);
  }

  update(dt: number, env: Env) {
    this.time += dt;
    const rig = this.rig;
    if (!rig) return;
    const turns = [this.channel, this.volume].map((to, i) => this.knobTurn[i].update(dt, to));
    rig.knobs.forEach((k, i) => k.set(-turns[i]));
    this.busy = Math.max(0, this.busy - dt);
    this.blinkAt -= dt;
    if (this.blinkAt < -0.18) this.blinkAt = 3 + Math.random() * 6;
    this.lights(env.crew.some((c) => c.state === 'here' && c.depth < this.depth));
  }

  private lights(near = false) {
    const o = this.rig?.outfit;
    if (!o) return;
    const t = this.time;
    o.dot(0, this.busy > 0 ? (Math.sin(t * 47) > 0 ? 1 : 0.25) : this.on ? 1 : 0.15);
    o.dot(1, this.blinkAt < 0 ? 1 : near ? 0.55 : 0.12);
  }

  dispose() {
    this.holder.removeFromParent();
    for (const rig of Object.values(this.rigs)) rig.outfit?.dispose();
    this.hole.dispose();
    this.dark.dispose();
  }
}
