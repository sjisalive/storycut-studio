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
  clarity?: number; // dB around 2 kHz — makes words easier to follow
  mud?: number; // dB around 300 Hz (negative removes boominess)
  air?: boolean; // soft room tone + light breaths before phrases (sounds recorded, not generated)
  intonation?: number; // 1 = as recorded; >1 livelier rise and fall, <1 flatter
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
  ['clear', '✨ Clear voice-over', { lowCut: 100, bass: -2, mud: -3, clarity: 4, presence: 5, treble: 5, compress: 0.45, loudness: -16, maxPause: 0.8, air: true }],
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

function runStretch(channels: Float32Array[], sr: number, rate: number, maxPause: number, onProgress: (p: number) => void, pitch = 0, expand = 1): Promise<Float32Array[]> {
  if (Math.abs(rate - 1) < 1e-3 && maxPause <= 0 && !pitch && Math.abs(expand - 1) < 0.01) return Promise.resolve(channels);
  return new Promise((resolve, reject) => {
    const w = new Worker(new URL('./stretch.worker.ts', import.meta.url), { type: 'module' });
    w.onmessage = (e) => { if (e.data.progress !== undefined) onProgress(e.data.progress); else { w.terminate(); resolve(e.data.channels); } };
    w.onerror = (e) => { w.terminate(); reject(new Error(e.message)); };
    const copies = channels.map((c) => c.slice());
    w.postMessage({ channels: copies, sampleRate: sr, rate, maxPause, pitch, expand }, copies.map((c) => c.buffer));
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
  ch = await runStretch(ch, sr, rate, s.maxPause, (p) => onProgress('Changing speed and pitch…', p), natural ? s.pitch : 0, s.intonation ?? 1);
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
  eq('peaking', 300, s.mud ?? 0, 1.1);
  eq('peaking', 800, s.mid, 0.8);
  eq('peaking', 2000, s.clarity ?? 0, 0.8);
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
  if (s.air) addAir(res);
  onProgress('Done', 1);
  return res;
}

/** The finish used for new voice-overs: clear, bright speech with a natural, recorded feel. */
export const CLEAR_FINISH: Partial<StudioSettings> = { lowCut: 100, bass: -2, mud: -3, mid: 0, clarity: 4, presence: 5, treble: 5, compress: 0.45, loudness: -16, air: true };

/** Soft room tone everywhere and a quiet breath before some phrases. */
function addAir(buf: AudioBuffer) {
  const sr = buf.sampleRate, n = buf.length;
  const mono = buf.getChannelData(0);
  let seed = 11; const rnd = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
  const noise = () => (rnd() + rnd() + rnd() - 1.5) * 1.2;
  // phrase onsets after pauses of 0.35 s or more
  const fr = Math.round(sr * 0.01), frames = Math.floor(n / fr), lvl = new Float32Array(frames);
  let top = 0;
  for (let f = 0; f < frames; f++) { let e = 0; for (let i = f * fr; i < (f + 1) * fr; i++) e += mono[i] * mono[i]; lvl[f] = Math.sqrt(e / fr); if (lvl[f] > top) top = lvl[f]; }
  const quiet = (f: number) => lvl[f] < top * 0.02;
  const onsets: number[] = [];
  let run = 0;
  for (let f = 0; f < frames; f++) { if (quiet(f)) run++; else { if (run >= 35 && f > 40) onsets.push(f * fr); run = 0; } }
  const add = new Float32Array(n);
  // breath: band-limited noise with a soft swell, ~0.3 s, ending 80 ms before the phrase
  for (const at of onsets) {
    if (rnd() > 0.6) continue;
    const L = Math.round(sr * (0.24 + rnd() * 0.14)), start = at - Math.round(sr * 0.08) - L;
    if (start < 0) continue;
    const amp = 0.006 + rnd() * 0.004;
    let lp = 0, hp = 0, prev = 0;
    for (let i = 0; i < L; i++) {
      const w = noise(); lp += 0.35 * (w - lp); hp = 0.92 * (hp + lp - prev); prev = lp;
      add[start + i] += hp * amp * Math.pow(Math.sin((Math.PI * i) / L), 1.6);
    }
  }
  // room tone ≈ −64 dBFS, slightly darker than white noise
  let lp = 0;
  for (let i = 0; i < n; i++) { lp += 0.25 * (noise() - lp); add[i] += lp * 0.0009; }
  for (let c = 0; c < buf.numberOfChannels; c++) { const d = buf.getChannelData(c); for (let i = 0; i < n; i++) d[i] += add[i]; }
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

/** What a voice sounds like: pitch, liveliness, pace and brightness. */
export interface VoiceProfile { f0: number; spread: number; rate: number; bands: number[] }

export function voiceProfile(buf: AudioBuffer): VoiceProfile {
  // 16 kHz mono copy
  const src = buf.getChannelData(0), dec = buf.sampleRate / 16000;
  const n = Math.floor(src.length / dec), x = new Float32Array(n);
  for (let i = 0; i < n; i++) x[i] = src[Math.floor(i * dec)];
  const sr = 16000, W = 640, lo = Math.floor(sr / 400), hi = Math.ceil(sr / 60);
  let peak = 0; for (let i = 0; i < n; i += 7) peak = Math.max(peak, Math.abs(x[i]));
  const f0: number[] = [];
  for (let s0 = 0; s0 + W + hi < n; s0 += 480) {
    let e0 = 0; for (let i = 0; i < W; i++) e0 += x[s0 + i] * x[s0 + i];
    if (Math.sqrt(e0 / W) < peak * 0.04) continue;
    let best = 0, bl = 0;
    for (let L = lo; L <= hi; L++) { let c = 0, e1 = 0; for (let i = 0; i < W; i += 2) { const a = x[s0 + i + L]; c += x[s0 + i] * a; e1 += a * a; } const r = c / Math.sqrt((e0 / 2) * e1 + 1e-12); if (r > best) { best = r; bl = L; } }
    if (best > 0.5) f0.push(sr / bl);
  }
  f0.sort((a, b) => a - b);
  const med = f0[f0.length >> 1] || 120;
  const st = f0.map((v) => 12 * Math.log2(v / med));
  const spread = Math.sqrt(st.reduce((a, v) => a + v * v, 0) / Math.max(1, st.length));
  // pace: loudness bumps per second of speech (≈ syllables)
  // speech band 300–2500 Hz (one-pole high-pass + low-pass) so bass and hiss don't count
  const bp = new Float32Array(n);
  { const ah = Math.exp((-2 * Math.PI * 300) / sr), al = 1 - Math.exp((-2 * Math.PI * 2500) / sr); let hp = 0, px = 0, lp = 0;
    for (let i = 0; i < n; i++) { hp = ah * (hp + x[i] - px); px = x[i]; lp += al * (hp - lp); bp[i] = lp; } }
  const hop = 160, E: number[] = [];
  for (let i = 0; i + hop < n; i += hop) { let s = 0; for (let k = 0; k < hop; k++) s += Math.abs(bp[i + k]); E.push(s / hop); }
  const Es = E.map((_, i) => (E[i - 2] ?? 0) / 5 + (E[i - 1] ?? 0) / 5 + E[i] / 5 + (E[i + 1] ?? 0) / 5 + (E[i + 2] ?? 0) / 5);
  const sorted = [...Es].sort((a, b) => a - b), top = sorted[Math.floor(sorted.length * 0.95)] || 1e-6;
  let active = 0, bumps = 0, last = -99;
  for (let i = 1; i < Es.length - 1; i++) {
    if (Es[i] < top * 0.056) continue;
    active++;
    if (Es[i] > Es[i - 1] && Es[i] >= Es[i + 1] && i - last >= 10) {
      // a bump counts when it stands out from the dip before it
      let dip = Es[i]; for (let k = Math.max(last, i - 25); k < i; k++) dip = Math.min(dip, Es[k]);
      if (Es[i] - dip > top * 0.15) { bumps++; last = i; }
    }
  }
  const rate = bumps / Math.max(1, active / 100);
  // brightness: energy in 80–250, 250–1k, 1–4k, 4–8k Hz (relative dB)
  const full = buf.getChannelData(0), N = 4096, R = buf.sampleRate;
  const edges = [80, 250, 1000, 4000, 8000].map((f) => Math.round((f / R) * N));
  const acc = [0, 0, 0, 0];
  const re = new Float64Array(N), im = new Float64Array(N);
  for (let s0 = 0; s0 + N < full.length; s0 += N * 8) {
    for (let i = 0; i < N; i++) { re[i] = full[s0 + i] * (0.5 - 0.5 * Math.cos((2 * Math.PI * i) / N)); im[i] = 0; }
    fft(re, im);
    for (let b = 0; b < 4; b++) for (let k = edges[b]; k < edges[b + 1]; k++) acc[b] += re[k] * re[k] + im[k] * im[k];
  }
  const dbs = acc.map((v) => 10 * Math.log10(v + 1e-12)), mx = Math.max(...dbs);
  return { f0: med, spread, rate, bands: dbs.map((v) => v - mx) };
}

function fft(re: Float64Array, im: Float64Array) {
  const n = re.length;
  for (let i = 1, j = 0; i < n; i++) { let bit = n >> 1; for (; j & bit; bit >>= 1) j ^= bit; j ^= bit; if (i < j) { [re[i], re[j]] = [re[j], re[i]]; [im[i], im[j]] = [im[j], im[i]]; } }
  for (let len = 2; len <= n; len <<= 1) {
    const a = (-2 * Math.PI) / len, wr = Math.cos(a), wi = Math.sin(a);
    for (let i = 0; i < n; i += len) {
      let cr = 1, ci = 0;
      for (let k = 0; k < len / 2; k++) {
        const ur = re[i + k], ui = im[i + k], vr = re[i + k + len / 2] * cr - im[i + k + len / 2] * ci, vi = re[i + k + len / 2] * ci + im[i + k + len / 2] * cr;
        re[i + k] = ur + vr; im[i + k] = ui + vi; re[i + k + len / 2] = ur - vr; im[i + k + len / 2] = ui - vi;
        const t = cr * wr - ci * wi; ci = cr * wi + ci * wr; cr = t;
      }
    }
  }
}

const clamp = (v: number, a: number, b: number) => Math.max(a, Math.min(b, v));
/** Settings that bring a voice close to a sample voice (pitch, liveliness, pace, tone). */
export function matchVoice(src: VoiceProfile, ref: VoiceProfile): Partial<StudioSettings> {
  const r1 = (v: number) => Math.round(v * 2) / 2;
  const d = (i: number) => clamp(ref.bands[i] - src.bands[i], -9, 9);
  const pace = ref.rate / Math.max(1, src.rate);
  return {
    pitch: r1(clamp(12 * Math.log2(ref.f0 / src.f0), -7, 7)),
    intonation: Math.round(clamp(ref.spread / Math.max(0.5, src.spread), 0.7, 1.6) * 100) / 100,
    speed: Math.abs(pace - 1) < 0.05 ? 1 : Math.round(clamp(pace, 0.9, 1.15) * 20) / 20,
    bass: r1(d(0) * 0.75 - Math.max(0, d(1)) / 2), mid: r1(d(1) * 0.75), presence: r1(d(2)), treble: r1(Math.max(-1, d(3) * 0.75)),
    lowCut: 70, compress: 0.55, loudness: -16, character: true,
  };
}
