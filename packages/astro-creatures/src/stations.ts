import { site } from './site';

export type { Concierge, Station } from './types';

/**
 * The places in the room (src/play): the stations on the tuning dial, in order, each with the
 * painted room it's in and how the crew dress that room. Home is the lobby, where the
 * concierges hold up signs for the places (`LOBBY`). Both come from the integration's
 * `stations` and `lobby` options.
 */
export const STATIONS = site.stations;
export const LOBBY = site.lobby;

/** What the two shells are called on the dial, on the owl's sign and in the footer. */
export const MODES = site.labels;
