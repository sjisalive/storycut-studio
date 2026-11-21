// Integrated loudness (ITU-R BS.1770 / EBU R128 gating) and normalisation
// to a target such as −14 LUFS, with a simple look-ahead peak limiter.

function biquad(x: Float32Array, b: number[], a: number[]) {
  const y = new Float32Array(x.length);
  let x1 = 0, x2 = 0, y1 = 0, y2 = 0;
  for (let i = 0; i < x.length; i++) {
    const v = b[0] * x[i] + b[1] * x1 + b[2] * x2 - a[1] * y1 - a[2] * y2;
    x2 = x1; x1 = x[i]; y2 = y1; y1 = v; y[i] = v;
  }
  return y;
}

/** K-weighting coefficients for any sample rate (bilinear transform of the BS.1770 filters). */
function kCoeffs(fs: number) {
  // Stage 1: high shelf
  let f0 = 1681.974450955533, G = 3.999843853973347, Q = 0.7071752369554196;
  let K = Math.tan((Math.PI * f0) / fs);
  const Vh = Math.pow(10, G / 20), Vb = Math.pow(Vh, 0.4996667741545416);
  let a0 = 1 + K / Q + K * K;
  const s1b = [(Vh + (Vb * K) / Q + K * K) / a0, (2 * (K * K - Vh)) / a0, (Vh - (Vb * K) / Q + K * K) / a0];
  const s1a = [1, (2 * (K * K - 1)) / a0, (1 - K / Q + K * K) / a0];
  // Stage 2: high pass
  f0 = 38.13547087602444; Q = 0.5003270373238773;
  K = Math.tan((Math.PI * f0) / fs);
  a0 = 1 + K / Q + K * K;
  const s2b = [1, -2, 1];
  const s2a = [1, (2 * (K * K - 1)) / a0, (1 - K / Q + K * K) / a0];
  return { s1b, s1a, s2b, s2a };
}

export function integratedLoudness(buf: AudioBuffer) {
  const fs = buf.sampleRate;
  const { s1b, s1a, s2b, s2a } = kCoeffs(fs);
  const chans: Float32Array[] = [];
  for (let c = 0; c < Math.min(2, buf.numberOfChannels); c++) chans.push(biquad(biquad(buf.getChannelData(c), s1b, s1a), s2b, s2a));
  const block = Math.round(0.4 * fs), hop = Math.round(0.1 * fs);
  const z: number[] = [];
  for (let s = 0; s + block <= buf.length; s += hop) {
    let sum = 0;
    for (const ch of chans) { let acc = 0; for (let i = s; i < s + block; i++) acc += ch[i] * ch[i]; sum += acc / block; }
    z.push(sum);
  }
  const L = (v: number) => -0.691 + 10 * Math.log10(v);
  const abs = z.filter((v) => L(v) > -70);
  if (!abs.length) return -Infinity;
  const relThresh = L(abs.reduce((a, b) => a + b, 0) / abs.length) - 10;
  const rel = abs.filter((v) => L(v) > relThresh);
  return L(rel.reduce((a, b) => a + b, 0) / rel.length);
}

export function normaliseLoudness(buf: AudioBuffer, target = -14, ceiling = 0.89) {
  // Limiting lowers loudness a little, so repeat until within 0.5 LU.
  let first = applyOnce(buf, target, ceiling);
  for (let i = 0; i < 2; i++) {
    const now = integratedLoudness(buf);
    if (!Number.isFinite(now) || Math.abs(target - now) < 0.5) break;
    applyOnce(buf, target, ceiling);
  }
  return first;
}

function applyOnce(buf: AudioBuffer, target: number, ceiling: number) {
  const lufs = integratedLoudness(buf);
  if (!Number.isFinite(lufs)) return { lufs, gainDb: 0 };
  const gainDb = Math.max(-20, Math.min(18, target - lufs));
  const g = Math.pow(10, gainDb / 20);
  const n = buf.length, fs = buf.sampleRate;
  const data: Float32Array[] = [];
  for (let c = 0; c < buf.numberOfChannels; c++) data.push(buf.getChannelData(c));
  // Peak envelope with 5 ms look-ahead, 120 ms release
  const look = Math.round(0.005 * fs);
  const rel = Math.exp(-1 / (0.12 * fs));
  const need = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    let pk = 0;
    for (const d of data) pk = Math.max(pk, Math.abs(d[i] * g));
    need[i] = pk > ceiling ? ceiling / pk : 1;
  }
  // spread reductions backwards over the look-ahead window
  let minAhead = 1;
  const red = new Float32Array(n);
  for (let i = n - 1; i >= 0; i--) {
    minAhead = Math.min(need[i], minAhead + (1 - minAhead) * (1 / look));
    red[i] = minAhead;
  }
  let env = 1;
  for (let i = 0; i < n; i++) {
    env = red[i] < env ? red[i] : red[i] + (env - red[i]) * rel;
    const k = g * env;
    for (const d of data) d[i] *= k;
  }
  return { lufs, gainDb };
}
