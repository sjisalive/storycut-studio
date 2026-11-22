// Sound Studio: voice/sound processing chain.
//   clean-up → shorten pauses → speed (pitch kept) → pitch → tone (low cut, bass, middle,
//   presence, treble) → compression → echo → reverb → fades → loudness & peak limit.
import { normaliseLoudness } from './loudness';
import { separateVoice } from './separate';

export interface StudioSettings {
  gain: number; // dB
  lowCut: number; // Hz (0 = off)
  bass: number; mid: number; presence: number; treble: number; // dB
  speed: number; // 0.5–2 (pitch kept)
  pitch: number; // semitones −12…+12
  character?: boolean; // false = cartoon pitch change (voice character changes too)
  compress: number; // 0–1
  echo: number; // 0–1
  reverb: number; // 0–1
  fadeIn: number; fadeOut: number; // seconds
  loudness: number | null; // LUFS target (null = keep)
  maxPause: number; // seconds, 0 = keep pauses
  clean: boolean; // noise clean-up
  telephone: boolean; // narrow "phone" band
  mono: boolean;
}

export const DEFAULT_STUDIO: StudioSettings = {
  gain: 0, lowCut: 0, bass: 0, mid: 0, presence: 0, treble: 0, speed: 1, pitch: 0, compress: 0, echo: 0, reverb: 0,
  fadeIn: 0, fadeOut: 0, loudness: null, maxPause: 0, clean: false, telephone: false, mono: false,
};

export const STUDIO_PRESETS: [string, string, Partial<StudioSettings>][] = [
  ['clear', '✨ Clear voice-over', { lowCut: 90, mid: -1, presence: 3, treble: 3, compress: 0.5, loudness: -16, maxPause: 0.8 }],
  ['deep', '🎙 Deep voice', { pitch: -2.5, bass: 4, lowCut: 50, mid: -1, presence: 1.5, compress: 0.45, loudness: -16 }],
  ['radio', '📻 Radio announcer', { lowCut: 100, bass: 3, mid: -2, presence: 4, treble: 2, compress: 0.85, loudness: -14 }],
  ['podcast', '🎧 Warm podcast', { lowCut: 70, bass: 2, mid: 0, presence: 1.5, treble: -1, compress: 0.6, loudness: -16 }],
  ['crisp', '🔆 Bright & crisp', { lowCut: 90, presence: 3, treble: 5, compress: 0.4, loudness: -16 }],
  ['phone', '☎️ Telephone', { telephone: true, compress: 0.5, loudness: -18 }],
  ['hall', '🏛 Big hall', { reverb: 0.55, compress: 0.3, loudness: -16 }],
  ['echo', '🔁 Echo', { echo: 0.45, loudness: -16 }],
  ['fast', '⏩ Faster (1.2×)', { speed: 1.2 }],
  ['calm', '🐢 Slower & calm (0.9×)', { speed: 0.9, maxPause: 0 }],
  ['chip', '🐿 Chipmunk', { pitch: 6, speed: 1.05, character: false }],
  ['giant', '👹 Giant', { pitch: -6, bass: 3, character: false }],
];

function runStretch(channels: Float32Array[], sr: number, rate: number, maxPause: number, onProgress: (p: number) => void, pitch = 0): Promise<Float32Array[]> {
  if (Math.abs(rate - 1) < 1e-3 && maxPause <= 0 && !pitch) return Promise.resolve(channels);
  return new Promise((resolve, reject) => {
    const w = new Worker(new URL('./stretch.worker.ts', import.meta.url), { type: 'module' });
    w.onmessage = (e) => { if (e.data.progress !== undefined) onProgress(e.data.progress); else { w.terminate(); resolve(e.data.channels); } };
    w.onerror = (e) => { w.terminate(); reject(new Error(e.message)); };
    const copies = channels.map((c) => c.slice());
    w.postMessage({ channels: copies, sampleRate: sr, rate, maxPause, pitch }, copies.map((c) => c.buffer));
  });
}

function impulse(ctx: BaseAudioContext, seconds: number) {
  const len = Math.round(ctx.sampleRate * seconds);
  const ir = ctx.createBuffer(2, len, ctx.sampleRate);
  for (let c = 0; c < 2; c++) {
    const d = ir.getChannelData(c);
    for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 3.2);
  }
  return ir;
}

export async function processSound(input: AudioBuffer, s: StudioSettings, onProgress: (stage: string, p: number) => void): Promise<AudioBuffer> {
  let buf = input;
  if (s.clean) {
    onProgress('Cleaning noise…', 0);
    buf = (await separateVoice(buf, 0.3, true, (p) => onProgress('Cleaning noise…', p))).voice;
  }
  const sr = buf.sampleRate;
  // natural pitch change (keeps the voice's character) is done in the worker; the cartoon one by resampling
  const natural = s.character !== false;
  const pitchF = natural ? 1 : Math.pow(2, s.pitch / 12);
  // stretch so that after the pitch resample the length matches the chosen speed
  const rate = s.speed / pitchF;
  onProgress('Changing speed…', 0);
  let ch: Float32Array[] = Array.from({ length: buf.numberOfChannels }, (_, i) => buf.getChannelData(i));
  if (s.mono && ch.length > 1) { const m = new Float32Array(ch[0].length); for (let i = 0; i < m.length; i++) m[i] = (ch[0][i] + ch[1][i]) / 2; ch = [m]; }
  ch = await runStretch(ch, sr, rate, s.maxPause, (p) => onProgress('Changing speed and pitch…', p), natural ? s.pitch : 0);
  const mid = new AudioBuffer({ length: Math.max(1, ch[0].length), numberOfChannels: ch.length, sampleRate: sr });
  ch.forEach((c, i) => mid.copyToChannel(c as Float32Array<ArrayBuffer>, i));
  // ---- filters & effects in an offline audio graph
  onProgress('Shaping the sound…', 0);
  const outCh = s.mono ? 1 : Math.max(2, mid.numberOfChannels);
  const extra = s.reverb > 0 ? 2 + 2 * s.reverb : s.echo > 0 ? 1.5 : 0.05;
  const outLen = Math.ceil((mid.duration / pitchF + extra) * sr);
  const ctx = new OfflineAudioContext(outCh, outLen, sr);
  const src = ctx.createBufferSource();
  src.buffer = mid;
  src.playbackRate.value = pitchF;
  let node: AudioNode = src;
  const chain = (n: AudioNode) => { node.connect(n); node = n; };
  const g0 = ctx.createGain(); g0.gain.value = Math.pow(10, s.gain / 20); chain(g0);
  if (s.telephone) {
    const hp = ctx.createBiquadFilter(); hp.type = 'highpass'; hp.frequency.value = 350; hp.Q.value = 0.9; chain(hp);
    const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 3200; lp.Q.value = 0.9; chain(lp);
    const lp2 = ctx.createBiquadFilter(); lp2.type = 'lowpass'; lp2.frequency.value = 3400; chain(lp2);
  }
  if (s.lowCut > 0) for (let k = 0; k < 2; k++) { const f = ctx.createBiquadFilter(); f.type = 'highpass'; f.frequency.value = s.lowCut; f.Q.value = k ? 1.31 : 0.54; chain(f); } // 24 dB/octave
  const eq = (type: BiquadFilterType, freq: number, gain: number, q = 0.9) => { if (!gain) return; const f = ctx.createBiquadFilter(); f.type = type; f.frequency.value = freq; f.gain.value = gain; f.Q.value = q; chain(f); };
  eq('lowshelf', 160, s.bass);
  eq('peaking', 800, s.mid, 0.8);
  eq('peaking', 3500, s.presence, 1);
  eq('highshelf', 6500, s.treble);
  if (s.compress > 0) {
    const c = ctx.createDynamicsCompressor();
    c.threshold.value = -12 - 22 * s.compress; c.ratio.value = 2 + 6 * s.compress; c.knee.value = 8; c.attack.value = 0.008; c.release.value = 0.2;
    chain(c);
    const makeup = ctx.createGain(); makeup.gain.value = Math.pow(10, (6 * s.compress) / 20); chain(makeup);
  }
  const dry = node;
  const out = ctx.createGain();
  dry.connect(out);
  if (s.echo > 0) {
    const d = ctx.createDelay(2); d.delayTime.value = 0.32;
    const fb = ctx.createGain(); fb.gain.value = 0.25 + 0.4 * s.echo;
    const wet = ctx.createGain(); wet.gain.value = 0.35 + 0.4 * s.echo;
    const tone = ctx.createBiquadFilter(); tone.type = 'lowpass'; tone.frequency.value = 3500;
    dry.connect(d); d.connect(tone); tone.connect(fb); fb.connect(d); tone.connect(wet); wet.connect(out);
  }
  if (s.reverb > 0) {
    const conv = ctx.createConvolver(); conv.buffer = impulse(ctx, 1.2 + 2.5 * s.reverb);
    const wet = ctx.createGain(); wet.gain.value = 0.15 + 0.55 * s.reverb;
    dry.connect(conv); conv.connect(wet); wet.connect(out);
  }
  out.connect(ctx.destination);
  // fades
  const len = mid.duration / pitchF;
  if (s.fadeIn > 0) { out.gain.setValueAtTime(0, 0); out.gain.linearRampToValueAtTime(1, Math.min(len, s.fadeIn)); }
  if (s.fadeOut > 0) { out.gain.setValueAtTime(1, Math.max(0, len - s.fadeOut)); out.gain.linearRampToValueAtTime(0, len); }
  src.start(0);
  let res = await ctx.startRendering();
  // trim the tail if no echo/reverb needs it
  if (extra < 0.1) {
    const keep = Math.min(res.length, Math.ceil(len * sr));
    const t = new AudioBuffer({ length: keep, numberOfChannels: res.numberOfChannels, sampleRate: sr });
    for (let c = 0; c < res.numberOfChannels; c++) t.copyToChannel(res.getChannelData(c).subarray(0, keep), c);
    res = t;
  }
  if (s.loudness !== null) { onProgress('Setting loudness…', 0.95); normaliseLoudness(res, s.loudness, 0.89); }
  else {
    // never let it clip
    let pk = 0;
    for (let c = 0; c < res.numberOfChannels; c++) { const d = res.getChannelData(c); for (let i = 0; i < d.length; i++) pk = Math.max(pk, Math.abs(d[i])); }
    if (pk > 0.99) for (let c = 0; c < res.numberOfChannels; c++) { const d = res.getChannelData(c); for (let i = 0; i < d.length; i++) d[i] *= 0.97 / pk; }
  }
  onProgress('Done', 1);
  return res;
}

/** Quick measurements shown to the user (and used to suggest settings). */
export function analyse(buf: AudioBuffer) {
  const sr = buf.sampleRate, d = buf.getChannelData(0);
  const fr = Math.round(sr * 0.03);
  const n = Math.floor(d.length / fr);
  const db: number[] = [];
  let peak = 0, clip = 0;
  for (let f = 0; f < n; f++) {
    let s = 0;
    for (let i = f * fr; i < (f + 1) * fr; i++) { const v = d[i]; s += v * v; const a = Math.abs(v); if (a > peak) peak = a; if (a > 0.98) clip++; }
    db.push(10 * Math.log10(s / fr + 1e-12));
  }
  const sorted = [...db].sort((a, b) => a - b);
  const loud = sorted[Math.floor(n * 0.95)] ?? -60;
  const active = db.filter((x) => x > loud - 30).length / Math.max(1, n);
  let stereoSame = true;
  if (buf.numberOfChannels > 1) { const r = buf.getChannelData(1); for (let i = 0; i < d.length; i += 97) if (Math.abs(d[i] - r[i]) > 1e-3) { stereoSame = false; break; } }
  return { duration: buf.duration, peakDb: 20 * Math.log10(peak + 1e-9), clipped: clip, speechShare: active, channels: buf.numberOfChannels, mono: buf.numberOfChannels === 1 || stereoSame };
}
