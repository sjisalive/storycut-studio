// Audio plan shared by live preview and export: music (looped, faded, ducked
// under speech), per-scene voiceovers and speaker-bite sound.
import type { Project } from '../types';
import { getAudioBuffer, cachedAudio } from '../media';
import { timeline } from '../render/engine';
import { normaliseLoudness } from './loudness';

export interface PlanClip { mediaId: string; at: number; offset: number; dur: number; speech: boolean }
export interface AudioPlan { clips: PlanClip[]; musicId?: string; total: number; speech: [number, number][] }

export function buildPlan(p: Project): AudioPlan {
  const { starts, total } = timeline(p);
  const clips: PlanClip[] = [];
  p.scenes.forEach((s, i) => {
    if (s.voiceId) {
      const b = cachedAudio(s.voiceId);
      const dur = Math.min(b?.duration ?? s.duration, total - starts[i]);
      clips.push({ mediaId: s.voiceId, at: starts[i] + 0.15, offset: 0, dur: Math.max(0, dur - 0.15), speech: true });
    }
    if (s.useClipAudio && s.mediaIds[0]) {
      clips.push({ mediaId: s.mediaIds[0], at: starts[i], offset: s.clipIn ?? 0, dur: s.duration, speech: true });
    }
  });
  const speech: [number, number][] = [];
  for (const c of clips.filter((c) => c.speech).sort((a, b) => a.at - b.at)) {
    const last = speech[speech.length - 1];
    if (last && c.at <= last[1] + 0.6) last[1] = Math.max(last[1], c.at + c.dur);
    else speech.push([c.at, c.at + c.dur]);
  }
  return { clips, musicId: p.musicId, total, speech };
}

export async function preloadAudio(p: Project) {
  const ids = new Set<string>();
  if (p.musicId) ids.add(p.musicId);
  for (const s of p.scenes) {
    if (s.voiceId) ids.add(s.voiceId);
    if (s.useClipAudio && s.mediaIds[0]) ids.add(s.mediaIds[0]);
  }
  await Promise.all([...ids].map((id) => getAudioBuffer(id)));
}

/** Music level at time t (before master volume). */
export function musicEnvelope(plan: AudioPlan, t: number, duck: number) {
  let g = 1;
  for (const [a, b] of plan.speech) {
    const ramp = 0.35;
    if (t >= a - ramp && t <= b + ramp) {
      const k = t < a ? (a - t) / ramp : t > b ? (t - b) / ramp : 0;
      g = Math.min(g, duck + (1 - duck) * Math.min(1, k));
    }
  }
  if (t < 0.6) g *= t / 0.6;
  const tail = plan.total - t;
  if (tail < 2.2) g *= Math.max(0, tail / 2.2);
  return g;
}

/**
 * Schedule everything from `from` seconds of the video onwards, starting at
 * context time `when`. Returns the nodes so live playback can stop them.
 */
export function schedule(ctx: BaseAudioContext, dest: AudioNode, p: Project, plan: AudioPlan, from: number, when: number, opts: { speechOnly?: boolean } = {}) {
  const nodes: AudioScheduledSourceNode[] = [];
  const remain = plan.total - from;
  if (remain <= 0) return nodes;
  if (!opts.speechOnly && plan.musicId) {
    const buf = cachedAudio(plan.musicId);
    if (buf) {
      const src = ctx.createBufferSource();
      src.buffer = buf;
      src.loop = true;
      const g = ctx.createGain();
      const vol = p.musicVolume;
      const step = 0.05;
      g.gain.setValueAtTime(vol * musicEnvelope(plan, from, p.duckLevel), when);
      for (let t = from + step; t <= plan.total + 1e-6; t += step) {
        g.gain.linearRampToValueAtTime(vol * musicEnvelope(plan, t, p.duckLevel), when + (t - from));
      }
      src.connect(g).connect(dest);
      src.start(when, from % buf.duration);
      src.stop(when + remain);
      nodes.push(src);
    }
  }
  for (const c of plan.clips) {
    const end = c.at + c.dur;
    if (end <= from) continue;
    const buf = cachedAudio(c.mediaId);
    if (!buf) continue;
    const skip = Math.max(0, from - c.at);
    const offset = c.offset + skip;
    if (offset >= buf.duration) continue;
    const dur = Math.min(c.dur - skip, buf.duration - offset);
    if (dur <= 0.01) continue;
    const src = ctx.createBufferSource();
    src.buffer = buf;
    const g = ctx.createGain();
    const start = when + Math.max(0, c.at - from);
    const f = 0.06;
    g.gain.setValueAtTime(skip > 0 ? 1 : 0, start);
    if (!skip) g.gain.linearRampToValueAtTime(1, start + f);
    g.gain.setValueAtTime(1, start + Math.max(f, dur - f));
    g.gain.linearRampToValueAtTime(0, start + dur);
    src.connect(g).connect(dest);
    src.start(start, offset, dur);
    nodes.push(src);
  }
  return nodes;
}

/** Render the whole soundtrack offline (export, captions). */
export async function renderMix(p: Project, sampleRate = 48000, opts: { speechOnly?: boolean; channels?: number; normalise?: boolean } = {}) {
  await preloadAudio(p);
  const plan = buildPlan(p);
  const channels = opts.channels ?? 2;
  const len = Math.max(1, Math.ceil(plan.total * sampleRate));
  const ctx = new OfflineAudioContext(channels, len, sampleRate);
  schedule(ctx, ctx.destination, p, plan, 0, 0, { speechOnly: opts.speechOnly });
  const buf = await ctx.startRendering();
  if (opts.normalise !== false && !opts.speechOnly) normaliseLoudness(buf, -14);
  return buf;
}

export function hasAnyAudio(p: Project) {
  return !!p.musicId || p.scenes.some((s) => s.voiceId || s.useClipAudio);
}
