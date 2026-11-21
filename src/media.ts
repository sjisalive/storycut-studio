// Runtime media registry. Blobs live in memory (and IndexedDB when a project
// is saved); decoded images / video elements / audio buffers are cached here.
import type { MediaItem, MediaRole } from './types';
import { uid } from './util';

const blobs = new Map<string, Blob>();
const urls = new Map<string, string>();
const images = new Map<string, ImageBitmap>();
const videos = new Map<string, HTMLVideoElement>();
const audio = new Map<string, AudioBuffer | null>();
const pendingAudio = new Map<string, Promise<AudioBuffer | null>>();

let decodeCtx: OfflineAudioContext | null = null;
function decoder() {
  if (!decodeCtx) decodeCtx = new OfflineAudioContext(2, 48000, 48000);
  return decodeCtx;
}

export const getBlob = (id: string) => blobs.get(id);
export const allBlobIds = () => [...blobs.keys()];
export function objectUrl(id: string) {
  const b = blobs.get(id);
  if (!b) return '';
  let u = urls.get(id);
  if (!u) { u = URL.createObjectURL(b); urls.set(id, u); }
  return u;
}

export function forgetMedia(id: string) {
  blobs.delete(id);
  const u = urls.get(id);
  if (u) URL.revokeObjectURL(u);
  urls.delete(id);
  images.get(id)?.close();
  images.delete(id);
  const v = videos.get(id);
  if (v) { v.pause(); v.removeAttribute('src'); v.load(); }
  videos.delete(id);
  audio.delete(id);
}

export function guessRole(name: string, mime: string, duration: number): MediaRole {
  const n = name.toLowerCase();
  if (mime.startsWith('image/')) return /logo|brand|emblem/.test(n) ? 'logo' : 'photo';
  if (mime.startsWith('audio/') || /\.(mp3|wav|m4a|aac|ogg|flac|opus)$/.test(n)) {
    if (/voice|vo[_\- ]|narrat|record|speech|mic/.test(n)) return 'voice';
    return duration > 40 || /music|song|bgm|track|beat/.test(n) ? 'music' : 'voice';
  }
  return 'clip';
}

function kindOf(file: Blob, name: string): MediaItem['kind'] | null {
  const t = file.type;
  const n = name.toLowerCase();
  if (t.startsWith('video/') || /\.(mp4|mov|webm|m4v|mkv)$/.test(n)) return 'video';
  if (t.startsWith('image/') || /\.(jpe?g|png|webp|gif|bmp|avif)$/.test(n)) return 'image';
  if (t.startsWith('audio/') || /\.(mp3|wav|m4a|aac|ogg|flac|opus)$/.test(n)) return 'audio';
  return null;
}

function makeVideo(url: string) {
  const v = document.createElement('video');
  v.muted = true;
  v.playsInline = true;
  v.preload = 'auto';
  v.crossOrigin = 'anonymous';
  v.src = url;
  return v;
}

function once(el: HTMLMediaElement, ev: string, ms = 15000) {
  return new Promise<void>((res, rej) => {
    const t = setTimeout(() => { cleanup(); rej(new Error(`Timed out waiting for ${ev}`)); }, ms);
    const ok = () => { cleanup(); res(); };
    const bad = () => { cleanup(); rej(new Error('This file could not be read by the browser')); };
    const cleanup = () => { clearTimeout(t); el.removeEventListener(ev, ok); el.removeEventListener('error', bad); };
    el.addEventListener(ev, ok, { once: true });
    el.addEventListener('error', bad, { once: true });
  });
}

function thumbFrom(src: CanvasImageSource, w: number, h: number) {
  const tw = 160, th = Math.max(1, Math.round((160 * h) / Math.max(1, w)));
  const c = document.createElement('canvas');
  c.width = tw; c.height = Math.min(th, 160);
  const ctx = c.getContext('2d')!;
  ctx.drawImage(src, 0, 0, tw, th);
  return c.toDataURL('image/jpeg', 0.7);
}

/** Read a dropped file: registers it and returns a ready MediaItem (or one in error). */
export async function readMedia(file: Blob, name: string, opts: { id?: string; role?: MediaRole; placeholder?: boolean } = {}): Promise<MediaItem> {
  const id = opts.id ?? uid('m');
  const kind = kindOf(file, name);
  const base: MediaItem = {
    id, name, kind: kind ?? 'image', role: opts.role ?? 'photo', mime: file.type, size: file.size,
    duration: 0, width: 0, height: 0, status: 'reading', placeholder: opts.placeholder,
  };
  if (!kind) return { ...base, status: 'error', error: 'Unsupported file type' };
  blobs.set(id, file);
  try {
    if (kind === 'image') {
      const bmp = await createImageBitmap(file);
      images.set(id, bmp);
      return { ...base, kind, role: opts.role ?? guessRole(name, file.type || 'image/', 0), width: bmp.width, height: bmp.height, thumb: thumbFrom(bmp, bmp.width, bmp.height), status: 'ready' };
    }
    if (kind === 'video') {
      const v = makeVideo(objectUrl(id));
      await once(v, 'loadeddata');
      videos.set(id, v);
      const dur = Number.isFinite(v.duration) ? v.duration : 0;
      v.currentTime = Math.min(1, dur * 0.1);
      await once(v, 'seeked').catch(() => {});
      const thumb = thumbFrom(v, v.videoWidth, v.videoHeight);
      // Does it have a sound track? Try decoding (cached for speaker bites).
      const buf = await getAudioBuffer(id);
      return { ...base, kind, role: opts.role ?? 'clip', duration: dur, width: v.videoWidth, height: v.videoHeight, thumb, hasAudio: !!buf, status: 'ready' };
    }
    // audio
    const buf = await getAudioBuffer(id);
    if (!buf) throw new Error('Could not decode this audio file');
    return { ...base, kind, role: opts.role ?? guessRole(name, file.type || 'audio/', buf.duration), duration: buf.duration, hasAudio: true, status: 'ready' };
  } catch (e: any) {
    return { ...base, kind, status: 'error', error: e?.message ?? String(e) };
  }
}

export function getAudioBuffer(id: string): Promise<AudioBuffer | null> {
  if (audio.has(id)) return Promise.resolve(audio.get(id)!);
  const p = pendingAudio.get(id);
  if (p) return p;
  const blob = blobs.get(id);
  if (!blob) return Promise.resolve(null);
  const job = blob.arrayBuffer()
    .then((ab) => decoder().decodeAudioData(ab))
    .then((b) => b, () => null)
    .then((b) => { audio.set(id, b); pendingAudio.delete(id); return b; });
  pendingAudio.set(id, job);
  return job;
}
export const cachedAudio = (id: string) => audio.get(id) ?? null;

export interface Visual { src: CanvasImageSource; w: number; h: number; video?: HTMLVideoElement }

export function getVisual(id: string | undefined): Visual | null {
  if (!id) return null;
  const img = images.get(id);
  if (img) return { src: img, w: img.width, h: img.height };
  const v = videos.get(id);
  if (v && v.readyState >= 2) return { src: v, w: v.videoWidth, h: v.videoHeight, video: v };
  return null;
}

export const getVideoEl = (id: string) => videos.get(id);

/** Seek a video precisely (used during export). */
export async function seekVideo(id: string, t: number) {
  const v = videos.get(id);
  if (!v) return;
  const target = Math.max(0, Math.min(t, (v.duration || 0) - 0.04));
  if (Math.abs(v.currentTime - target) < 0.004 && v.readyState >= 2) return;
  if (!v.paused) v.pause();
  const p = once(v, 'seeked', 8000).catch(() => {});
  v.currentTime = target;
  await p;
}

/** Register an already-decoded bitmap (used for generated placeholders and cut-outs). */
export function registerImage(id: string, blob: Blob, bmp: ImageBitmap) {
  blobs.set(id, blob);
  images.set(id, bmp);
}

// ------------------------------------------------------------ waveform peaks
const peaks = new Map<string, Promise<Float32Array | null>>();
export const PEAK_RATE = 100; // values per second

/** Loudness outline of a file's sound (max level every 10 ms, scaled so the loudest part = 1). */
export function getPeaks(id: string): Promise<Float32Array | null> {
  let p = peaks.get(id);
  if (!p) {
    p = getAudioBuffer(id).then((buf) => {
      if (!buf) return null;
      const step = Math.max(1, Math.round(buf.sampleRate / PEAK_RATE));
      const n = Math.ceil(buf.length / step);
      const out = new Float32Array(n);
      const chans = Array.from({ length: Math.min(2, buf.numberOfChannels) }, (_, c) => buf.getChannelData(c));
      let top = 0;
      for (let i = 0; i < n; i++) {
        let m = 0;
        const end = Math.min(buf.length, (i + 1) * step);
        for (const d of chans) for (let j = i * step; j < end; j += 4) { const v = Math.abs(d[j]); if (v > m) m = v; }
        out[i] = m;
        if (m > top) top = m;
      }
      if (top > 0) for (let i = 0; i < n; i++) out[i] = Math.min(1, out[i] / top);
      return out;
    });
    peaks.set(id, p);
  }
  return p;
}
