// Speed change without changing pitch (WSOLA time-stretch), and pause shortening.
// Runs in a background thread so long voice-overs don't freeze the page.

interface Job { channels: Float32Array[]; sampleRate: number; rate: number; maxPause: number; pitch?: number; expand?: number }

/** Remove the part of every silence that is longer than maxPause seconds (short crossfade). */
function shortenPauses(ch: Float32Array[], sr: number, maxPause: number): Float32Array[] {
  if (maxPause <= 0) return ch;
  const n = ch[0].length, fr = Math.round(sr * 0.02);
  const frames = Math.floor(n / fr);
  const rms = new Float32Array(frames);
  for (let f = 0; f < frames; f++) {
    let s = 0;
    for (const c of ch) for (let i = f * fr; i < (f + 1) * fr; i++) s += c[i] * c[i];
    rms[f] = Math.sqrt(s / (fr * ch.length));
  }
  const sorted = Float32Array.from(rms).sort();
  const speech = sorted[Math.floor(frames * 0.9)] || 1e-4;
  const quiet = (f: number) => rms[f] < speech * 0.06;
  // ranges to keep
  const keep: [number, number][] = [];
  let start = 0, f = 0;
  const maxF = Math.round(maxPause / 0.02);
  while (f < frames) {
    if (!quiet(f)) { f++; continue; }
    let g = f;
    while (g < frames && quiet(g)) g++;
    if (g - f > maxF) {
      const cutFrom = f + Math.floor(maxF / 2), cutTo = g - Math.ceil(maxF / 2);
      keep.push([start, cutFrom * fr]);
      start = cutTo * fr;
    }
    f = g;
  }
  keep.push([start, n]);
  const fade = Math.round(sr * 0.01);
  const total = keep.reduce((a, [s, e]) => a + (e - s), 0);
  return ch.map((c) => {
    const out = new Float32Array(total);
    let o = 0;
    keep.forEach(([s, e], k) => {
      out.set(c.subarray(s, e), o);
      if (k > 0) for (let i = 0; i < fade && o + i < total; i++) out[o + i] *= i / fade; // tiny fade at each join
      if (k < keep.length - 1) for (let i = 0; i < fade; i++) { const j = o + (e - s) - 1 - i; if (j >= 0) out[j] *= i / fade; }
      o += e - s;
    });
    return out;
  });
}

/** WSOLA: rate > 1 = faster/shorter, < 1 = slower/longer; pitch stays the same. */
function wsola(ch: Float32Array[], sr: number, rate: number): Float32Array[] {
  if (Math.abs(rate - 1) < 1e-3) return ch;
  const N = Math.round(sr * 0.04) & ~1; // 40 ms frames
  const Hs = N / 2;
  const Ha = Hs * rate;
  const tol = Math.round(sr * 0.012);
  const win = new Float32Array(N);
  for (let i = 0; i < N; i++) win[i] = 0.5 - 0.5 * Math.cos((2 * Math.PI * i) / N);
  const n = ch[0].length;
  const outLen = Math.ceil(n / rate) + N;
  const mix = new Float32Array(n);
  for (const c of ch) for (let i = 0; i < n; i++) mix[i] += c[i];
  const outs = ch.map(() => new Float32Array(outLen));
  const norm = new Float32Array(outLen);
  let prev = 0; // analysis position used for the previous frame
  const frames = Math.floor((n - N) / Ha);
  for (let k = 0; k <= frames; k++) {
    const target = Math.round(k * Ha);
    let best = target;
    if (k > 0) {
      // find the shift that best continues the previous frame's natural next segment
      const nat = prev + Hs;
      let bestScore = -Infinity;
      for (let d = -tol; d <= tol; d += 2) {
        const p = target + d;
        if (p < 0 || p + N > n || nat + Hs > n) continue;
        let s = 0;
        for (let i = 0; i < Hs; i += 4) s += mix[nat + i] * mix[p + i];
        if (s > bestScore) { bestScore = s; best = p; }
      }
    }
    best = Math.max(0, Math.min(n - N, best));
    const o = k * Hs;
    for (let c = 0; c < ch.length; c++) {
      const src = ch[c], dst = outs[c];
      for (let i = 0; i < N && o + i < outLen; i++) dst[o + i] += src[best + i] * win[i];
    }
    for (let i = 0; i < N && o + i < outLen; i++) norm[o + i] += win[i];
    prev = best;
    if (k % 500 === 0) (self as any).postMessage({ progress: k / frames });
  }
  const len = Math.min(outLen, Math.round(n / rate));
  return outs.map((d) => {
    const r = new Float32Array(len);
    for (let i = 0; i < len; i++) r[i] = norm[i] > 1e-3 ? d[i] / norm[i] : 0;
    return r;
  });
}

/** Pitch track (Hz per 10 ms hop, 0 = unvoiced) on a 8 kHz copy, autocorrelation based. */
function trackPitch(x: Float32Array, sr: number): { f0: Float32Array; hop: number } {
  const dec = Math.max(1, Math.round(sr / 8000)), fs = sr / dec;
  const n = Math.floor(x.length / dec);
  const y = new Float32Array(n);
  for (let i = 0; i < n; i++) { let s = 0; for (let k = 0; k < dec; k++) s += x[i * dec + k]; y[i] = s / dec; }
  const hop = Math.round(sr * 0.01), hopD = hop / dec;
  const W = Math.round(fs * 0.04), lo = Math.floor(fs / 400), hi = Math.ceil(fs / 60);
  const frames = Math.floor(x.length / hop);
  const f0 = new Float32Array(frames), en = new Float32Array(frames);
  let maxE = 0;
  for (let f = 0; f < frames; f++) { const s0 = Math.round(f * hopD); let e = 0; for (let i = s0; i < s0 + W && i < n; i++) e += y[i] * y[i]; en[f] = e; if (e > maxE) maxE = e; }
  for (let f = 0; f < frames; f++) {
    const s0 = Math.round(f * hopD);
    if (s0 + W + hi >= n || en[f] < maxE * 1e-4) continue;
    let e0 = 0; for (let i = 0; i < W; i++) e0 += y[s0 + i] * y[s0 + i];
    let best = 0, bestL = 0;
    for (let L = lo; L <= hi; L++) {
      let c = 0, e1 = 0;
      for (let i = 0; i < W; i++) { const a = y[s0 + i + L]; c += y[s0 + i] * a; e1 += a * a; }
      const r = c / Math.sqrt(e0 * e1 + 1e-12);
      if (r > best) { best = r; bestL = L; }
    }
    // prefer the shortest lag that is nearly as good (avoids octave errors)
    if (best > 0.55) {
      for (let k = 2; k <= 4; k++) {
        const L = Math.round(bestL / k); if (L < lo) break;
        let c = 0, e1 = 0; for (let i = 0; i < W; i++) { const a = y[s0 + i + L]; c += y[s0 + i] * a; e1 += a * a; }
        if (c / Math.sqrt(e0 * e1 + 1e-12) > best * 0.92) bestL = L;
      }
      f0[f] = fs / bestL;
    }
  }
  // median smoothing & remove isolated voiced frames
  const sm = new Float32Array(frames);
  for (let f = 0; f < frames; f++) {
    const w: number[] = []; for (let k = -2; k <= 2; k++) { const v = f0[f + k]; if (v) w.push(v); }
    sm[f] = w.length >= 3 && f0[f] ? w.sort((a, b) => a - b)[w.length >> 1] : 0;
  }
  return { f0: sm, hop };
}

/** TD-PSOLA pitch shift: changes pitch, keeps length and voice character (formants). */
function psola(ch: Float32Array[], sr: number, semitones: number, expand = 1): Float32Array[] {
  if (!semitones && Math.abs(expand - 1) < 0.01) return ch;
  const ratio = Math.pow(2, semitones / 12);
  const n = ch[0].length;
  const mix = new Float32Array(n);
  for (const c of ch) for (let i = 0; i < n; i++) mix[i] += c[i] / ch.length;
  const { f0, hop } = trackPitch(mix, sr);
  // median pitch, for widening/narrowing the intonation around it
  const voiced = Array.from(f0).filter((v) => v > 0).sort((a, b) => a - b);
  const med = voiced[voiced.length >> 1] || 120;
  const periodAt = (i: number) => { const v = f0[Math.min(f0.length - 1, Math.floor(i / hop))]; return v ? sr / v : 0; };
  // analysis marks: one per pitch period in voiced parts (snapped to peaks), every 5 ms elsewhere
  const marks: number[] = [], per: number[] = [];
  let i = 0;
  const uv = Math.round(sr * 0.005);
  while (i < n) {
    const P = periodAt(i);
    if (P) {
      let best = i, bv = -Infinity; const r = Math.round(P * 0.3);
      const prev = marks.length ? marks[marks.length - 1] : -1;
      for (let k = Math.max(prev + Math.round(P * 0.6), i - r); k <= Math.min(n - 1, i + r); k++) if (mix[k] > bv) { bv = mix[k]; best = k; }
      marks.push(best); per.push(P); i = best + Math.round(P);
    } else { marks.push(i); per.push(0); i += uv; }
  }
  const outs = ch.map(() => new Float32Array(n));
  const norm = new Float32Array(n);
  let t = marks[0] ?? 0, j = 0;
  while (t < n && marks.length) {
    while (j + 1 < marks.length && Math.abs(marks[j + 1] - t) <= Math.abs(marks[j] - t)) j++;
    const m = marks[j], P = per[j];
    const half = P ? Math.round(P) : uv;
    for (let k = -half; k < half; k++) {
      const s = m + k, d = Math.round(t) + k;
      if (s < 0 || s >= n || d < 0 || d >= n) continue;
      const w = 0.5 + 0.5 * Math.cos((Math.PI * k) / half);
      for (let c = 0; c < ch.length; c++) outs[c][d] += ch[c][s] * w;
      norm[d] += w;
    }
    t += P ? P / Math.min(2, Math.max(0.5, ratio * Math.pow(sr / P / med, expand - 1))) : uv;
    if ((j & 1023) === 0) (self as any).postMessage({ progress: t / n });
  }
  for (const o of outs) for (let k = 0; k < n; k++) o[k] = norm[k] > 0.15 ? o[k] / norm[k] : o[k] / 0.15;
  return outs;
}

self.onmessage = (ev: MessageEvent<Job>) => {
  const { channels, sampleRate, rate, maxPause, pitch } = ev.data;
  const a = shortenPauses(channels, sampleRate, maxPause);
  const b = psola(wsola(a, sampleRate, rate), sampleRate, pitch ?? 0, ev.data.expand ?? 1);
  (self as any).postMessage({ done: true, channels: b }, b.map((c) => c.buffer));
};
