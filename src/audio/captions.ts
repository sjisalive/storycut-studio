// Captions: automatic (Whisper running in the browser through transformers.js,
// loaded on demand from a CDN — the audio itself never leaves the computer),
// or built from the scene text. Plus .srt export.
import type { Caption, CaptionWord, LangCode, Project } from '../types';
import { renderMix } from './mix';
import { timeline } from '../render/engine';
import { stripRich } from '../render/text';
import { uid } from '../util';

const TRANSFORMERS_CDN = 'https://cdn.jsdelivr.net/npm/@huggingface/transformers@3.7.5/dist/transformers.min.js';
let lib: any = null;
export async function loadTransformers() {
  if (!lib) {
    lib = await import(/* @vite-ignore */ TRANSFORMERS_CDN);
    lib.env.allowLocalModels = false;
  }
  return lib;
}

const WHISPER_LANG: Record<LangCode, string> = { en: 'english', hi: 'hindi', mr: 'marathi', bn: 'bengali', ta: 'tamil', te: 'telugu', gu: 'gujarati' };

export type WhisperSize = 'base' | 'small';

export async function autoCaptions(p: Project, size: WhisperSize, onStatus: (msg: string, pct?: number) => void): Promise<Caption[]> {
  onStatus('Preparing speech audio…');
  const speech = await renderMix(p, 16000, { speechOnly: true, channels: 1, normalise: false });
  const data = speech.getChannelData(0);
  let peak = 0;
  for (let i = 0; i < data.length; i += 16) peak = Math.max(peak, Math.abs(data[i]));
  if (peak < 0.01) throw new Error('No speech found. Add a voiceover or a speaker bite first.');
  onStatus('Loading speech model (first time downloads it, then it is cached)…', 0);
  const T = await loadTransformers();
  const device = (navigator as any).gpu ? 'webgpu' : 'wasm';
  const progress = (x: any) => { if (x?.status === 'progress' && x.total) onStatus(`Downloading model… ${x.file ?? ''}`, x.loaded / x.total); };
  const opts = { language: WHISPER_LANG[p.lang], task: 'transcribe', chunk_length_s: 30, stride_length_s: 5 };
  let out: any;
  try {
    const asr = await T.pipeline('automatic-speech-recognition', `onnx-community/whisper-${size}_timestamped`, { device, dtype: 'fp32', progress_callback: progress });
    onStatus('Listening… (this can take a minute)');
    out = await asr(data, { ...opts, return_timestamps: 'word' });
  } catch (err) {
    console.warn('word timestamps unavailable, falling back', err);
    const asr = await T.pipeline('automatic-speech-recognition', `Xenova/whisper-${size}`, { progress_callback: progress });
    onStatus('Listening… (this can take a minute)');
    out = await asr(data, { ...opts, return_timestamps: true });
  }
  const chunks: { text: string; timestamp: [number, number | null] }[] = out?.chunks ?? [];
  const words: CaptionWord[] = [];
  for (const c of chunks) {
    const [a, b] = c.timestamp;
    const parts = c.text.trim().split(/\s+/).filter(Boolean);
    const end = b ?? a + 0.4 * parts.length;
    parts.forEach((w, i) => words.push({ w, t0: a + ((end - a) * i) / parts.length, t1: a + ((end - a) * (i + 1)) / parts.length }));
  }
  onStatus('Done');
  return groupWords(words);
}

export function groupWords(words: CaptionWord[], maxWords = 6): Caption[] {
  const caps: Caption[] = [];
  let cur: CaptionWord[] = [];
  const flush = () => {
    if (!cur.length) return;
    caps.push({ id: uid('c'), start: cur[0].t0, end: cur[cur.length - 1].t1 + 0.15, text: cur.map((w) => w.w).join(' '), words: cur });
    cur = [];
  };
  for (const w of words) {
    const last = cur[cur.length - 1];
    if (last && (w.t0 - last.t1 > 0.6 || cur.length >= maxWords || /[.!?।]$/.test(last.w))) flush();
    cur.push(w);
  }
  flush();
  for (let i = 0; i < caps.length - 1; i++) caps[i].end = Math.min(caps[i].end, caps[i + 1].start);
  return caps;
}

/** One caption per scene from its on-screen text (good for subtitles / .srt without speech). */
export function captionsFromScenes(p: Project): Caption[] {
  const { starts } = timeline(p);
  const caps: Caption[] = [];
  p.scenes.forEach((s, i) => {
    const t = s.texts;
    const text = stripRich(
      (t.lines?.join(' ') || [t.highlight, t.title, t.subtitle].filter(Boolean).join(' — ') || t.caption || t.words ||
        (s.entries ?? []).map((e) => `${e.label} ${e.value}`).join(' · ') || (s.kind === 'cta' ? p.cta.title : '')) ?? '',
    ).trim();
    if (text) caps.push({ id: uid('c'), start: starts[i] + 0.2, end: starts[i] + s.duration - 0.1, text });
  });
  for (const o of p.overlays ?? []) {
    if (o.kind === 'text' && o.text.trim()) caps.push({ id: uid('c'), start: o.at, end: o.at + o.dur, text: stripRich(o.text).replace(/\n/g, ' ') });
  }
  caps.sort((a, b) => a.start - b.start);
  return caps;
}

const srtTime = (t: number) => {
  const ms = Math.max(0, Math.round(t * 1000));
  const h = Math.floor(ms / 3600000), m = Math.floor((ms % 3600000) / 60000), s = Math.floor((ms % 60000) / 1000);
  const pad = (n: number, l = 2) => String(n).padStart(l, '0');
  return `${pad(h)}:${pad(m)}:${pad(s)},${pad(ms % 1000, 3)}`;
};
export function toSrt(caps: Caption[]) {
  return caps.map((c, i) => `${i + 1}\n${srtTime(c.start)} --> ${srtTime(c.end)}\n${c.text}\n`).join('\n');
}
