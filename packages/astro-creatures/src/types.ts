import type { Setting } from '@wisdomousai/creatures';

/** A place in the room: a station on the tuning dial. */
export interface Station {
  key: string;
  label: string;
  href: string;
  /** The painted room it's in: 'jungle' | 'office' | 'lab', or null for the
   * plain white box. */
  room: Setting | null;
  /** The crew's name for the room's set pieces, hangings and games (home, work, about,
   * contact, creatures/birds), or null for none. */
  dress: string | null;
}

/** One of the lobby's concierges, holding up a sign. */
export interface Concierge {
  /** Who: only those who can really hold a sign (the robots with hands, the squirrel, the
   * owl). */
  name: string;
  /** Where the sign goes: a station's key, or 'clean' for the plain site. */
  to: string;
  /** Where along the floor, of the room's width (wide screen, phone). */
  at: number;
  narrow: number;
  /** A flier hovers this far down the room, of its height (wide, phone). */
  hover?: [wide: number, narrow: number];
  /** Sits up on a crate instead of standing on the floor. */
  on?: 'crate';
}

export interface Crew {
  /** Who comes by (`npx @wisdomousai/creatures list`); empty and nobody comes. */
  roster: string[];
  /** Who comes first, soon after the page is up. */
  first: string | null;
  /** How many at once. */
  max: number;
  /** Seconds between arrivals, from–to. */
  every: [number, number];
  /** Nobody comes for visitors who ask for less motion (on the clean shell). */
  respectReducedMotion: boolean;
  /** Where their files are: '' for jsDelivr, '/creatures/' served from the site itself
   * (the room always is), or your own folder or address. */
  models: string;
}

/** The integration's options: every one has a lorem-ipsum default. */
export interface Options {
  shell?: 'clean' | 'room';
  title?: string;
  description?: string;
  author?: string;
  email?: string;
  links?: { github?: string; [name: string]: string | undefined };
  nav?: { label: string; href: string }[];
  crew?: Partial<Crew>;
  stations?: Station[];
  lobby?: Concierge[];
  /** What the two shells are called where you can switch between them. */
  labels?: { clean?: string; room?: string };
}

/** The settings as the pages see them. */
export interface Config extends Required<Omit<Options, 'crew' | 'labels'>> {
  crew: Crew;
  labels: { clean: string; room: string };
}
