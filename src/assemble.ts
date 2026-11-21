// "Make my video": turns the content list + media into an ordered list of scenes,
// fitted to the target length, with optional beat-snapped cuts.
import type { Bite, ContentRow, MediaItem, Project, Scene, SceneKind, StylePack, TransitionKind } from './types';
import { STYLE_PACKS, stylePack, videoType } from './presets';
import { parseNumber } from './render/text';
import { clamp, lerp, uid } from './util';

export function newRow(partial: Partial<ContentRow> = {}): ContentRow {
  return { id: uid('r'), title: '', subtitle: '', highlight: '', badge: '', ...partial };
}

export function defaultProject(): Project {
  const vt = videoType('promo');
  return {
    version: 1, id: uid('p'), name: 'My video', videoType: 'promo', aspect: '16:9', targetLength: 30,
    lang: 'en', lang2: '', style: structuredClone(stylePack('corporate')), pace: vt.pace,
    media: [], rows: [newRow(), newRow(), newRow()], bites: [], scenes: [],
    hookLines: [...vt.text.en.hook], headline: vt.text.en.headline,
    cta: { title: vt.text.en.cta, subtitle: vt.text.en.ctaSub, website: '', contact: '', dateVenue: '', social: '', qr: '' },
    musicVolume: 0.8, duckLevel: 0.18, beats: [], snapToBeats: true, captions: [], captionStyle: 'off', updated: Date.now(),
  };
}

const BASE: Record<SceneKind, number> = { hook: 3.8, montage: 1.2, speaker: 4, headline: 4.2, item: 3.6, steps: 6, stat: 4.6, moment: 3, cta: 5 };
const MIN: Record<SceneKind, number> = { hook: 2.4, montage: 0.7, speaker: 2, headline: 2.8, item: 2.2, steps: 3.5, stat: 3, moment: 1.8, cta: 3.2 };
const MAX: Record<SceneKind, number> = { hook: 6, montage: 1.9, speaker: 30, headline: 6.5, item: 7, steps: 14, stat: 6.5, moment: 6, cta: 8 };

const visualOk = (m: MediaItem) => m.status === 'ready' && (m.kind === 'video' || m.kind === 'image') && (m.role === 'clip' || m.role === 'photo');
const rowHasContent = (r: ContentRow) => !!(r.title || r.subtitle || r.highlight || r.mediaId);

function biteScene(b: Bite): Scene {
  return {
    id: uid('s'), kind: 'speaker', duration: Math.max(1, b.outT - b.inT), transition: 'dissolve',
    texts: { words: b.words, name: b.name, role: b.role }, mediaIds: [b.mediaId], clipIn: b.inT, useClipAudio: true, biteId: b.id,
  };
}

function itemScene(r: ContentRow, i: number, tutorial: boolean): Scene {
  return {
    id: uid('s'), kind: 'item', duration: BASE.item, transition: 'dissolve', rowId: r.id,
    texts: { title: r.title, subtitle: r.subtitle, highlight: r.highlight || (tutorial ? `Step ${i + 1}` : ''), badge: r.badge, second: r.second },
    mediaIds: r.mediaId ? [r.mediaId] : [],
  };
}

export function assemble(p: Project): Scene[] {
  const preset = videoType(p.videoType);
  const lang = p.lang === 'hi' || p.lang === 'mr' ? 'hi' : 'en';
  const txt = preset.text[lang];
  const visuals = p.media.filter(visualOk);
  const rows = p.rows.filter(rowHasContent);
  const used = new Set<string>([...rows.map((r) => r.mediaId!).filter(Boolean), ...p.bites.map((b) => b.mediaId)]);
  let free = visuals.filter((m) => !used.has(m.id));
  const take = (n: number, prefer?: 'video') => {
    const sorted = prefer ? [...free].sort((a, b) => (a.kind === prefer ? -1 : 0) - (b.kind === prefer ? -1 : 0)) : free;
    const got = sorted.slice(0, n);
    free = free.filter((m) => !got.includes(m));
    return got.map((m) => m.id);
  };
  const rowMediaPool = rows.map((r) => r.mediaId).filter(Boolean) as string[];
  const pm = lerp(1.3, 0.75, p.pace);
  const scenes: Scene[] = [];
  const bites = [...p.bites].filter((b) => p.media.some((m) => m.id === b.mediaId));
  let bitesPlaced = false;

  for (const kind of preset.flow) {
    switch (kind) {
      case 'hook': {
        const bg = take(1, 'video')[0] ?? rowMediaPool[0];
        scenes.push({ id: uid('s'), kind: 'hook', duration: BASE.hook * pm, transition: 'dissolve', texts: { lines: p.hookLines.filter(Boolean).length ? p.hookLines.filter(Boolean) : txt.hook }, mediaIds: bg ? [bg] : [] });
        break;
      }
      case 'montage': {
        let ids = take(8, 'video');
        if (ids.length < 3) ids = [...ids, ...rowMediaPool].slice(0, Math.max(ids.length, Math.min(6, rowMediaPool.length + ids.length)));
        if (ids.length < 2) break;
        ids = ids.slice(0, clamp(ids.length, 2, 8));
        const per = lerp(1.6, 1.0, p.pace);
        scenes.push({ id: uid('s'), kind: 'montage', duration: per * ids.length, transition: 'flash', texts: {}, mediaIds: ids });
        break;
      }
      case 'headline': {
        const pics = [...free.filter((m) => m.kind === 'image').slice(0, 4).map((m) => m.id)];
        const ids = pics.length >= 2 ? pics : [...pics, ...rowMediaPool].slice(0, 4);
        scenes.push({ id: uid('s'), kind: 'headline', duration: BASE.headline * pm, transition: 'wipe', texts: { lines: (p.headline || txt.headline).split('\n') }, mediaIds: ids });
        break;
      }
      case 'item': {
        const tutorial = p.videoType === 'tutorial';
        rows.forEach((r, i) => {
          scenes.push(itemScene(r, i, tutorial));
          if (preset.interleaveBites && bites.length && i % 2 === 1) scenes.push(biteScene(bites.shift()!));
        });
        while (bites.length) scenes.push(biteScene(bites.shift()!));
        bitesPlaced = true;
        break;
      }
      case 'steps': {
        if (rows.length < 2) break;
        const entries = rows.slice(0, 6).map((r) => ({ label: r.title || r.highlight, value: r.subtitle }));
        scenes.push({ id: uid('s'), kind: 'steps', mode: 'steps', duration: clamp(1.1 * entries.length + 2, 4, 10) * pm, transition: 'slide', texts: { title: (p.headline || txt.headline).split('\n')[0] }, entries, mediaIds: [] });
        break;
      }
      case 'stat': {
        const nums = rows.filter((r) => r.highlight && parseNumber(r.highlight)).slice(0, 3);
        if (!nums.length) break;
        scenes.push({ id: uid('s'), kind: 'stat', duration: BASE.stat * pm, transition: 'zoom', texts: {}, entries: nums.map((r) => ({ label: r.title, value: r.highlight })), mediaIds: [] });
        break;
      }
      case 'moment': {
        const ids = take(2, 'video');
        for (const id of ids) scenes.push({ id: uid('s'), kind: 'moment', duration: BASE.moment * pm, transition: 'dissolve', texts: {}, mediaIds: [id] });
        break;
      }
      case 'cta': {
        if (!bitesPlaced) { while (bites.length) scenes.push(biteScene(bites.shift()!)); bitesPlaced = true; }
        scenes.push({ id: uid('s'), kind: 'cta', duration: BASE.cta * pm, transition: 'cut', texts: {}, mediaIds: [] });
        break;
      }
      default:
        break;
    }
  }
  assignTransitions(scenes, p.style);
  fitLength(scenes, p.targetLength, p.media);
  if (p.snapToBeats && p.beats.length) snapToBeats(scenes, p.beats);
  return scenes;
}

export function assignTransitions(scenes: Scene[], style: StylePack) {
  const list = style.transitions.length ? style.transitions : (['dissolve'] as TransitionKind[]);
  scenes.forEach((s, i) => {
    if (i === scenes.length - 1) { s.transition = 'cut'; return; }
    if (s.kind === 'montage') { s.transition = list.includes('flash') ? 'flash' : list[0]; return; }
    s.transition = list[i % list.length];
  });
}

function minOf(s: Scene) { return s.kind === 'montage' ? MIN.montage * s.mediaIds.length : s.kind === 'speaker' ? s.duration : MIN[s.kind]; }
function maxOf(s: Scene) { return s.kind === 'montage' ? MAX.montage * s.mediaIds.length : s.kind === 'speaker' ? s.duration : MAX[s.kind]; }

/** Scale scene lengths (within sensible limits) to land on the target length. */
export function fitLength(scenes: Scene[], target: number, media: MediaItem[]) {
  const sum = () => scenes.reduce((n, s) => n + s.duration, 0);
  for (let pass = 0; pass < 6; pass++) {
    const total = sum();
    if (Math.abs(total - target) < 0.05) break;
    const flex = scenes.filter((s) => s.kind !== 'speaker' && (total > target ? s.duration > minOf(s) + 1e-3 : s.duration < maxOf(s) - 1e-3));
    const flexSum = flex.reduce((n, s) => n + s.duration, 0);
    if (!flexSum) break;
    const f = (flexSum + (target - total)) / flexSum;
    for (const s of flex) s.duration = clamp(s.duration * f, minOf(s), maxOf(s));
  }
  // Still too long: drop extras in this order, keeping the user's content items.
  const dropOrder: SceneKind[] = ['moment', 'stat', 'headline'];
  for (const kind of dropOrder) {
    while (sum() > target * 1.04) {
      const idx = scenes.map((s) => s.kind).lastIndexOf(kind);
      if (idx < 0) break;
      scenes.splice(idx, 1);
    }
  }
  const mont = scenes.find((s) => s.kind === 'montage');
  while (mont && sum() > target * 1.04 && mont.mediaIds.length > 3) {
    mont.mediaIds.pop();
    mont.duration = Math.max(MIN.montage * mont.mediaIds.length, mont.duration - mont.duration / (mont.mediaIds.length + 1));
  }
  // Trim long speaker bites last
  for (const s of scenes) if (s.kind === 'speaker' && sum() > target * 1.04) s.duration = Math.max(3, s.duration - (sum() - target));
  // Video items should not run past the end of their clip
  for (const s of scenes) {
    if (s.kind !== 'item' && s.kind !== 'moment') continue;
    const m = media.find((x) => x.id === s.mediaIds[0]);
    if (m?.kind === 'video' && m.duration > 0.5) {
      const start = s.clipIn ?? (m.duration > 6 ? m.duration * 0.2 : 0);
      if (start + s.duration > m.duration) s.clipIn = Math.max(0, m.duration - s.duration);
    }
  }
  for (const s of scenes) s.duration = Math.round(s.duration * 100) / 100;
}

/** Nudge scene boundaries onto the nearest music beat (±0.35 s). */
export function snapToBeats(scenes: Scene[], beats: number[]) {
  let t = 0;
  for (let i = 0; i < scenes.length - 1; i++) {
    const s = scenes[i];
    const end = t + s.duration;
    let best = end, d = 0.35;
    for (const b of beats) { const dd = Math.abs(b - end); if (dd < d && b - t > 1.2) { d = dd; best = b; } }
    if (s.kind !== 'speaker') s.duration = Math.round((best - t) * 1000) / 1000;
    t += s.duration;
  }
}

export function shuffleStyle(p: Project): StylePack {
  const others = STYLE_PACKS.filter((s) => s.id !== p.style.id);
  const pick = structuredClone(others[Math.floor(Math.random() * others.length)]);
  const tr = [...pick.transitions].sort(() => Math.random() - 0.5);
  pick.transitions = tr;
  return pick;
}

export function newScene(kind: SceneKind): Scene {
  const base: Scene = { id: uid('s'), kind, duration: BASE[kind] * (kind === 'montage' ? 4 : 1), transition: 'dissolve', texts: {}, mediaIds: [] };
  if (kind === 'hook') base.texts.lines = ['Your *big* message'];
  if (kind === 'headline') base.texts.lines = ['Your main message'];
  if (kind === 'item') base.texts = { title: 'Title', subtitle: 'One-line description', highlight: '' };
  if (kind === 'steps') { base.mode = 'steps'; base.entries = [{ label: 'First step', value: '' }, { label: 'Second step', value: '' }, { label: 'Third step', value: '' }]; base.texts.title = 'How it works'; }
  if (kind === 'stat') base.entries = [{ label: 'Happy customers', value: '1,200+' }, { label: 'Rating', value: '4.8★' }];
  if (kind === 'moment') base.texts.caption = '';
  return base;
}
