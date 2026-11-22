import { useEffect, useRef, useState } from 'react';
import { encodeAudio } from '../audio/separate';
import { download } from '../util';

export type AudioFmt = 'mp3' | 'mp3hq' | 'wav';

/** One shared player for listening to AudioBuffers (only one sound plays at a time). */
export function useBufferPlayer() {
  const ctx = useRef<AudioContext | null>(null);
  const node = useRef<AudioBufferSourceNode | null>(null);
  const started = useRef({ at: 0, offset: 0 });
  const [playing, setPlaying] = useState<string | null>(null);
  const [pos, setPos] = useState(0);
  useEffect(() => () => { try { node.current?.stop(); } catch { /* */ } ctx.current?.close(); }, []);
  useEffect(() => {
    if (!playing) return;
    let raf = 0;
    const tick = () => { if (ctx.current) setPos(started.current.offset + ctx.current.currentTime - started.current.at); raf = requestAnimationFrame(tick); };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [playing]);
  const stop = () => { try { node.current?.stop(); } catch { /* */ } node.current = null; setPlaying(null); };
  const play = async (key: string, buf: AudioBuffer | null, from = 0) => {
    const was = playing;
    stop();
    if (was === key || !buf) return;
    if (!ctx.current) ctx.current = new AudioContext();
    await ctx.current.resume();
    const src = ctx.current.createBufferSource();
    src.buffer = buf;
    src.connect(ctx.current.destination);
    src.onended = () => { if (node.current === src) { node.current = null; setPlaying(null); } };
    const off = Math.max(0, Math.min(from, buf.duration - 0.05));
    src.start(0, off);
    started.current = { at: ctx.current.currentTime, offset: off };
    node.current = src;
    setPos(off);
    setPlaying(key);
  };
  return { playing, pos, play, stop };
}

/** Waveform of an AudioBuffer; click to listen from that point. */
export function BufWave({ buf, height = 64, color = '#4f8f63', pos, onSeek }: { buf: AudioBuffer | null; height?: number; color?: string; pos?: number; onSeek?: (t: number) => void }) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const c = ref.current;
    if (!c) return;
    const w = (c.width = c.clientWidth * devicePixelRatio || 600);
    const h = (c.height = height * devicePixelRatio);
    const g = c.getContext('2d')!;
    g.clearRect(0, 0, w, h);
    if (!buf) return;
    const d = buf.getChannelData(0);
    const step = Math.max(1, Math.floor(d.length / w));
    g.fillStyle = color;
    for (let x = 0; x < w; x++) {
      let mx = 0;
      const s = x * step;
      for (let i = s; i < s + step && i < d.length; i += 4) { const v = Math.abs(d[i]); if (v > mx) mx = v; }
      const bh = Math.max(1, mx * h * 0.95);
      g.fillRect(x, (h - bh) / 2, 1, bh);
    }
  }, [buf, height, color]);
  const pct = buf && pos !== undefined ? Math.min(100, (pos / buf.duration) * 100) : -1;
  return (
    <div className="bufwave" style={{ height }} onClick={(e) => { if (!buf || !onSeek) return; const r = e.currentTarget.getBoundingClientRect(); onSeek(((e.clientX - r.left) / r.width) * buf.duration); }}>
      <canvas ref={ref} style={{ height }} />
      {pct >= 0 && <div className="bufwave-head" style={{ left: `${pct}%` }} />}
    </div>
  );
}

export function FmtSelect({ value, onChange }: { value: AudioFmt; onChange: (f: AudioFmt) => void }) {
  return (
    <select value={value} onChange={(e) => onChange(e.target.value as AudioFmt)} style={{ width: 'auto' }} aria-label="File type">
      <option value="mp3">MP3 (192 kbps)</option>
      <option value="mp3hq">MP3 high quality (320 kbps)</option>
      <option value="wav">WAV (uncompressed)</option>
    </select>
  );
}

export async function saveBuffer(buf: AudioBuffer, name: string, fmt: AudioFmt, onProgress?: (p: number) => void) {
  const { blob, ext } = await encodeAudio(buf, fmt, onProgress);
  download(blob, `${name}.${ext}`);
}

export const secs = (t: number) => (t >= 60 ? `${Math.floor(t / 60)}:${String(Math.floor(t % 60)).padStart(2, '0')} min` : `${t.toFixed(1)} s`);

/** Decode any audio or video file's sound. */
export async function decodeFile(blob: Blob): Promise<AudioBuffer> {
  const ctx = new OfflineAudioContext(1, 1, 48000);
  return ctx.decodeAudioData(await blob.arrayBuffer());
}
