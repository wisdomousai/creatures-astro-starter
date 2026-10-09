import { type Door, depthScale, project } from '@wisdomousai/creatures';
import type { Character, Frame, Role } from '@wisdomousai/creatures';
import type { Crew } from '@wisdomousai/creatures';
import { glassOn } from '../components/robot/monitor';
import type { Rect } from '../components/robot/sheets';
import { Spring } from '@wisdomousai/creatures';

/**
 * Bolt holding the phone up (on a phone, where the pages play on one): he's called in if
 * he isn't here, given the part, and walks to the middle just in front of it, where he
 * stands with both arms up, the bottom of its case on his hands. He's anchored there: he
 * can't be taken hold of, and isn't sent out with the rest (character.ts). Pokes and
 * tricks he does, and is back holding it after. When the phone's put away (a wide screen)
 * he's let go, back to his own life.
 *
 * He can carry it off too (`carry`): it comes down small onto his hands, and goes with him
 * out by the door at the back (`doorway`), and he brings it back in by the same door, to the
 * middle, and up it goes to its place again. (The site here only has him hold it.)
 */

/** How far his arms go up, out from his sides (degrees), and his forearms turned in: his
 * mitts at the top corners of his head, under the phone's edge. */
const UP = 125;
const IN = -35;
/** How high his raised hands are, of his height: the phone's case rests on them. */
export const HANDS = 0.92;
/** The phone carried: its glass's width, of his height, and its height, of its width. */
const SMALL = 0.8;
const TALL = 1.7;

/** Where the phone stands and how big. */
export interface Placing {
  glass: Rect;
  depth: number;
  unit: number;
  rise: number;
}

export function holder(crew: Crew, depth: number, doorway: () => Door | null) {
  let bolt: Character | null = null;
  let calling = false;
  /** It goes with him (to the library and back), small on his hands; and it's gone out of
   * the room with him. */
  let carrying = false;
  let away = false;
  const shrink = new Spring(1.2, 1, 0);

  const role: Role = {
    posture: 'stand',
    facing: 0,
    ending: true,
    pose: (t) => {
      if (!bolt) return;
      const a = Math.min(1, t / 0.6);
      for (const [s, side] of [
        ['L', 1],
        ['R', -1],
      ] as const) {
        bolt.puppet.add(`upper_arm.${s}`, 0, 0, side * UP * a);
        bolt.puppet.add(`forearm.${s}`, 0, 0, side * IN * a);
      }
    },
  };

  function letGo() {
    carrying = away = false;
    if (!bolt) return;
    bolt.anchored = false;
    if (bolt.role === role) bolt.release();
    bolt = null;
  }

  /** Bolt, given the part and anchored. */
  function take(m: Character) {
    bolt = m;
    if (m.role !== role) m.direct(role);
    m.anchored = true;
  }

  /** Called in: by the door at the back, with it, coming back from the library; else as he
   * comes. Given the part on his way in, so he stays on his feet (he'd take off). */
  function call(s: number) {
    calling = true;
    const door = away ? doorway() : null;
    void crew
      .call('bolt', door ? { door } : { edge: 'bottom', s })
      .then((c) => {
        if (c) take(c);
      })
      .finally(() => (calling = false));
  }

  /** The phone on his hands, carried: small, just behind him. */
  function onHands(b: Character, f: Frame, unit: number, room: Placing): Placing {
    const d = b.depth + 0.01;
    const foot = project(f, b.depth, { x: b.s, y: f.bottom });
    const hands = foot.y - HANDS * b.heightPx;
    const w = SMALL * b.heightPx;
    // Its case in proportion to its glass, as it is in its place.
    const u = (unit * (w / room.glass.w) * depthScale(f, room.depth)) / depthScale(f, d);
    const S = u * depthScale(f, d);
    const rise = (project(f, d, { x: foot.x, y: f.bottom }).y - hands) / S;
    return { glass: glassOn(f, d, foot.x, w, w * TALL, u, rise, 'phone'), depth: d, unit: u, rise };
  }

  return {
    /** Who's holding it, if anyone is. */
    get bolt() {
      return bolt;
    },
    /** It's in its place, the right size (not carried, nor on its way back to it). */
    get settled() {
      return !carrying && !away && shrink.y < 0.01;
    },
    /** Gone out of the room with him. */
    get away() {
      return away;
    },
    /**
     * Each frame: what's wanted of him (to hold the phone up; to carry it off; nothing,
     * there being no phone), its middle across the front of the box (px),
     * and where it stands in its place, at `unit` px per metre. Returns where it is now.
     */
    tick(
      dt: number,
      want: 'hold' | 'carry' | 'none',
      f: Frame,
      x: number,
      unit: number,
      room: Placing,
    ): Placing {
      if (want === 'none') {
        letGo();
        shrink.snap(0);
        return room;
      }
      if (bolt?.state === 'gone') {
        bolt = null;
        if (carrying) away = true;
      }
      if (want === 'carry') {
        // (With no him, it's gone already.)
        carrying = true;
        if (!bolt) away = true;
      } else if (!bolt) {
        const m = crew.members.get('bolt');
        if (m?.state === 'here' || (m?.state === 'entering' && m.role === role)) take(m);
        else if ((!m || m.state === 'gone') && !calling) call(x);
      }
      if (bolt) {
        if (bolt.role !== role) bolt.direct(role);
        if (want === 'hold' && bolt.state === 'here') {
          bolt.walkTo(x, depth);
          if (bolt.depth < 0.97) away = false;
          // Back in place with it: up it goes.
          if (carrying && bolt.there) carrying = false;
        }
      }
      const k = Math.min(1, Math.max(0, shrink.update(dt, carrying ? 1 : 0)));
      if (k < 0.001 || !bolt) return room;
      // (Through the doorway, or not yet in through it: out of sight.)
      if (bolt.depth > 0.97) away = true;
      const to = onHands(bolt, f, unit, room);
      const mix = (a: number, b: number) => a + (b - a) * k;
      return {
        glass: {
          x: mix(room.glass.x, to.glass.x),
          y: mix(room.glass.y, to.glass.y),
          w: mix(room.glass.w, to.glass.w),
          h: mix(room.glass.h, to.glass.h),
        },
        depth: mix(room.depth, to.depth),
        unit: mix(room.unit, to.unit),
        rise: mix(room.rise, to.rise),
      };
    },
  };
}
