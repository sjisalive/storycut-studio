// Voice / background separation without AI, in a background thread.
// STFT → for every time-frequency point decide how much is "voice":
//   • centre extraction: voices are mixed in the middle of a stereo track, most
//     music is spread left/right — so energy common to L and R counts as voice;
//   • speech band: keep 90 Hz – 7.5 kHz for the voice, smoothly;
//   • noise reduction: subtract each band's steady noise floor (fans, hiss, hum);
//   • phrase gate: quieten the voice between phrases so music doesn't leak in.
// Background = original − voice (keeps the music in stereo).

interface Job { left: Float32Array; right: Float32Array; sampleRate: number; strength: number; denoise: boolean }

const N = 2048, HOP = 512;

function fft(re: Float64Array, im: Float64Array, inverse: boolean) {
  const n = re.length;
  for (let i = 1, j = 0; i < n; i++) {
    let bit = n >> 1;
    for (; j & bit; bit >>= 1) j ^= bit;
    j ^= bit;
    if (i < j) { let t = re[i]; re[i] = re[j]; re[j] = t; t = im[i]; im[i] = im[j]; im[j] = t; }
  }
  for (let len = 2; len <= n; len <<= 1) {
    const ang = ((inverse ? 2 : -2) * Math.PI) / len;
    const wr = Math.cos(ang), wi = Math.sin(ang);
    for (let i = 0; i < n; i += len) {
      let cr = 1, ci = 0;
      for (let k = 0; k < len / 2; k++) {
        const ar = re[i + k], ai = im[i + k];
        const br = re[i + k + len / 2] * cr - im[i + k + len / 2] * ci;
        const bi = re[i + k + len / 2] * ci + im[i + k + len / 2] * cr;
        re[i + k] = ar + br; im[i + k] = ai + bi;
        re[i + k + len / 2] = ar - br; im[i + k + len / 2] = ai - bi;
        const t = cr * wr - ci * wi; ci = cr * wi + ci * wr; cr = t;
      }
    }
  }
  if (inverse) for (let i = 0; i < n; i++) { re[i] /= n; im[i] /= n; }
}

self.onmessage = (ev: MessageEvent<Job>) => {
  const { left, right, sampleRate: sr, strength, denoise } = ev.data;
  const stereo = left !== right && left.length === right.length;
  const len = left.length;
  const frames = Math.max(1, Math.ceil(len / HOP) + 1);
  const bins = N / 2 + 1;
  const win = new Float64Array(N);
  for (let i = 0; i < N; i++) win[i] = 0.5 - 0.5 * Math.cos((2 * Math.PI * i) / N);
  const hzPerBin = sr / N;
  // smooth speech band weight
  const band = new Float64Array(bins);
  for (let k = 0; k < bins; k++) {
    const f = k * hzPerBin;
    const lo = f < 60 ? 0 : f < 110 ? (f - 60) / 50 : 1;
    const hi = f > 9000 ? 0 : f > 7000 ? (9000 - f) / 2000 : 1;
    band[k] = lo * hi;
  }
  const power = 1 + strength * 2; // how strictly "centre" must be centre
  const re = new Float64Array(N), im = new Float64Array(N), re2 = new Float64Array(N), im2 = new Float64Array(N);
  const mask = new Float64Array(bins);
  // Analyse one frame: fills re/im (left), re2/im2 (right) and the voice mask (before noise reduction).
  const analyse = (f: number) => {
    const start = f * HOP - N / 2;
    for (let i = 0; i < N; i++) {
      const s = start + i;
      const l = s >= 0 && s < len ? left[s] : 0;
      const r = s >= 0 && s < len ? right[s] : 0;
      re[i] = l * win[i]; im[i] = 0; re2[i] = r * win[i]; im2[i] = 0;
    }
    fft(re, im, false); fft(re2, im2, false);
    for (let k = 0; k < bins; k++) {
      const sR = (re[k] - re2[k]) / 2, sI = (im[k] - im2[k]) / 2;
      const m = Math.hypot((re[k] + re2[k]) / 2, (im[k] + im2[k]) / 2), sd = Math.hypot(sR, sI);
      mask[k] = (stereo ? Math.pow(Math.max(0, 1 - sd / (m + 1e-9)), power) : 1) * band[k];
    }
  };
  const midMag = (k: number) => Math.hypot((re[k] + re2[k]) / 2, (im[k] + im2[k]) / 2);
  // ---- pass 1: noise floor per frequency (from every 4th frame — small memory)
  const floor = new Float32Array(bins);
  if (denoise) {
    const step = 4, nf = Math.ceil(frames / step);
    const samp = new Float32Array(nf * bins);
    for (let j = 0; j < nf; j++) {
      analyse(j * step);
      for (let k = 0; k < bins; k++) samp[j * bins + k] = midMag(k) * mask[k];
      if (j % 50 === 0) (self as any).postMessage({ progress: (0.25 * j) / nf });
    }
    const col = new Float32Array(nf);
    for (let k = 0; k < bins; k++) {
      for (let j = 0; j < nf; j++) col[j] = samp[j * bins + k];
      col.sort();
      floor[k] = col[Math.floor(nf * 0.2)] ?? 0;
    }
  }
  const over = 1.5 + strength * 1.5;
  const applyDenoise = () => {
    if (!denoise) return;
    for (let k = 0; k < bins; k++) {
      const v = midMag(k) * mask[k];
      if (v > 0) mask[k] *= Math.max(0.05, 1 - (over * floor[k]) / v);
    }
  };
  // ---- pass 2: voice energy per frame (for the phrase gate)
  const eng = new Float32Array(frames);
  const k1 = Math.floor(250 / hzPerBin), k2 = Math.ceil(3500 / hzPerBin);
  for (let f = 0; f < frames; f++) {
    analyse(f); applyDenoise();
    let e = 0;
    for (let k = k1; k <= k2; k++) e += (midMag(k) * mask[k]) ** 2;
    eng[f] = e;
    if (f % 200 === 0) (self as any).postMessage({ progress: 0.25 + (0.3 * f) / frames });
  }
  const sortedE = Float32Array.from(eng).sort();
  const ref = sortedE[Math.floor(sortedE.length * 0.9)] || 1;
  const gate = new Float32Array(frames);
  let g = 0;
  for (let f = 0; f < frames; f++) {
    const target = eng[f] > ref * (0.02 + 0.04 * strength) ? 1 : 0.08;
    g = target > g ? g + (target - g) * 0.6 : g + (target - g) * 0.12; // fast open, slow close
    gate[f] = g;
  }
  // ---- pass 3: rebuild voice (mono) and background (stereo) by overlap-add
  const voice = new Float32Array(len), bgL = new Float32Array(len), bgR = new Float32Array(len);
  const norm = new Float32Array(len);
  const vr = new Float64Array(N), vi = new Float64Array(N);
  for (let f = 0; f < frames; f++) {
    analyse(f); applyDenoise();
    vr.fill(0); vi.fill(0);
    for (let k = 0; k < bins; k++) {
      const w = mask[k] * gate[f];
      const a = ((re[k] + re2[k]) / 2) * w, b = ((im[k] + im2[k]) / 2) * w;
      vr[k] = a; vi[k] = b;
      if (k > 0 && k < N / 2) { vr[N - k] = a; vi[N - k] = -b; }
    }
    fft(vr, vi, true);
    const start = f * HOP - N / 2;
    for (let i = 0; i < N; i++) {
      const s = start + i;
      if (s < 0 || s >= len) continue;
      voice[s] += vr[i] * win[i];
      norm[s] += win[i] * win[i];
    }
    if (f % 200 === 0) (self as any).postMessage({ progress: 0.55 + (0.43 * f) / frames });
  }
  for (let i = 0; i < len; i++) {
    const v = norm[i] > 1e-6 ? voice[i] / norm[i] : 0;
    voice[i] = v;
    bgL[i] = left[i] - v;
    bgR[i] = (stereo ? right[i] : left[i]) - v;
  }
  (self as any).postMessage({ done: true, voice, bgL, bgR }, [voice.buffer, bgL.buffer, bgR.buffer]);
};
