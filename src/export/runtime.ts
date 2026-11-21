// Runtimes that feed media frames to the renderer.
import type { Project } from '../types';
import { getVideoEl, getVisual, seekVideo } from '../media';
import { renderFrame, type Runtime } from '../render/engine';

/** Live playback runtime: keeps <video> elements roughly in sync with the playhead. */
export class LiveRuntime implements Runtime {
  overflow = new Set<string>();
  layers: HTMLCanvasElement[] = [];
  playing = false;
  private touched = new Set<string>();

  visual(id: string | undefined, time?: number) {
    if (!id) return null;
    if (time !== undefined) {
      const v = getVideoEl(id);
      if (v) {
        this.touched.add(id);
        const drift = Math.abs(v.currentTime - time);
        if (this.playing) {
          if (drift > 0.3) v.currentTime = time;
          if (v.paused) v.play().catch(() => {});
        } else {
          if (!v.paused) v.pause();
          if (drift > 0.04 && !v.seeking) v.currentTime = time;
        }
      }
    }
    return getVisual(id);
  }
  /** Pause any video that the last frame did not use. */
  endFrame() {
    for (const id of this.lastUsed) if (!this.touched.has(id)) getVideoEl(id)?.pause();
    this.lastUsed = this.touched;
    this.touched = new Set();
  }
  private lastUsed = new Set<string>();
  stopAll() { for (const id of this.lastUsed) getVideoEl(id)?.pause(); }
}

/** Frame-exact runtime for export: a dry run collects wanted video times, which are then seeked. */
export class ExactRuntime implements Runtime {
  overflow = new Set<string>();
  layers: HTMLCanvasElement[] = [];
  private dryCtx = (() => { const c = document.createElement('canvas'); c.width = 8; c.height = 8; return c.getContext('2d')!; })();
  private wants = new Map<string, number>();
  private dryLayers: HTMLCanvasElement[] = [];
  private collecting = false;

  visual(id: string | undefined, time?: number) {
    if (!id) return null;
    if (this.collecting && time !== undefined) this.wants.set(id, time);
    return getVisual(id);
  }

  async draw(ctx: CanvasRenderingContext2D, p: Project, t: number, W: number, H: number) {
    this.wants.clear();
    this.collecting = true;
    // Video times do not depend on size, so the dry run is drawn tiny (cheap).
    const realLayers = this.layers;
    this.layers = this.dryLayers;
    renderFrame(this.dryCtx, p, t, 32, Math.max(8, Math.round((32 * H) / W)), this);
    this.layers = realLayers;
    this.collecting = false;
    for (const [id, time] of this.wants) await seekVideo(id, time);
    renderFrame(ctx, p, t, W, H, this);
  }
}
