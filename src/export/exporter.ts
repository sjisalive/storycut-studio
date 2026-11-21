// In-browser export: WebCodecs (H.264 + AAC) → MP4 via mp4-muxer.
// Fallback for browsers without WebCodecs: real-time MediaRecorder capture.
import { ArrayBufferTarget, Muxer } from 'mp4-muxer';
import { GIFEncoder, applyPalette, quantize } from 'gifenc';
import type { AspectKey, Project } from '../types';
import { ASPECTS } from '../presets';
import { ensureFonts } from '../fonts';
import { projectText, timeline } from '../render/engine';
import { buildPlan, preloadAudio, renderMix, schedule } from '../audio/mix';
import { ExactRuntime, LiveRuntime } from './runtime';
import { renderFrame } from '../render/engine';
import { sleep } from '../util';
import { clearTextCache } from '../render/text';

export interface ExportPreset { id: 'high' | 'balanced' | 'small'; label: string; hint: string; short: number; vbps: number; abps: number; fps: number }
export const EXPORT_PRESETS: ExportPreset[] = [
  { id: 'high', label: '1080p High', hint: 'Best quality, for YouTube & big screens', short: 1080, vbps: 8_000_000, abps: 192_000, fps: 30 },
  { id: 'balanced', label: '720p Balanced', hint: 'Good quality, smaller file', short: 720, vbps: 3_500_000, abps: 128_000, fps: 30 },
  { id: 'small', label: 'Small file', hint: 'For WhatsApp and email', short: 540, vbps: 1_100_000, abps: 96_000, fps: 25 },
];

export function dims(aspect: AspectKey, short: number) {
  const a = ASPECTS.find((x) => x.key === aspect)!;
  const ratio = a.w / a.h;
  let w: number, h: number;
  if (ratio >= 1) { h = short; w = Math.round(short * ratio); } else { w = short; h = Math.round(short / ratio); }
  return { w: w - (w % 2), h: h - (h % 2) };
}

export const estimateBytes = (pr: ExportPreset, seconds: number) => ((pr.vbps * 0.85 + pr.abps) * seconds) / 8;

/** Settings that aim for a given file size (compress). */
export function presetForSize(mb: number, seconds: number): ExportPreset {
  const abps = 96_000;
  const vbps = Math.max(150_000, ((mb * 8_000_000) / Math.max(1, seconds)) * 0.92 - abps);
  const short = vbps < 900_000 ? 480 : vbps < 1_800_000 ? 540 : vbps < 3_500_000 ? 720 : 1080;
  return { id: 'small', label: `Target ${mb} MB`, hint: '', short, vbps: Math.round(vbps), abps, fps: vbps < 600_000 ? 24 : 30 };
}

/** Just the soundtrack, as a WAV file. */
export async function exportAudioWav(p: Project): Promise<Blob> {
  const { encodeWav } = await import('../audio/synth');
  return encodeWav(await renderMix(p, 48000));
}

export interface ExportResult { blob: Blob; ext: string; note?: string }
export type Progress = (pct: number, label: string) => void;

function families(p: Project) { return [p.style.fontHead, p.style.fontBody, 'Noto Sans Devanagari', 'Noto Sans']; }

export const supportsWebCodecs = () => typeof (window as any).VideoEncoder === 'function' && typeof (window as any).VideoFrame === 'function';

async function pickVideoCodec(w: number, h: number, bitrate: number, fps: number) {
  const VE = (window as any).VideoEncoder;
  for (const codec of ['avc1.640033', 'avc1.640028', 'avc1.4d0028', 'avc1.42e028', 'avc1.42e01f']) {
    for (const hw of ['prefer-hardware', 'no-preference', 'prefer-software']) {
      const cfg = { codec, width: w, height: h, bitrate, framerate: fps, hardwareAcceleration: hw, avc: { format: 'avc' }, latencyMode: 'quality' };
      try { const r = await VE.isConfigSupported(cfg); if (r.supported) return r.config; } catch { /* try next */ }
    }
  }
  return null;
}

async function pickAudioCodec(bitrate: number) {
  const AE = (window as any).AudioEncoder;
  if (typeof AE !== 'function') return null;
  for (const [codec, mux] of [['mp4a.40.2', 'aac'], ['opus', 'opus']] as const) {
    const cfg = { codec, sampleRate: 48000, numberOfChannels: 2, bitrate };
    try { const r = await AE.isConfigSupported(cfg); if (r.supported) return { cfg: r.config, mux }; } catch { /* next */ }
  }
  return null;
}

export async function exportVideo(p: Project, preset: ExportPreset, aspect: AspectKey, onProgress: Progress, signal?: AbortSignal): Promise<ExportResult> {
  const { w, h } = dims(aspect, preset.short);
  onProgress(0, 'Loading fonts…');
  await ensureFonts(families(p), projectText(p));
  clearTextCache();
  if (!supportsWebCodecs()) return recordRealtime(p, preset, w, h, onProgress, signal);
  const vcfg = await pickVideoCodec(w, h, preset.vbps, preset.fps);
  if (!vcfg) return recordRealtime(p, preset, w, h, onProgress, signal);
  onProgress(0.01, 'Mixing sound…');
  const { total } = timeline(p);
  const mix = await renderMix(p, 48000);
  const acodec = await pickAudioCodec(preset.abps);
  let note: string | undefined;
  if (!acodec) note = 'This browser cannot encode audio, so the file has no sound. Try Chrome or Edge on Windows/Mac.';
  else if (acodec.mux === 'opus') note = 'Sound saved as Opus (this browser has no AAC encoder). Plays fine in browsers, VLC and WhatsApp Web.';

  const muxer = new Muxer({
    target: new ArrayBufferTarget(),
    video: { codec: 'avc', width: w, height: h, frameRate: preset.fps },
    audio: acodec ? { codec: acodec.mux, sampleRate: 48000, numberOfChannels: 2 } : undefined,
    fastStart: 'in-memory',
    firstTimestampBehavior: 'offset',
  });
  let encErr: any = null;
  const VE = (window as any).VideoEncoder;
  const venc = new VE({ output: (chunk: any, meta: any) => muxer.addVideoChunk(chunk, meta), error: (e: any) => { encErr = e; } });
  venc.configure(vcfg);

  const canvas = document.createElement('canvas');
  canvas.width = w; canvas.height = h;
  const ctx = canvas.getContext('2d', { alpha: false })!;
  const rt = new ExactRuntime();
  const frames = Math.max(1, Math.round(total * preset.fps));
  const VF = (window as any).VideoFrame;
  const started = performance.now();
  try {
    for (let i = 0; i < frames; i++) {
      if (signal?.aborted) { try { venc.close(); } catch { /* closed */ } throw new DOMException('Cancelled', 'AbortError'); }
      if (encErr) throw encErr;
      const t = i / preset.fps;
      await rt.draw(ctx, p, t, w, h);
      const frame = new VF(canvas, { timestamp: Math.round((i * 1e6) / preset.fps), duration: Math.round(1e6 / preset.fps) });
      venc.encode(frame, { keyFrame: i % (preset.fps * 2) === 0 });
      frame.close();
      while (venc.encodeQueueSize > 8) await sleep(2);
      if (i % 5 === 0) {
        const el = (performance.now() - started) / 1000;
        const left = (el / (i + 1)) * (frames - i - 1);
        onProgress(0.03 + 0.9 * (i / frames), `Making frames… ${i + 1}/${frames} · about ${Math.ceil(left)} s left`);
        await sleep(0);
      }
    }
    await venc.flush();
  } finally {
    try { venc.close(); } catch { /* closed */ }
    await rt.dispose();
  }

  if (acodec) {
    onProgress(0.95, 'Adding sound…');
    const AE = (window as any).AudioEncoder;
    const AD = (window as any).AudioData;
    const aenc = new AE({ output: (chunk: any, meta: any) => muxer.addAudioChunk(chunk, meta), error: (e: any) => { encErr = e; } });
    aenc.configure(acodec.cfg);
    const L = mix.getChannelData(0), R = mix.getChannelData(mix.numberOfChannels > 1 ? 1 : 0);
    const block = 1024;
    for (let s = 0; s < mix.length; s += block) {
      const n = Math.min(block, mix.length - s);
      const planar = new Float32Array(n * 2);
      planar.set(L.subarray(s, s + n), 0);
      planar.set(R.subarray(s, s + n), n);
      const ad = new AD({ format: 'f32-planar', sampleRate: 48000, numberOfFrames: n, numberOfChannels: 2, timestamp: Math.round((s / 48000) * 1e6), data: planar });
      aenc.encode(ad);
      ad.close();
      if (aenc.encodeQueueSize > 50) await sleep(1);
    }
    await aenc.flush();
    aenc.close();
  }
  if (encErr) throw encErr;
  muxer.finalize();
  onProgress(1, 'Done');
  return { blob: new Blob([muxer.target.buffer], { type: 'video/mp4' }), ext: 'mp4', note };
}

/** Fallback: play the project in real time into MediaRecorder. */
async function recordRealtime(p: Project, preset: ExportPreset, w: number, h: number, onProgress: Progress, signal?: AbortSignal): Promise<ExportResult> {
  if (typeof MediaRecorder === 'undefined') throw new Error('This browser cannot make videos. Please use a recent Chrome, Edge or Safari.');
  const types = ['video/mp4;codecs=avc1.42E01E,mp4a.40.2', 'video/mp4', 'video/webm;codecs=vp9,opus', 'video/webm;codecs=vp8,opus', 'video/webm'];
  const mime = types.find((t) => MediaRecorder.isTypeSupported(t)) ?? '';
  const canvas = document.createElement('canvas');
  canvas.width = w; canvas.height = h;
  const ctx = canvas.getContext('2d')!;
  await preloadAudio(p);
  const actx = new AudioContext({ sampleRate: 48000 });
  const dest = actx.createMediaStreamDestination();
  const stream = new MediaStream([...canvas.captureStream(preset.fps).getVideoTracks(), ...dest.stream.getAudioTracks()]);
  const rec = new MediaRecorder(stream, { mimeType: mime || undefined, videoBitsPerSecond: preset.vbps, audioBitsPerSecond: preset.abps });
  const parts: Blob[] = [];
  rec.ondataavailable = (e) => e.data.size && parts.push(e.data);
  const { total } = timeline(p);
  const rt = new LiveRuntime();
  rt.playing = true;
  // warm-up frame
  renderFrame(ctx, p, 0, w, h, rt);
  await sleep(300);
  const plan = buildPlan(p);
  const t0 = actx.currentTime + 0.15;
  schedule(actx, dest, p, plan, 0, t0);
  rec.start(250);
  await new Promise<void>((resolve, reject) => {
    const tick = () => {
      if (signal?.aborted) { rec.stop(); reject(new DOMException('Cancelled', 'AbortError')); return; }
      const t = Math.max(0, actx.currentTime - t0);
      renderFrame(ctx, p, Math.min(t, total), w, h, rt);
      rt.endFrame();
      onProgress(Math.min(0.99, t / total), `Recording in real time… ${Math.ceil(total - t)} s left (keep this tab visible)`);
      if (t >= total + 0.1) { resolve(); return; }
      requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  });
  rt.stopAll();
  const done = new Promise<void>((r) => (rec.onstop = () => r()));
  rec.stop();
  await done;
  actx.close();
  const type = rec.mimeType || mime || 'video/webm';
  onProgress(1, 'Done');
  return {
    blob: new Blob(parts, { type }), ext: type.includes('mp4') ? 'mp4' : 'webm',
    note: 'Made with the slower real-time recorder because this browser has no WebCodecs video encoder.',
  };
}

export async function exportThumbnail(p: Project, aspect: AspectKey, short = 1080): Promise<Blob> {
  const { w, h } = dims(aspect, short);
  await ensureFonts(families(p), projectText(p));
  clearTextCache();
  const canvas = document.createElement('canvas');
  canvas.width = w; canvas.height = h;
  const rt = new ExactRuntime();
  const first = p.scenes[0];
  const t = first ? Math.min(first.duration * 0.8, 2.6) : 0;
  await rt.draw(canvas.getContext('2d')!, p, t, w, h);
  await rt.dispose();
  return new Promise((res, rej) => canvas.toBlob((b) => (b ? res(b) : rej(new Error('PNG failed'))), 'image/png'));
}

export async function exportGif(p: Project, aspect: AspectKey, onProgress: Progress, seconds = 6, width = 480, fps = 10): Promise<Blob> {
  const a = ASPECTS.find((x) => x.key === aspect)!;
  const w = width, h = Math.round((width * a.h) / a.w);
  await ensureFonts(families(p), projectText(p));
  clearTextCache();
  const canvas = document.createElement('canvas');
  canvas.width = w; canvas.height = h;
  const ctx = canvas.getContext('2d', { willReadFrequently: true })!;
  const rt = new ExactRuntime();
  const { total } = timeline(p);
  const dur = Math.min(seconds, total);
  const n = Math.max(1, Math.round(dur * fps));
  const gif = GIFEncoder();
  for (let i = 0; i < n; i++) {
    await rt.draw(ctx, p, i / fps, w, h);
    const { data } = ctx.getImageData(0, 0, w, h);
    const palette = quantize(data, 256);
    gif.writeFrame(applyPalette(data, palette), w, h, { palette, delay: Math.round(1000 / fps) });
    onProgress(i / n, `GIF frame ${i + 1}/${n}`);
    if (i % 4 === 0) await sleep(0);
  }
  await rt.dispose();
  gif.finish();
  return new Blob([gif.bytes() as BlobPart], { type: 'image/gif' });
}
