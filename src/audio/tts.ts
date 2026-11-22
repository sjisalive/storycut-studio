// Text → speech in the browser with Piper neural voices (MIT-licensed models by Rhasspy).
// Pipeline: text → sentences → espeak-ng phonemes (WebAssembly) → VITS model (ONNX runtime) → audio.
// Engine files are served by this site; each voice downloads once (~60 MB) and is kept in the
// browser's cache, after which it works offline.

export interface VoiceDef { id: string; label: string; lang: 'hi' | 'en' | 'ml' | 'ne'; gender: 'male' | 'female'; note?: string }

export const VOICES: VoiceDef[] = [
  { id: 'hi_IN-pratham-medium', label: 'Pratham', lang: 'hi', gender: 'male' },
  { id: 'hi_IN-priyamvada-medium', label: 'Priyamvada', lang: 'hi', gender: 'female' },
  { id: 'en_US-lessac-medium', label: 'Lessac (US)', lang: 'en', gender: 'female', note: 'clear, neutral' },
  { id: 'en_US-ryan-medium', label: 'Ryan (US)', lang: 'en', gender: 'male' },
  { id: 'en_US-hfc_female-medium', label: 'HFC (US)', lang: 'en', gender: 'female' },
  { id: 'en_US-hfc_male-medium', label: 'HFC (US)', lang: 'en', gender: 'male' },
  { id: 'en_GB-alan-medium', label: 'Alan (UK)', lang: 'en', gender: 'male' },
  { id: 'en_GB-cori-medium', label: 'Cori (UK)', lang: 'en', gender: 'female' },
  { id: 'en_US-kusal-medium', label: 'Kusal', lang: 'en', gender: 'male' },
  { id: 'ml_IN-meera-medium', label: 'Meera (Malayalam)', lang: 'ml', gender: 'female' },
  { id: 'ml_IN-arjun-medium', label: 'Arjun (Malayalam)', lang: 'ml', gender: 'male' },
  { id: 'ne_NP-google-medium', label: 'Nepali', lang: 'ne', gender: 'female' },
];

/** Where voices are downloaded from (Hugging Face sends the headers browsers need). Tests may override. */
const VOICE_BASE = () => (window as any).__ttsVoiceBase ?? 'https://huggingface.co/rhasspy/piper-voices/resolve/v1.0.0/';
const ENGINE_BASE = () => new URL('tts/', document.baseURI).href;

function voicePath(id: string) {
  const [loc, name, quality] = id.split('-');
  return `${loc.split('_')[0]}/${loc}/${name}/${quality}/${id}`;
}

interface Loaded { session: any; config: any }
const loaded = new Map<string, Promise<Loaded>>();
let ortP: Promise<any> | null = null;
let phonData: Promise<{ wasm: ArrayBuffer; data: ArrayBuffer; create: any }> | null = null;

async function getOrt() {
  if (!ortP) ortP = import('onnxruntime-web/wasm').then((m: any) => {
    const ort = m.default ?? m;
    ort.env.wasm.wasmPaths = `${ENGINE_BASE()}ort/`;
    ort.env.wasm.numThreads = 1; // GitHub Pages can't enable multi-threading
    return ort;
  });
  return ortP;
}

async function getPhonemizer() {
  if (!phonData) phonData = (async () => {
    const [create, wasm, data] = await Promise.all([
      import(/* @vite-ignore */ `${ENGINE_BASE()}piper_phonemize.mjs`).then((m) => m.default),
      fetch(`${ENGINE_BASE()}piper_phonemize.wasm`).then((r) => r.arrayBuffer()),
      fetch(`${ENGINE_BASE()}piper_phonemize.data`).then((r) => r.arrayBuffer()),
    ]);
    return { create, wasm, data };
  })();
  return phonData;
}

/** espeak-ng phonemes → Piper ids, for one sentence. */
async function phonemeIds(text: string, espeakVoice: string): Promise<number[]> {
  const ph = await getPhonemizer();
  return new Promise((resolve, reject) => {
    let done = false;
    ph.create({
      wasmBinary: ph.wasm,
      getPreloadedPackage: () => ph.data,
      print: (out: string) => { if (!done) { done = true; resolve(JSON.parse(out).phoneme_ids); } },
      printErr: (m: string) => { if (!done && /error/i.test(m)) { done = true; reject(new Error(m)); } },
      locateFile: (u: string) => `${ENGINE_BASE()}${u}`,
    }).then((mod: any) => {
      mod.callMain(['-l', espeakVoice, '--input', JSON.stringify([{ text }]), '--espeak_data', '/espeak-ng-data']);
    }).catch(reject);
  });
}

async function fetchCached(url: string, onProgress?: (p: number) => void): Promise<ArrayBuffer> {
  const cache = 'caches' in window ? await caches.open('storycut-voices-v1') : null;
  const hit = await cache?.match(url);
  if (hit) { onProgress?.(1); return hit.arrayBuffer(); }
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Could not download the voice (${res.status}). Check your internet connection.`);
  const total = Number(res.headers.get('content-length')) || 0;
  const reader = res.body!.getReader();
  const parts: Uint8Array[] = [];
  let got = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    parts.push(value); got += value.length;
    if (total) onProgress?.(got / total);
  }
  const buf = new Uint8Array(got);
  let o = 0;
  for (const p of parts) { buf.set(p, o); o += p.length; }
  try { await cache?.put(url, new Response(buf.slice().buffer)); } catch { /* storage full: still works this time */ }
  onProgress?.(1);
  return buf.buffer;
}

export async function isVoiceDownloaded(id: string) {
  if (!('caches' in window)) return false;
  const cache = await caches.open('storycut-voices-v1');
  return !!(await cache.match(`${VOICE_BASE()}${voicePath(id)}.onnx`));
}

export function loadVoice(id: string, onProgress?: (p: number) => void): Promise<Loaded> {
  let p = loaded.get(id);
  if (!p) {
    p = (async () => {
      const base = `${VOICE_BASE()}${voicePath(id)}`;
      const [ort, cfgBuf] = await Promise.all([getOrt(), fetchCached(`${base}.onnx.json`)]);
      const config = JSON.parse(new TextDecoder().decode(cfgBuf));
      const model = await fetchCached(`${base}.onnx`, onProgress);
      const session = await ort.InferenceSession.create(model, { executionProviders: ['wasm'] });
      await getPhonemizer();
      return { session, config };
    })();
    p.catch(() => loaded.delete(id));
    loaded.set(id, p);
  }
  return p;
}

/** Split into sentences (keeps Hindi danda ।). Paragraph breaks become longer pauses. */
export function sentences(text: string): { text: string; pauseAfter: number }[] {
  const out: { text: string; pauseAfter: number }[] = [];
  const paras = text.replace(/\r/g, '').split(/\n\s*\n|\n/);
  paras.forEach((para, pi) => {
    const parts = para.match(/[^.!?।॥]+[.!?।॥]*["'”’)]*\s*/g) ?? [];
    const clean = parts.map((s) => s.trim()).filter((s) => /[\p{L}\p{N}]/u.test(s));
    clean.forEach((s, i) => {
      // very long sentences are split at commas so the model keeps a natural rhythm
      const pieces = s.length > 260 ? s.split(/(?<=[,;:])\s+/) : [s];
      pieces.forEach((piece, k) => out.push({ text: piece, pauseAfter: k < pieces.length - 1 ? 0.25 : i < clean.length - 1 ? 1 : pi < paras.length - 1 ? 2 : 0 }));
    });
  });
  return out;
}

export interface TtsOptions { speed: number; variation: number; pause: number } // speed 0.5–2, variation 0–1, pause seconds

/** Speak the text with a voice. Returns mono audio at the voice's sample rate. */
export async function speak(text: string, voiceId: string, o: TtsOptions, onProgress: (stage: string, p: number) => void): Promise<AudioBuffer> {
  const { session, config } = await loadVoice(voiceId, (p) => onProgress('Downloading voice (once)…', p));
  const ort = await getOrt();
  const sr = config.audio.sample_rate as number;
  const list = sentences(text);
  if (!list.length) throw new Error('Type some text first.');
  const pcm: Float32Array[] = [];
  const noise = 0.333 + o.variation * 0.6, noiseW = 0.5 + o.variation * 0.5;
  const lengthScale = (config.inference?.length_scale ?? 1) / Math.max(0.3, o.speed);
  for (let i = 0; i < list.length; i++) {
    onProgress(`Speaking sentence ${i + 1} of ${list.length}…`, i / list.length);
    const ids = await phonemeIds(list[i].text, config.espeak.voice);
    const feeds: Record<string, any> = {
      input: new ort.Tensor('int64', BigInt64Array.from(ids.map((x) => BigInt(x))), [1, ids.length]),
      input_lengths: new ort.Tensor('int64', BigInt64Array.from([BigInt(ids.length)]), [1]),
      scales: new ort.Tensor('float32', Float32Array.from([noise, lengthScale, noiseW]), [3]),
    };
    if (config.num_speakers > 1) feeds.sid = new ort.Tensor('int64', BigInt64Array.from([0n]), [1]);
    const out = await session.run(feeds);
    pcm.push(out.output.data as Float32Array);
    const gap = Math.round(sr * list[i].pauseAfter * o.pause);
    if (gap > 0) pcm.push(new Float32Array(gap));
    await new Promise((r) => setTimeout(r, 0));
  }
  const total = pcm.reduce((n, a) => n + a.length, 0);
  const buf = new AudioBuffer({ length: Math.max(1, total), numberOfChannels: 1, sampleRate: sr });
  const ch = buf.getChannelData(0);
  let off = 0;
  for (const a of pcm) { ch.set(a, off); off += a.length; }
  onProgress('Done', 1);
  return buf;
}
