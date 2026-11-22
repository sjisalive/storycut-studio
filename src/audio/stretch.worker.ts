// Speed change without changing pitch (WSOLA time-stretch), and pause shortening.
// Runs in a background thread so long voice-overs don't freeze the page.

interface Job { channels: Float32Array[]; sampleRate: number; rate: number; maxPause: number }

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

self.onmessage = (ev: MessageEvent<Job>) => {
  const { channels, sampleRate, rate, maxPause } = ev.data;
  const a = shortenPauses(channels, sampleRate, maxPause);
  const b = wsola(a, sampleRate, rate);
  (self as any).postMessage({ done: true, channels: b }, b.map((c) => c.buffer));
};
