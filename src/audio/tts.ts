// Text → speech in the browser with Piper neural voices (MIT-licensed models by Rhasspy).
// Pipeline: text → sentences → espeak-ng phonemes (WebAssembly) → VITS model (ONNX runtime) → audio.
// Engine files are served by this site; each voice downloads once (~60 MB) and is kept in the
// browser's cache, after which it works offline.

export interface VoiceDef { id: string; label: string; lang: 'hi' | 'en' | 'ml' | 'ne'; gender: 'male' | 'female'; note?: string; hd?: boolean; deep?: boolean; cloud?: boolean }

export const VOICES: VoiceDef[] = [
  // Studio voices (Sarvam AI Bulbul v3, online with the user's own API key): trained on Indian speech, most human
  { id: 'sarvam:shubh', label: 'Shubh', lang: 'hi', gender: 'male', cloud: true },
  { id: 'sarvam:aditya', label: 'Aditya', lang: 'hi', gender: 'male', cloud: true },
  { id: 'sarvam:rahul', label: 'Rahul', lang: 'hi', gender: 'male', cloud: true },
  { id: 'sarvam:kabir', label: 'Kabir', lang: 'hi', gender: 'male', cloud: true },
  { id: 'sarvam:anand', label: 'Anand', lang: 'hi', gender: 'male', cloud: true },
  { id: 'sarvam:ashutosh', label: 'Ashutosh', lang: 'hi', gender: 'male', cloud: true },
  { id: 'sarvam:amit', label: 'Amit', lang: 'hi', gender: 'male', cloud: true },
  { id: 'sarvam:varun', label: 'Varun', lang: 'hi', gender: 'male', cloud: true },
  { id: 'sarvam:manan', label: 'Manan', lang: 'hi', gender: 'male', cloud: true },
  { id: 'sarvam:vijay', label: 'Vijay', lang: 'hi', gender: 'male', cloud: true },
  { id: 'sarvam:ritu', label: 'Ritu', lang: 'hi', gender: 'female', cloud: true },
  { id: 'sarvam:priya', label: 'Priya', lang: 'hi', gender: 'female', cloud: true },
  { id: 'sarvam:neha', label: 'Neha', lang: 'hi', gender: 'female', cloud: true },
  { id: 'sarvam:shreya', label: 'Shreya', lang: 'hi', gender: 'female', cloud: true },
  { id: 'sarvam:ishita', label: 'Ishita', lang: 'hi', gender: 'female', cloud: true },
  { id: 'sarvam:kavya', label: 'Kavya', lang: 'hi', gender: 'female', cloud: true },
  { id: 'sarvam:pooja', label: 'Pooja', lang: 'hi', gender: 'female', cloud: true },
  { id: 'sarvam:simran', label: 'Simran', lang: 'hi', gender: 'female', cloud: true },
  { id: 'sarvam:shubh:en', label: 'Shubh', lang: 'en', gender: 'male', cloud: true, note: 'Indian English' },
  { id: 'sarvam:aditya:en', label: 'Aditya', lang: 'en', gender: 'male', cloud: true, note: 'Indian English' },
  { id: 'sarvam:rahul:en', label: 'Rahul', lang: 'en', gender: 'male', cloud: true, note: 'Indian English' },
  { id: 'sarvam:kabir:en', label: 'Kabir', lang: 'en', gender: 'male', cloud: true, note: 'Indian English' },
  { id: 'sarvam:anand:en', label: 'Anand', lang: 'en', gender: 'male', cloud: true, note: 'Indian English' },
  { id: 'sarvam:ashutosh:en', label: 'Ashutosh', lang: 'en', gender: 'male', cloud: true, note: 'Indian English' },
  { id: 'sarvam:amit:en', label: 'Amit', lang: 'en', gender: 'male', cloud: true, note: 'Indian English' },
  { id: 'sarvam:varun:en', label: 'Varun', lang: 'en', gender: 'male', cloud: true, note: 'Indian English' },
  { id: 'sarvam:manan:en', label: 'Manan', lang: 'en', gender: 'male', cloud: true, note: 'Indian English' },
  { id: 'sarvam:vijay:en', label: 'Vijay', lang: 'en', gender: 'male', cloud: true, note: 'Indian English' },
  { id: 'sarvam:ritu:en', label: 'Ritu', lang: 'en', gender: 'female', cloud: true, note: 'Indian English' },
  { id: 'sarvam:priya:en', label: 'Priya', lang: 'en', gender: 'female', cloud: true, note: 'Indian English' },
  { id: 'sarvam:neha:en', label: 'Neha', lang: 'en', gender: 'female', cloud: true, note: 'Indian English' },
  { id: 'sarvam:shreya:en', label: 'Shreya', lang: 'en', gender: 'female', cloud: true, note: 'Indian English' },
  { id: 'sarvam:ishita:en', label: 'Ishita', lang: 'en', gender: 'female', cloud: true, note: 'Indian English' },
  { id: 'sarvam:kavya:en', label: 'Kavya', lang: 'en', gender: 'female', cloud: true, note: 'Indian English' },
  { id: 'sarvam:pooja:en', label: 'Pooja', lang: 'en', gender: 'female', cloud: true, note: 'Indian English' },
  { id: 'sarvam:simran:en', label: 'Simran', lang: 'en', gender: 'female', cloud: true, note: 'Indian English' },
  // Natural HD voices (Kokoro, Apache-2.0): much more human rhythm and intonation
  { id: 'kokoro:hm_omega', label: 'Omega', lang: 'hi', gender: 'male', hd: true, deep: true, note: 'deep, warm' },
  { id: 'kokoro:hm_psi', label: 'Psi', lang: 'hi', gender: 'male', hd: true, note: 'clear' },
  { id: 'kokoro:hf_alpha', label: 'Alpha', lang: 'hi', gender: 'female', hd: true },
  { id: 'kokoro:hf_beta', label: 'Beta', lang: 'hi', gender: 'female', hd: true, note: 'soft' },
  { id: 'kokoro:am_onyx', label: 'Onyx (US)', lang: 'en', gender: 'male', hd: true, deep: true, note: 'deep' },
  { id: 'kokoro:am_michael', label: 'Michael (US)', lang: 'en', gender: 'male', hd: true },
  { id: 'kokoro:bm_george', label: 'George (UK)', lang: 'en', gender: 'male', hd: true, deep: true, note: 'deep, formal' },
  { id: 'kokoro:bm_fable', label: 'Fable (UK)', lang: 'en', gender: 'male', hd: true },
  { id: 'kokoro:af_heart', label: 'Heart (US)', lang: 'en', gender: 'female', hd: true, note: 'most natural' },
  { id: 'kokoro:af_bella', label: 'Bella (US)', lang: 'en', gender: 'female', hd: true },
  { id: 'kokoro:bf_emma', label: 'Emma (UK)', lang: 'en', gender: 'female', hd: true },
  // Light voices (Piper): smaller download, more robotic
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
const KOKORO_BASE = () => (window as any).__kokoroBase ?? 'https://huggingface.co/onnx-community/Kokoro-82M-v1.0-ONNX/resolve/main/';
const KOKORO_VOCAB = new Map<string, number>([...";:,.!?—…\"()“” ̃ʣʥʦʨᵝꭧAIOQSTWYᵊabcdefhijklmnopqrstuvwxyzɑɐɒæβɔɕçɖðʤəɚɛɜɟɡɥɨɪʝɯɰŋɳɲɴøɸθœɹɾɻʁɽʂʃʈʧʊʋʌɣɤχʎʒʔˈˌːʰʲ↓→↗↘ᵻ"].map((c, i) => [c, [1, 2, 3, 4, 5, 6, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23, 24, 25, 31, 33, 35, 36, 39, 41, 42, 43, 44, 45, 46, 47, 48, 50, 51, 52, 53, 54, 55, 56, 57, 58, 59, 60, 61, 62, 63, 64, 65, 66, 67, 68, 69, 70, 71, 72, 75, 76, 77, 78, 80, 81, 82, 83, 85, 86, 87, 90, 92, 99, 101, 102, 103, 110, 111, 112, 113, 114, 115, 116, 118, 119, 120, 123, 125, 126, 128, 129, 130, 131, 132, 133, 135, 136, 138, 139, 140, 142, 143, 147, 148, 156, 157, 158, 162, 164, 169, 171, 172, 173, 177][i]]));
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
    ort.env.wasm.proxy = true; // run the model in a background thread so the page stays responsive
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
  return (await phonemize(text, espeakVoice)).phoneme_ids;
}

/** Run espeak-ng (WebAssembly) on one sentence: IPA phonemes and Piper ids. */
export async function phonemize(text: string, espeakVoice: string): Promise<any> {
  const ph = await getPhonemizer();
  return new Promise((resolve, reject) => {
    let done = false;
    ph.create({
      wasmBinary: ph.wasm,
      getPreloadedPackage: () => ph.data,
      print: (out: string) => { if (!done) { done = true; resolve(JSON.parse(out)); } },
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
  if (id.startsWith('sarvam:')) return !!getSarvamKey();
  if (!('caches' in window)) return false;
  const cache = await caches.open('storycut-voices-v1');
  if (id.startsWith('kokoro:')) return !!(await cache.match(kokoroModelUrl()));
  return !!(await cache.match(`${VOICE_BASE()}${voicePath(id)}.onnx`));
}

/** 'best' = full-precision model (clearest sound, ≈310 MB once); 'fast' = compressed model (≈90 MB, slightly hissy). */
export type HdQuality = 'best' | 'fast';
export function getHdQuality(): HdQuality { try { return (localStorage.getItem('sc-hd-quality') as HdQuality) || 'best'; } catch { return 'best'; } }
export function setHdQuality(q: HdQuality) { try { localStorage.setItem('sc-hd-quality', q); } catch { /* */ } kokoroP = null; kokoroQ = null; }
const kokoroModelUrl = (q = getHdQuality()) => `${KOKORO_BASE()}onnx/${q === 'best' ? 'model.onnx' : 'model_quantized.onnx'}`;
let kokoroQ: HdQuality | null = null;
let kokoroP: Promise<any> | null = null;
const kokoroVoices = new Map<string, Promise<Float32Array>>();
function loadKokoro(onProgress?: (p: number) => void) {
  if (!kokoroP || kokoroQ !== getHdQuality()) {
    kokoroQ = getHdQuality();
    kokoroP = (async () => {
      const [ort, model] = await Promise.all([getOrt(), fetchCached(kokoroModelUrl(), onProgress)]);
      const session = await ort.InferenceSession.create(model, { executionProviders: ['wasm'], graphOptimizationLevel: 'all' });
      await getPhonemizer();
      return session;
    })();
    kokoroP.catch(() => { kokoroP = null; });
  }
  return kokoroP;
}
function kokoroVoice(name: string) {
  let p = kokoroVoices.get(name);
  if (!p) {
    p = fetchCached(`${KOKORO_BASE()}voices/${name}.bin`).then((b) => new Float32Array(b));
    p.catch(() => kokoroVoices.delete(name));
    kokoroVoices.set(name, p);
  }
  return p;
}

/** IPA for Kokoro (same clean-up as the official kokoro.js for English). */
async function kokoroPhonemes(text: string, lang: string): Promise<string> {
  const espeak = lang === 'hi' ? 'hi' : lang.startsWith('en-gb') ? 'en' : 'en-us';
  const r = await phonemize(text, espeak);
  let ps = (r.phonemes as string[]).join('');
  if (espeak !== 'hi') ps = ps.replace(/ʲ/g, 'j').replace(/r/g, 'ɹ').replace(/x/g, 'k').replace(/ɬ/g, 'l');
  return ps.trim();
}

async function speakKokoro(text: string, voiceId: string, o: TtsOptions, onProgress: (stage: string, p: number) => void): Promise<AudioBuffer> {
  const name = voiceId.slice(7);
  const session = await loadKokoro((p) => onProgress(`Downloading the natural voice engine (once, ~${getHdQuality() === 'best' ? 310 : 90} MB)…`, p));
  const style = await kokoroVoice(name);
  const ort = await getOrt();
  const sr = 24000;
  const lang = name.startsWith('h') ? 'hi' : name.startsWith('b') ? 'en-gb' : 'en-us';
  const list = sentences(text);
  if (!list.length) throw new Error('Type some text first.');
  const inName = session.inputNames.includes('input_ids') ? 'input_ids' : 'tokens';
  // Phonemes per sentence, then several sentences of a paragraph are spoken in ONE pass, so the
  // model carries its natural flow from sentence to sentence (speaking each alone sounds mechanical).
  const toks: number[][] = [];
  for (let i = 0; i < list.length; i++) {
    onProgress('Reading the script…', i / list.length / 5);
    let t = list[i].text.replace(/[।॥]/g, '.').trim();
    if (!/[.!?,;:]$/.test(t)) t += '.';
    const ps = await kokoroPhonemes(t, lang);
    toks.push([...ps].map((c) => KOKORO_VOCAB.get(c)).filter((x): x is number => x !== undefined));
  }
  const chunks: { ids: number[]; pauseAfter: number }[] = [];
  let cur: number[] = [];
  for (let i = 0; i < list.length; i++) {
    let ids = toks[i];
    while (ids.length > 480) { // very long sentence: split at a space
      let cut = ids.lastIndexOf(16, 480); if (cut < 200) cut = 480;
      if (cur.length) { chunks.push({ ids: cur, pauseAfter: 0 }); cur = []; }
      chunks.push({ ids: ids.slice(0, cut), pauseAfter: 0.05 }); ids = ids.slice(cut);
    }
    if (cur.length && cur.length + 1 + ids.length > 380) { chunks.push({ ids: cur, pauseAfter: 0.75 }); cur = []; }
    cur = cur.length ? [...cur, 16, ...ids] : [...ids];
    const p = list[i].pauseAfter;
    if (p > 1 || i === list.length - 1) { chunks.push({ ids: cur, pauseAfter: p }); cur = []; } // paragraph end
  }
  const pcm: Float32Array[] = [];
  let seed = 7;
  const rnd = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
  for (let i = 0; i < chunks.length; i++) {
    onProgress(`Speaking part ${i + 1} of ${chunks.length}…`, 0.2 + (0.8 * i) / chunks.length);
    const part = chunks[i].ids;
    if (!part.length) continue;
    const row = Math.min(part.length, 509);
    const sp = o.speed * (0.975 + rnd() * 0.05); // tiny pace changes like a real reader
    const feeds: Record<string, any> = {
      [inName]: new ort.Tensor('int64', BigInt64Array.from([0, ...part, 0].map((x) => BigInt(x))), [1, part.length + 2]),
      style: new ort.Tensor('float32', style.slice(row * 256, row * 256 + 256), [1, 256]),
      speed: new ort.Tensor('float32', Float32Array.from([Math.max(0.5, Math.min(2, sp))]), [1]),
    };
    const out = await session.run(feeds);
    pcm.push(trimEdges((out.waveform ?? out.audio ?? Object.values(out)[0]).data as Float32Array, sr));
    const gap = Math.round(sr * (0.12 + chunks[i].pauseAfter * o.pause * (0.85 + rnd() * 0.3)));
    if (i < chunks.length - 1) pcm.push(new Float32Array(gap));
    await new Promise((r) => setTimeout(r, 0));
  }
  return join(pcm, sr, onProgress);
}

/** Remove the model's own silence at both ends (pauses are then set evenly by us). */
function trimEdges(a: Float32Array, sr: number) {
  let pk = 0; for (let i = 0; i < a.length; i++) pk = Math.max(pk, Math.abs(a[i]));
  const th = pk * 0.01, pad = Math.round(sr * 0.04);
  let s = 0, e = a.length - 1;
  while (s < a.length && Math.abs(a[s]) < th) s++;
  while (e > s && Math.abs(a[e]) < th) e--;
  return a.slice(Math.max(0, s - pad), Math.min(a.length, e + pad * 2));
}

function join(pcm: Float32Array[], sr: number, onProgress: (stage: string, p: number) => void) {
  const total = pcm.reduce((n, a) => n + a.length, 0);
  const buf = new AudioBuffer({ length: Math.max(1, total), numberOfChannels: 1, sampleRate: sr });
  const ch = buf.getChannelData(0);
  let off = 0;
  for (const a of pcm) { ch.set(a, off); off += a.length; }
  onProgress('Done', 1);
  return buf;
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
/**
 * Make a pasted script speakable: drop time codes (00:05–00:39), [stage directions], markdown marks,
 * and — for Hindi/Malayalam/Nepali voices — lines that are notes in English. Returns what was left out.
 */
export function cleanScript(text: string, lang: string): { text: string; skipped: string[] } {
  const skipped: string[] = [];
  const TC = /\(?\b\d{1,2}:\d{2}(?::\d{2})?(?:\s*(?:[-–—~]|to|से)\s*\d{1,2}:\d{2}(?::\d{2})?)?\s*(?:सेकंड|sec|s)?\)?/gi;
  const lines = text.replace(/\r/g, '').split('\n').map((line) => {
    let l = line;
    // a whole line in bold or a markdown heading is a section title, not narration
    if (/^\s*(\*\*[^*]+\*\*|#{1,6}\s.*)\s*:?\s*$/.test(l)) { skipped.push(`heading: ${l.replace(/[*#]/g, '').trim()}`); return ''; }
    const tcs = l.match(TC);
    if (tcs) { skipped.push(...tcs.map((t) => `time code ${t.trim()}`)); l = l.replace(TC, ' '); }
    l = l.replace(/\[[^\]]*\]/g, (m) => { skipped.push(m); return ' '; });
    l = l.replace(/^\s*(?:#{1,6}|[-*•●▪➤►]|\d+[.)])\s+/, '').replace(/[*_#`|>]+/g, ' ');
    l = l.replace(/^\s*(?:VO|V\.O\.|Voice ?over|Narrator|Scene \d+|Shot \d+|Visual|Visuals|B-?roll|Music|SFX|Text on screen|Super)\s*[:–-]\s*/i, '');
    if (lang !== 'en') {
      const latin = (l.match(/[A-Za-z]/g) ?? []).length, other = (l.match(/[\u0900-\u0DFF]/g) ?? []).length;
      if (latin > 12 && latin > other * 1.5) { skipped.push(l.trim()); return ''; }
      // notes in English in brackets inside a Hindi line
      l = l.replace(/\(([^)]*)\)/g, (m, inner) => ((inner.match(/[A-Za-z]/g) ?? []).length > 8 ? (skipped.push(m), ' ') : m));
    }
    return l.replace(/\s{2,}/g, ' ').trim();
  });
  return { text: lines.join('\n').replace(/\n{3,}/g, '\n\n').trim(), skipped: skipped.filter((x) => /[\p{L}\p{N}]/u.test(x)) };
}

export function sentences(text: string): { text: string; pauseAfter: number }[] {
  const out: { text: string; pauseAfter: number }[] = [];
  const paras = text.replace(/\r/g, '').split(/\n\s*\n|\n/);
  paras.forEach((para, pi) => {
    const parts = para.match(/[^.!?।॥]+[.!?।॥]*["'”’)]*\s*/g) ?? [];
    const clean = parts.map((s) => s.trim()).filter((s) => /[\p{L}\p{N}]/u.test(s));
    clean.forEach((s, i) => {
      // very long sentences are split at commas so the model keeps a natural rhythm
      const pieces = s.length > 260 ? s.split(/(?<=[,;:])\s+/) : [s];
      pieces.forEach((piece, k) => out.push({ text: piece, pauseAfter: k < pieces.length - 1 ? 0.25 : i < clean.length - 1 ? 1 : pi < paras.length - 1 ? 1.4 : 0 }));
    });
  });
  return out;
}

export interface TtsOptions { speed: number; variation: number; pause: number } // speed 0.5–2, variation 0–1, pause seconds

/** Speak the text with a voice. Returns mono audio at the voice's sample rate. */
export async function speak(text: string, voiceId: string, o: TtsOptions, onProgress: (stage: string, p: number) => void): Promise<AudioBuffer> {
  const v = VOICES.find((x) => x.id === voiceId);
  text = cleanScript(text, v?.lang ?? 'en').text;
  if (voiceId.startsWith('sarvam:')) return speakSarvam(text, voiceId, o, onProgress);
  if (voiceId.startsWith('kokoro:')) return speakKokoro(text, voiceId, o, onProgress);
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

// ---------- Studio voices: Sarvam AI (Bulbul v3) ----------
export function getSarvamKey(): string { try { return localStorage.getItem('sc-sarvam-key') || ''; } catch { return ''; } }
export function setSarvamKey(k: string) { try { if (k) localStorage.setItem('sc-sarvam-key', k.trim()); else localStorage.removeItem('sc-sarvam-key'); } catch { /* */ } }
const SARVAM_URL = () => (window as any).__sarvamUrl ?? 'https://api.sarvam.ai/text-to-speech';

/** Split into requests of at most `max` characters, at paragraph, then sentence, then word boundaries. */
function packText(text: string, max = 2200): { text: string; paraEnd: boolean }[] {
  const out: { text: string; paraEnd: boolean }[] = [];
  for (const para of text.split(/\n\s*\n|\n/).map((p) => p.trim()).filter(Boolean)) {
    let cur = '';
    const parts = para.match(/[^.!?।॥]+[.!?।॥]*\s*/g) ?? [para];
    for (let p of parts) {
      while (p.length > max) { const cut = p.lastIndexOf(' ', max) > 0 ? p.lastIndexOf(' ', max) : max; if (cur) { out.push({ text: cur.trim(), paraEnd: false }); cur = ''; } out.push({ text: p.slice(0, cut).trim(), paraEnd: false }); p = p.slice(cut); }
      if ((cur + p).length > max) { out.push({ text: cur.trim(), paraEnd: false }); cur = ''; }
      cur += p;
    }
    if (cur.trim()) out.push({ text: cur.trim(), paraEnd: true });
  }
  return out;
}

async function speakSarvam(text: string, voiceId: string, o: TtsOptions, onProgress: (stage: string, p: number) => void): Promise<AudioBuffer> {
  const key = getSarvamKey();
  if (!key) throw new Error('Add your Sarvam API key first (box under the voice list).');
  const [, speaker, en] = voiceId.split(':');
  const pieces = packText(text);
  if (!pieces.length) throw new Error('Type some text first.');
  const ctx = new OfflineAudioContext(1, 1, 44100);
  const bufs: { buf: AudioBuffer; gap: number }[] = [];
  for (let i = 0; i < pieces.length; i++) {
    onProgress(`Studio voice: part ${i + 1} of ${pieces.length}…`, i / pieces.length);
    let res: Response;
    try {
      res = await fetch(SARVAM_URL(), {
        method: 'POST',
        headers: { 'api-subscription-key': key, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          text: pieces[i].text, model: 'bulbul:v3', speaker, language_code: en ? 'en-IN' : 'hi-IN',
          pace: Math.max(0.5, Math.min(2, o.speed)), temperature: Math.max(0.01, Math.min(1, 0.3 + o.variation * 0.6)),
          speech_sample_rate: 44100, output_audio_codec: 'wav',
        }),
      });
    } catch {
      throw new Error('Could not reach Sarvam AI. Check the internet connection (some office networks block it), or use a Natural HD voice.');
    }
    if (res.status === 401 || res.status === 403) throw new Error('Sarvam did not accept the API key. Copy it again from dashboard.sarvam.ai.');
    if (res.status === 402 || res.status === 429) throw new Error('Sarvam says the credits or the rate limit are used up. Check your Sarvam dashboard.');
    if (!res.ok) throw new Error(`Sarvam error ${res.status}: ${(await res.text()).slice(0, 200)}`);
    const j = await res.json();
    const parts: AudioBuffer[] = [];
    for (const b64 of j.audios ?? []) {
      const bin = atob(b64), bytes = new Uint8Array(bin.length);
      for (let k = 0; k < bin.length; k++) bytes[k] = bin.charCodeAt(k);
      parts.push(await ctx.decodeAudioData(bytes.buffer));
    }
    parts.forEach((b, k) => bufs.push({ buf: b, gap: k === parts.length - 1 ? (i === pieces.length - 1 ? 0 : pieces[i].paraEnd ? 0.7 * Math.max(0.3, o.pause / 0.6) : 0.25) : 0.25 }));
  }
  const sr = bufs[0].buf.sampleRate;
  const pcm: Float32Array[] = [];
  for (const { buf, gap } of bufs) { pcm.push(buf.getChannelData(0)); if (gap > 0) pcm.push(new Float32Array(Math.round(sr * gap))); }
  return join(pcm, sr, onProgress);
}
