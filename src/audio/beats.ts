// Simple, robust beat tracker: onset envelope → tempo by autocorrelation →
// best phase → a steady beat grid (good enough to snap cuts to).

export function detectBeats(buf: AudioBuffer): { bpm: number; beats: number[] } {
  const fs = buf.sampleRate;
  const hop = 512;
  const n = Math.floor(buf.length / hop);
  if (n < 50) return { bpm: 0, beats: [] };
  const a = buf.getChannelData(0);
  const b = buf.numberOfChannels > 1 ? buf.getChannelData(1) : a;
  // low-passed energy (emphasise kick/bass) + full-band flux
  const env = new Float32Array(n);
  let lp = 0;
  const alpha = Math.exp((-2 * Math.PI * 180) / fs);
  for (let f = 0; f < n; f++) {
    let e = 0, eLow = 0;
    for (let i = f * hop; i < (f + 1) * hop; i++) {
      const s = (a[i] + b[i]) * 0.5;
      lp = alpha * lp + (1 - alpha) * s;
      e += s * s; eLow += lp * lp;
    }
    env[f] = Math.log1p(1000 * (e + 4 * eLow) / hop);
  }
  const onset = new Float32Array(n);
  for (let f = 1; f < n; f++) onset[f] = Math.max(0, env[f] - env[f - 1]);
  // remove local mean
  const w = 16;
  const o2 = new Float32Array(n);
  for (let f = 0; f < n; f++) {
    let s = 0, c = 0;
    for (let k = Math.max(0, f - w); k < Math.min(n, f + w); k++) { s += onset[k]; c++; }
    o2[f] = Math.max(0, onset[f] - s / c);
  }
  const fps = fs / hop;
  const minLag = Math.floor((60 / 180) * fps), maxLag = Math.ceil((60 / 70) * fps);
  let bestLag = 0, bestScore = -1;
  for (let lag = minLag; lag <= maxLag; lag++) {
    let s = 0;
    for (let f = lag; f < n; f++) s += o2[f] * o2[f - lag];
    const bpm = (60 * fps) / lag;
    const weight = Math.exp(-0.5 * Math.pow(Math.log2(bpm / 118) / 0.9, 2));
    s *= weight;
    if (s > bestScore) { bestScore = s; bestLag = lag; }
  }
  if (!bestLag) return { bpm: 0, beats: [] };
  let bestPhase = 0, bestP = -1;
  for (let ph = 0; ph < bestLag; ph++) {
    let s = 0;
    for (let f = ph; f < n; f += bestLag) s += o2[f];
    if (s > bestP) { bestP = s; bestPhase = ph; }
  }
  const period = bestLag / fps;
  const beats: number[] = [];
  for (let t = bestPhase / fps; t < buf.duration; t += period) beats.push(Math.round(t * 1000) / 1000);
  return { bpm: Math.round(60 / period), beats };
}

/** Beats for a looped track repeated to cover `total` seconds. */
export function loopBeats(beats: number[], trackDur: number, total: number) {
  if (!beats.length || trackDur <= 0) return [];
  const out: number[] = [];
  for (let off = 0; off < total; off += trackDur) for (const b of beats) { const t = b + off; if (t < total) out.push(t); }
  return out;
}
