import { memo, useEffect, useRef, useState } from 'react';
import { getPeaks, PEAK_RATE } from '../media';

/**
 * Sound drawn as a waveform inside a timeline block, with optional beat lines
 * (every 4th beat — the start of a bar — drawn stronger).
 */
export const Waveform = memo(function Waveform({ mediaId, offset, dur, rate = 1, loop = false, width, height, color, volume = 1, beats, fileDur }: {
  mediaId: string; offset: number; dur: number; rate?: number; loop?: boolean; width: number; height: number; color: string;
  volume?: number; beats?: number[]; fileDur?: number;
}) {
  const ref = useRef<HTMLCanvasElement>(null);
  const [data, setData] = useState<Float32Array | null>(null);
  useEffect(() => { let live = true; getPeaks(mediaId).then((d) => { if (live) setData(d); }); return () => { live = false; }; }, [mediaId]);
  const cw = Math.max(1, Math.min(16000, Math.round(width)));
  useEffect(() => {
    const c = ref.current;
    if (!c) return;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const W = Math.max(1, Math.round(cw * dpr)), H = Math.max(1, Math.round(height * dpr));
    if (c.width !== W) c.width = W;
    if (c.height !== H) c.height = H;
    const g = c.getContext('2d')!;
    g.clearRect(0, 0, W, H);
    if (data && data.length) {
      const n = data.length;
      const total = fileDur ?? n / PEAK_RATE;
      const secPerPx = dur / W;
      const mid = H / 2;
      const gain = Math.min(1.6, 0.35 + 0.65 * volume);
      g.fillStyle = color;
      for (let x = 0; x < W; x++) {
        let t0 = offset + x * secPerPx * rate;
        let t1 = offset + (x + 1) * secPerPx * rate;
        if (loop && total > 0) { t0 %= total; t1 = t0 + secPerPx * rate; }
        const i0 = Math.floor(t0 * PEAK_RATE), i1 = Math.max(i0 + 1, Math.ceil(t1 * PEAK_RATE));
        if (i0 >= n) continue;
        let m = 0;
        for (let i = i0; i < Math.min(n, i1); i++) if (data[i] > m) m = data[i];
        const hh = Math.max(dpr * 0.6, Math.min(1, m * gain) * (H * 0.46));
        g.fillRect(x, mid - hh, 1, hh * 2);
      }
    }
    if (beats?.length) {
      const pxPerSec = W / dur;
      beats.forEach((b, k) => {
        const x = Math.round(b * pxPerSec);
        if (x < 0 || x > W) return;
        const strong = k % 4 === 0;
        g.fillStyle = strong ? 'rgba(22,101,52,0.85)' : 'rgba(22,101,52,0.35)';
        g.fillRect(x, strong ? 0 : H * 0.25, strong ? 2 * dpr : dpr, strong ? H : H * 0.5);
      });
    }
  }, [data, offset, dur, rate, loop, cw, height, color, volume, beats, fileDur]);
  return <canvas ref={ref} className="wave" style={{ width, height }} />;
});
