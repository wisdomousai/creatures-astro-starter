import type { Crew } from '@wisdomousai/creatures';

/** Pixels drawn at most, all told: about a big screen's worth (every pixel of a 5K screen,
 * smoothed, is more than most graphics can draw sixty times a second, and the crew's
 * canvas covers the whole window). */
const PIXELS = 4e6;
/** Frames slower than this (ms) and it's drawn less sharp; quicker than this, sharper. */
const SLOW = 1000 / 40;
const QUICK = 1000 / 54;

/**
 * How sharp the crew's canvas is drawn: the screen's own pixels, up to PIXELS in all, and
 * less while frames are slow (sharper again once they're quick, but never back to a level
 * that was just too slow). The outlines keep their width whatever it is: they're set in
 * pixels of the buffer over its size, and the ratio cancels.
 */
export class Sharpness {
  private scale = 1;
  private ceiling = 1;
  private last = 0;
  private times: number[] = [];
  private raised = -Infinity;

  constructor(private crew: Crew) {
    const stage = crew.stage;
    // The stage sets the screen's own ratio on every resize: this one's goes over it.
    const resize = stage.resize.bind(stage);
    stage.resize = (width, height) => {
      resize(width, height);
      this.fit();
    };
    this.fit();
  }

  /** Just after the stage's own resize, which set the ratio it would have (the screen's, up
   * to 2, less on a phone): no more than that, nor than PIXELS allows. */
  private fit() {
    const { renderer, width, height } = this.crew.stage;
    const own = renderer.getPixelRatio();
    const ratio = Math.min(own, Math.sqrt(PIXELS / (width * height))) * this.scale;
    if (Math.abs(own - ratio) > 1e-3) {
      renderer.setPixelRatio(ratio);
      renderer.setSize(width, height, false);
    }
    this.times.length = 0;
  }

  /** Every frame. */
  frame(now = performance.now()) {
    const dt = now - this.last;
    this.last = now;
    // (Back from another tab, or a hitch while something loads: start counting again.)
    if (dt > 250) return void (this.times.length = 0);
    this.times.push(dt);
    const n = this.times.length;
    const mean = (k: number) => this.times.slice(-k).reduce((a, b) => a + b, 0) / k;
    if (n >= 30 && this.scale > 0.5 && mean(30) > SLOW) {
      // Too slow just after it was made sharper: that's as sharp as it goes.
      if (now - this.raised < 5000) this.ceiling = this.scale - 0.01;
      this.scale = Math.max(0.5, this.scale * 0.8);
      this.refit();
    } else if (n >= 150 && this.scale / 0.8 <= this.ceiling + 1e-6 && mean(150) < QUICK) {
      this.scale /= 0.8;
      this.raised = now;
      this.refit();
    } else if (n >= 150) this.times.splice(0, n - 150);
  }

  /** The stage resized as it is (its own ratio again), then fitted. */
  private refit() {
    const { stage } = this.crew;
    stage.resize(stage.width, stage.height);
  }
}
