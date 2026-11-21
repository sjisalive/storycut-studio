// Audio plan shared by live preview and export. Everything plays in parallel:
// clip sound from the video track, per-scene voiceovers, and any number of
// music / voice / sound items on the audio tracks — each with its own volume
// and fades. Music marked "duck" dips automatically under speech.
import type { Project } from '../types';
import { getAudioBuffer, cachedAudio } from '../media';
import { timeline, defaultIn } from '../render/engine';
import { normaliseLoudness } from './loudness';

export interface PlanClip {
  mediaId: string; at: number; offset: number; dur: number; rate: number;
  volume: number; fadeIn: number; fadeOut: number; loop: boolean;
  speech: boolean; duck: boolean; fromScene?: boolean;
}
export interface AudioPlan { clips: PlanClip[]; total: number; speech: [number, number][]; duckLevel: number }

export function buildPlan(p: Project): AudioPlan {
  const { starts, total } = timeline(p);
  const media = new Map(p.media.map((m) => [m.id, m]));
  const clips: PlanClip[] = [];
  p.scenes.forEach((s, i) => {
    if (s.voiceId) {
      const b = cachedAudio(s.voiceId);
      const dur = Math.min(b?.duration ?? s.duration, total - starts[i]);
      clips.push({ mediaId: s.voiceId, at: starts[i] + 0.15, offset: 0, dur: Math.max(0, dur - 0.15), rate: 1, volume: 1, fadeIn: 0.05, fadeOut: 0.1, loop: false, speech: true, duck: false, fromScene: true });
    }
    const clipId = s.mediaIds[0];
    if (s.useClipAudio && !s.muted && clipId && media.get(clipId)?.kind === 'video') {
      const rate = s.speed ?? 1;
      clips.push({
        mediaId: clipId, at: starts[i], offset: s.clipIn ?? defaultIn(media.get(clipId)), dur: s.duration, rate,
        volume: s.volume ?? 1, fadeIn: Math.max(0.04, s.fadeIn ?? 0), fadeOut: Math.max(0.04, s.fadeOut ?? 0), loop: false,
        speech: s.duck ?? s.kind === 'speaker', duck: false, fromScene: true,
      });
    }
  });
  for (const a of p.audio ?? []) {
    const end = a.toEnd ? total : Math.min(total, a.at + a.dur);
    if (end <= a.at) continue;
    clips.push({
      mediaId: a.mediaId, at: a.at, offset: a.offset, dur: end - a.at, rate: 1, volume: a.volume,
      fadeIn: a.fadeIn, fadeOut: a.fadeOut, loop: !!a.loop, speech: a.role === 'voice', duck: a.role === 'music' && a.duck !== false,
    });
  }
  const speech: [number, number][] = [];
  for (const c of clips.filter((c) => c.speech).sort((a, b) => a.at - b.at)) {
    const last = speech[speech.length - 1];
    if (last && c.at <= last[1] + 0.6) last[1] = Math.max(last[1], c.at + c.dur);
    else speech.push([c.at, c.at + c.dur]);
  }
  return { clips, total, speech, duckLevel: p.duckLevel ?? 0.18 };
}

export async function preloadAudio(p: Project) {
  const plan = buildPlan(p);
  await Promise.all([...new Set(plan.clips.map((c) => c.mediaId))].map((id) => getAudioBuffer(id)));
}

/** Level of one item at timeline time t: fades, plus ducking for music. */
function envelope(plan: AudioPlan, c: PlanClip, t: number) {
  let g = c.volume;
  const lt = t - c.at;
  if (c.fadeIn > 0 && lt < c.fadeIn) g *= Math.max(0, lt / c.fadeIn);
  const tail = c.at + c.dur - t;
  if (c.fadeOut > 0 && tail < c.fadeOut) g *= Math.max(0, tail / c.fadeOut);
  if (c.duck) {
    let d = 1;
    for (const [a, b] of plan.speech) {
      const ramp = 0.35;
      if (t >= a - ramp && t <= b + ramp) {
        const k = t < a ? (a - t) / ramp : t > b ? (t - b) / ramp : 0;
        d = Math.min(d, plan.duckLevel + (1 - plan.duckLevel) * Math.min(1, k));
      }
    }
    g *= d;
  }
  return g;
}

/**
 * Schedule everything from `from` seconds of the video onwards, starting at
 * context time `when`. Returns the nodes so live playback can stop them.
 */
export function schedule(ctx: BaseAudioContext, dest: AudioNode, p: Project, plan: AudioPlan, from: number, when: number, opts: { speechOnly?: boolean } = {}) {
  const nodes: AudioScheduledSourceNode[] = [];
  for (const c of plan.clips) {
    if (opts.speechOnly && !c.speech) continue;
    const end = c.at + c.dur;
    if (end <= from) continue;
    const buf = cachedAudio(c.mediaId);
    if (!buf) continue;
    const skip = Math.max(0, from - c.at); // timeline seconds already passed
    let offset = c.offset + skip * c.rate;
    if (c.loop) offset = offset % buf.duration;
    else if (offset >= buf.duration) continue;
    const playDur = c.loop ? c.dur - skip : Math.min(c.dur - skip, (buf.duration - offset) / c.rate);
    if (playDur <= 0.01) continue;
    const src = ctx.createBufferSource();
    src.buffer = buf;
    src.loop = c.loop;
    src.playbackRate.value = c.rate;
    const g = ctx.createGain();
    const start = when + Math.max(0, c.at - from);
    const t0 = Math.max(from, c.at);
    const step = 0.05;
    g.gain.setValueAtTime(envelope(plan, c, t0), start);
    const needsCurve = c.duck || c.fadeIn > 0 || c.fadeOut > 0;
    if (needsCurve) {
      for (let t = t0 + step; t <= t0 + playDur + 1e-6; t += step) g.gain.linearRampToValueAtTime(envelope(plan, c, t), when + (t - from));
    }
    src.connect(g).connect(dest);
    if (c.loop) { src.start(start, offset); src.stop(start + playDur); }
    else src.start(start, offset, playDur * c.rate);
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
  return buildPlan(p).clips.length > 0;
}
