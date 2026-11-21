// Pure editing operations on a project: split, delete a part (ripple),
// trim, merge clips, cut on beats, detach sound, music helpers.
import type { AudioItem, FrameDesign, GridCell, GridLayout, MediaItem, Overlay, Project, Scene } from './types';
import { defaultIn, gridCount, timeline, OVERLAY_SIZE } from './render/engine';
import { uid } from './util';

const EPS = 0.05;

/** Bring older projects up to date. */
export function migrate(p: Project): Project {
  let q: Project = { ...p, overlays: p.overlays ?? [], audio: p.audio ?? [] };
  if (q.musicId && !q.audio.some((a) => a.role === 'music')) {
    q = { ...q, audio: [...q.audio, musicItem(q.musicId, q.musicVolume ?? 0.8)] };
  }
  q.musicId = undefined;
  return q;
}

export function musicItem(mediaId: string, volume = 0.8): AudioItem {
  return { id: uid('a'), mediaId, role: 'music', at: 0, offset: 0, dur: 30, toEnd: true, loop: true, volume, fadeIn: 0.6, fadeOut: 2.2, duck: true };
}

/** Replace the main (full-length) music with another file, or remove it. */
export function setMusic(p: Project, mediaId: string | undefined): Project {
  const old = p.audio.find((a) => a.role === 'music' && a.toEnd);
  const rest = p.audio.filter((a) => a !== old);
  if (!mediaId) return { ...p, audio: rest };
  return { ...p, audio: [...rest, { ...(old ?? musicItem(mediaId)), mediaId, offset: 0 }] };
}
export const mainMusic = (p: Project) => p.audio.find((a) => a.role === 'music' && a.toEnd) ?? p.audio.find((a) => a.role === 'music');

export const itemEnd = (a: AudioItem, total: number) => (a.toEnd ? total : a.at + a.dur);

export function sceneAt(p: Project, t: number) {
  const { starts } = timeline(p);
  for (let i = 0; i < p.scenes.length; i++) if (t >= starts[i] && t < starts[i] + p.scenes[i].duration) return { i, start: starts[i], local: t - starts[i] };
  return null;
}

const effIn = (s: Scene, media: MediaItem[]) => s.clipIn ?? defaultIn(media.find((m) => m.id === s.mediaIds[0]));

/** Two pieces of one scene at `local` seconds into it. */
function cutScene(s: Scene, local: number, media: MediaItem[]): [Scene, Scene] {
  const rate = s.speed ?? 1;
  const a: Scene = { ...s, duration: local, fadeOut: 0, transition: 'cut' };
  const b: Scene = { ...structuredClone(s), id: uid('s'), duration: s.duration - local, clipIn: effIn(s, media) + local * rate, fadeIn: 0, voiceId: undefined };
  if (b.cells) b.cells = b.cells.map((c) => ({ ...c, clipIn: c.clipIn + local * rate }));
  return [a, b];
}

/** Split the scene under time t. Returns null if t is on an edge. */
export function splitAt(p: Project, t: number): Project | null {
  const hit = sceneAt(p, t);
  if (!hit || hit.local < EPS || p.scenes[hit.i].duration - hit.local < EPS) return null;
  const s = p.scenes[hit.i];
  if (s.kind === 'montage') return null;
  const [a, b] = cutScene(s, hit.local, p.media);
  const scenes = [...p.scenes];
  scenes.splice(hit.i, 1, a, b);
  return { ...p, scenes };
}

function shiftTimed<T extends { at: number; dur: number }>(items: T[], a: number, b: number, total: number, trimStart: (x: T, by: number) => T): T[] {
  const gap = b - a;
  const out: T[] = [];
  for (const x of items) {
    const s = x.at, e = (x as any).toEnd ? total : x.at + x.dur;
    if (e <= a) { out.push(x); continue; }
    if (s >= b) { out.push({ ...x, at: s - gap }); continue; }
    if (s >= a && e <= b) continue; // fully inside: removed
    if (s < a && e > b) { out.push({ ...x, dur: (x as any).toEnd ? x.dur : x.dur - gap }); continue; }
    if (s < a) { out.push({ ...x, dur: (x as any).toEnd ? x.dur : a - s }); continue; }
    // starts inside, ends after
    out.push(trimStart({ ...x, at: a, dur: (x as any).toEnd ? x.dur : e - b }, b - s));
  }
  return out;
}

/** Delete the part between a and b on every track and close the gap. */
export function deleteRange(p: Project, a: number, b: number): Project {
  const { starts, total } = timeline(p);
  a = Math.max(0, a); b = Math.min(total, b);
  if (b - a < 0.02) return p;
  const scenes: Scene[] = [];
  p.scenes.forEach((s, i) => {
    const s0 = starts[i], s1 = s0 + s.duration;
    if (s1 <= a + 1e-6 || s0 >= b - 1e-6) { scenes.push(s); return; }
    if (s0 >= a && s1 <= b) return;
    if (s0 < a && s1 > b) {
      const [left, rest] = cutScene(s, a - s0, p.media);
      const [, right] = cutScene(rest, b - a, p.media);
      scenes.push(left, right);
      return;
    }
    if (s0 < a) { scenes.push(cutScene(s, a - s0, p.media)[0]); return; }
    scenes.push(cutScene(s, b - s0, p.media)[1]);
  });
  const overlays = shiftTimed<Overlay>(p.overlays, a, b, total, (x) => x);
  const audio = shiftTimed<AudioItem>(p.audio, a, b, total, (x, by) => ({ ...x, offset: x.offset + by }));
  const captions = p.captions
    .filter((c) => !(c.start >= a && c.end <= b))
    .map((c) => (c.start >= b ? { ...c, start: c.start - (b - a), end: c.end - (b - a), words: c.words?.map((w) => ({ ...w, t0: w.t0 - (b - a), t1: w.t1 - (b - a) })) } : c));
  return { ...p, scenes, overlays, audio, captions, rangeIn: undefined, rangeOut: undefined };
}

/** Keep only the part between a and b. */
export function keepRange(p: Project, a: number, b: number): Project {
  const { total } = timeline(p);
  let q = deleteRange(p, b, total);
  q = deleteRange(q, 0, a);
  return q;
}

/** Join a clip with the next one if they are consecutive parts of the same video. */
export function joinNext(p: Project, sceneId: string): Project | null {
  const i = p.scenes.findIndex((s) => s.id === sceneId);
  const s = p.scenes[i], n = p.scenes[i + 1];
  if (!s || !n || s.mediaIds[0] !== n.mediaIds[0] || s.kind !== n.kind || (s.speed ?? 1) !== (n.speed ?? 1)) return null;
  const expected = effIn(s, p.media) + s.duration * (s.speed ?? 1);
  if (Math.abs(effIn(n, p.media) - expected) > 0.12 && p.media.find((m) => m.id === s.mediaIds[0])?.kind === 'video') return null;
  const merged: Scene = { ...s, duration: s.duration + n.duration, fadeOut: n.fadeOut, transition: n.transition };
  const scenes = [...p.scenes];
  scenes.splice(i, 2, merged);
  return { ...p, scenes };
}

const ASPECT_RATIO: Record<string, number> = { '16:9': 16 / 9, '9:16': 9 / 16, '1:1': 1, '4:5': 0.8 };
const mismatch = (p: Project, m: MediaItem) => {
  if (!m.width || !m.height) return false;
  const r = m.width / m.height, t = ASPECT_RATIO[p.aspect] ?? 1;
  return Math.max(r / t, t / r) > 1.3;
};

/** Add videos / photos to the video track (merge) at index (default: end). */
export function addClips(p: Project, ids: string[], at?: number): Project {
  const items = ids.map((id) => p.media.find((m) => m.id === id)).filter((m): m is MediaItem => !!m && m.status === 'ready' && m.kind !== 'audio');
  const add: Scene[] = items.map((m) => ({
    id: uid('s'), kind: 'moment', duration: m.kind === 'video' ? Math.max(0.5, Math.round(m.duration * 100) / 100) : 3,
    transition: 'cut', texts: {}, mediaIds: [m.id], clipIn: 0, useClipAudio: m.kind === 'video' && !!m.hasAudio, volume: 1, speed: 1,
    fit: mismatch(p, m) ? 'fit' : undefined,
  }));
  const scenes = [...p.scenes];
  scenes.splice(at ?? scenes.length, 0, ...add);
  return { ...p, scenes };
}

/** Change a clip's length from its start or end edge (trim). */
export function trimScene(p: Project, sceneId: string, edge: 'start' | 'end', newDur: number): Project {
  return {
    ...p,
    scenes: p.scenes.map((s) => {
      if (s.id !== sceneId) return s;
      const m = p.media.find((x) => x.id === s.mediaIds[0]);
      const rate = s.speed ?? 1;
      let d = Math.max(0.3, newDur);
      if (edge === 'end') {
        if (m?.kind === 'video' && s.kind === 'moment') d = Math.min(d, (m.duration - effIn(s, p.media)) / rate);
        return { ...s, duration: Math.round(d * 100) / 100 };
      }
      if (s.cells) {
        const shift = (s.duration - d) * rate;
        return { ...s, duration: Math.round(d * 100) / 100, cells: s.cells.map((c) => ({ ...c, clipIn: Math.max(0, c.clipIn + shift) })) };
      }
      let inT = effIn(s, p.media) + (s.duration - d) * rate;
      if (m?.kind === 'video') { if (inT < 0) { d += inT / rate; inT = 0; } }
      return { ...s, duration: Math.round(d * 100) / 100, clipIn: Math.max(0, inT) };
    }),
  };
}

/** Cut the chosen scenes on every Nth beat of the music. */
export function cutOnBeats(p: Project, sceneIds: string[], everyN: number): { project: Project; cuts: number } {
  const { starts } = timeline(p);
  const times: number[] = [];
  p.scenes.forEach((s, i) => {
    if (!sceneIds.includes(s.id) || s.kind === 'montage') return;
    const inside = p.beats.filter((b) => b > starts[i] + 0.25 && b < starts[i] + s.duration - 0.25);
    inside.forEach((b, k) => { if (k % everyN === everyN - 1 || everyN === 1) times.push(b); });
  });
  let q = p;
  for (const t of times) q = splitAt(q, t) ?? q;
  return { project: q, cuts: times.length };
}

/** Beat montage: fill the video track with short pieces of the chosen clips, one per N beats. */
export function beatMontage(p: Project, ids: string[], everyN: number, length: number): Project {
  const clips = ids.map((id) => p.media.find((m) => m.id === id)).filter((m): m is MediaItem => !!m && m.kind !== 'audio' && m.status === 'ready');
  if (!clips.length || p.beats.length < 2) return p;
  const beats = p.beats.filter((b) => b <= length + 0.01);
  const marks = [0, ...beats.filter((_, k) => k % everyN === everyN - 1 || everyN === 1), length].filter((v, i, arr) => i === 0 || v - arr[i - 1] > 0.3);
  const scenes: Scene[] = [];
  const used = new Map<string, number>();
  for (let k = 0; k < marks.length - 1; k++) {
    const m = clips[k % clips.length];
    const d = marks[k + 1] - marks[k];
    const prev = used.get(m.id) ?? 0;
    let inT = m.kind === 'video' ? prev : 0;
    if (m.kind === 'video' && inT + d > m.duration) inT = 0;
    used.set(m.id, inT + d);
    scenes.push({ id: uid('s'), kind: 'moment', duration: Math.round(d * 1000) / 1000, transition: 'cut', texts: {}, mediaIds: [m.id], clipIn: inT, useClipAudio: false, speed: 1 });
  }
  return { ...p, scenes };
}

/** Move a clip's own sound onto the voice/sound track so it can be edited separately. */
export function detachAudio(p: Project, sceneId: string): Project | null {
  const { starts } = timeline(p);
  const i = p.scenes.findIndex((s) => s.id === sceneId);
  const s = p.scenes[i];
  const m = p.media.find((x) => x.id === s?.mediaIds[0]);
  if (!s || !m || m.kind !== 'video' || !m.hasAudio || (s.speed ?? 1) !== 1) return null;
  const item: AudioItem = { id: uid('a'), mediaId: m.id, role: 'sfx', at: starts[i], offset: effIn(s, p.media), dur: s.duration, volume: s.volume ?? 1, fadeIn: 0.04, fadeOut: 0.04 };
  return { ...p, audio: [...p.audio, item], scenes: p.scenes.map((x) => (x.id === s.id ? { ...x, muted: true } : x)) };
}

export function newOverlay(preset: Overlay['preset'], at: number, text = ''): Overlay {
  const pos: Record<Overlay['preset'], [number, number]> = { title: [0.5, 0.45], lower: [0.3, 0.8], caption: [0.5, 0.86], tag: [0.82, 0.12], plain: [0.5, 0.5] };
  const label: Record<Overlay['preset'], string> = { title: 'Your *title* here', lower: 'Name Surname\nRole · Place', caption: 'Subtitle text', tag: 'NEW', plain: 'Text' };
  return {
    id: uid('o'), kind: 'text', at, dur: preset === 'title' ? 3 : 4, text: text || label[preset], preset,
    x: pos[preset][0], y: pos[preset][1], size: OVERLAY_SIZE[preset], color: '', bg: '', anim: preset === 'title' ? 'pop' : preset === 'lower' ? 'slide' : 'fade', opacity: 1,
  };
}
export function imageOverlay(mediaId: string, at: number, dur: number): Overlay {
  return { id: uid('o'), kind: 'image', at, dur, text: '', mediaId, preset: 'plain', x: 0.9, y: 0.1, size: 12, color: '', bg: '', anim: 'fade', opacity: 0.9 };
}

/** Candidate snap points: scene edges, item edges, beats, playhead, range. */
export function snapPoints(p: Project, playhead: number, withBeats: boolean) {
  const { starts, total } = timeline(p);
  const pts = [0, total, playhead, ...starts, ...p.overlays.flatMap((o) => [o.at, o.at + o.dur]), ...p.audio.flatMap((a) => [a.at, a.at + a.dur])];
  if (p.rangeIn !== undefined) pts.push(p.rangeIn);
  if (p.rangeOut !== undefined) pts.push(p.rangeOut);
  if (withBeats) pts.push(...p.beats.filter((b) => b <= total + 5));
  return pts;
}
export function snap(t: number, pts: number[], tol: number) {
  let best = t, d = tol;
  for (const x of pts) { const dd = Math.abs(x - t); if (dd < d) { d = dd; best = x; } }
  return best;
}


/** Shift everything on the text / audio tracks (and captions) that starts at or after `from` by `by` seconds. */
function shiftAfter(p: Project, from: number, by: number): Project {
  if (Math.abs(by) < 1e-6) return p;
  const mv = (t: number) => (t >= from - 1e-6 ? Math.max(0, t + by) : t);
  return {
    ...p,
    overlays: p.overlays.map((o) => ({ ...o, at: mv(o.at) })),
    audio: p.audio.map((a) => (a.toEnd && a.at < from ? a : { ...a, at: mv(a.at) })),
    captions: p.captions.map((c) => (c.start >= from - 1e-6 ? { ...c, start: c.start + by, end: c.end + by, words: c.words?.map((w) => ({ ...w, t0: w.t0 + by, t1: w.t1 + by })) } : c)),
  };
}

/**
 * Change the speed of just the part between a and b (slow motion / fast forward).
 * Clips are split at a and b; everything after the part moves to stay in sync.
 * Sound in the part is muted when the speed is far from normal (it would sound odd).
 */
export function setSpeedRange(p: Project, a: number, b: number, speed: number): { project: Project; changed: number } {
  let q = splitAt(p, a) ?? p;
  q = splitAt(q, b) ?? q;
  const { starts } = timeline(q);
  let delta = 0, changed = 0;
  const scenes = q.scenes.map((s, i) => {
    const mid = starts[i] + s.duration / 2;
    if (mid <= a || mid >= b) return s;
    const hasVideo = (s.cells ?? []).some((c) => q.media.find((m) => m.id === c.mediaId)?.kind === 'video') || q.media.find((m) => m.id === s.mediaIds[0])?.kind === 'video';
    if (!hasVideo || s.kind === 'montage') return s;
    const src = s.duration * (s.speed ?? 1);
    const dur = Math.max(0.1, Math.round((src / speed) * 1000) / 1000);
    delta += dur - s.duration;
    changed++;
    const muteIt = speed < 0.7 || speed > 1.6;
    return { ...s, speed, duration: dur, muted: muteIt ? true : s.muted };
  });
  const out = shiftAfter({ ...q, scenes }, b, delta);
  return { project: { ...out, rangeIn: a, rangeOut: b + delta }, changed };
}

export const FRAME_DESIGNS: [FrameDesign, string][] = [
  ['clean', 'Clean lines'], ['rounded', 'Rounded cards'], ['polaroid', 'Polaroid'], ['neon', 'Neon glow'],
  ['diagonal', 'Diagonal cut'], ['circle', 'Circles'], ['tilted', 'Tilted collage'], ['film', 'Film strip'],
];
export const GRID_LAYOUTS: [GridLayout, string][] = [
  ['2h', 'Side by side'], ['2v', 'Top / bottom'], ['3l', 'Big + 2'], ['3r', '2 + big'], ['3c', 'Three'], ['4', 'Four (2×2)'], ['6', 'Six'], ['pip', 'Picture in picture'], ['pip2', 'Main + 2 small'],
];

function makeCells(p: Project, layout: GridLayout, first: GridCell | undefined, others: string[]): GridCell[] {
  const n = gridCount(layout);
  const cells: GridCell[] = [];
  if (first) cells.push(first);
  for (const id of others) { if (cells.length >= n) break; if (!cells.some((c) => c.mediaId === id)) cells.push({ mediaId: id, clipIn: 0, sound: false }); }
  // fill remaining frames with other videos from the media list
  for (const m of p.media) {
    if (cells.length >= n) break;
    if (m.status === 'ready' && m.kind !== 'audio' && (m.role === 'clip' || m.role === 'photo') && !cells.some((c) => c.mediaId === m.id)) cells.push({ mediaId: m.id, clipIn: 0, sound: false });
  }
  if (cells.length && !cells.some((c) => c.sound)) {
    const withSound = cells.find((c) => p.media.find((m) => m.id === c.mediaId)?.hasAudio);
    if (withSound) withSound.sound = true;
  }
  return cells;
}

/** Turn the marked part into a split screen: the video already there becomes frame 1. */
export function gridFromRange(p: Project, a: number, b: number, layout: GridLayout, design: FrameDesign, picks: string[] = []): { project: Project; id: string } {
  let q = splitAt(p, a) ?? p;
  q = splitAt(q, b) ?? q;
  const { starts } = timeline(q);
  const inside = q.scenes.map((s, i) => ({ s, i })).filter(({ s, i }) => starts[i] + s.duration / 2 > a && starts[i] + s.duration / 2 < b);
  const firstScene = inside[0]?.s;
  const firstMedia = firstScene ? q.media.find((m) => m.id === (firstScene.cells?.[0]?.mediaId ?? firstScene.mediaIds[0])) : undefined;
  const first: GridCell | undefined = firstMedia && firstMedia.kind !== 'audio' ? { mediaId: firstMedia.id, clipIn: firstScene!.cells?.[0]?.clipIn ?? effIn(firstScene!, q.media), sound: !!firstMedia.hasAudio && !firstScene!.muted } : undefined;
  const cells = makeCells(q, layout, first, picks);
  const grid: Scene = { id: uid('s'), kind: 'grid', duration: Math.round((b - a) * 1000) / 1000, transition: 'cut', texts: {}, mediaIds: cells.map((c) => c.mediaId), layout, frame: design, cells, speed: 1 };
  const scenes = [...q.scenes];
  if (inside.length) scenes.splice(inside[0].i, inside.length, grid);
  else scenes.push(grid);
  return { project: { ...q, scenes, rangeIn: undefined, rangeOut: undefined }, id: grid.id };
}

/** Insert a new split screen after the clip under the playhead. */
export function insertGrid(p: Project, at: number, layout: GridLayout, design: FrameDesign, picks: string[] = [], dur = 5): { project: Project; id: string } {
  const cells = makeCells(p, layout, undefined, picks);
  const vids = cells.map((c) => p.media.find((m) => m.id === c.mediaId)).filter((m) => m?.kind === 'video').map((m) => m!.duration);
  const d = vids.length ? Math.max(2, Math.min(dur * 2, Math.min(...vids))) : dur;
  const grid: Scene = { id: uid('s'), kind: 'grid', duration: Math.round(d * 100) / 100, transition: 'cut', texts: {}, mediaIds: cells.map((c) => c.mediaId), layout, frame: design, cells, speed: 1 };
  const hit = sceneAt(p, at);
  const scenes = [...p.scenes];
  scenes.splice(hit ? hit.i + 1 : scenes.length, 0, grid);
  return { project: { ...p, scenes }, id: grid.id };
}
