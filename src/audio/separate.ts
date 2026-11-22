// Runs the voice separator in a worker and returns ready-to-use audio buffers,
// plus MP3 / WAV encoding for "audio only" saves.
import { encodeWav } from './synth';

export interface Separated { voice: AudioBuffer; background: AudioBuffer; stereo: boolean }

export function separateVoice(buf: AudioBuffer, strength: number, denoise: boolean, onProgress: (p: number) => void): Promise<Separated> {
  return new Promise((resolve, reject) => {
    const worker = new Worker(new URL('./separate.worker.ts', import.meta.url), { type: 'module' });
    const left = buf.getChannelData(0).slice();
    const stereo = buf.numberOfChannels > 1;
    const right = stereo ? buf.getChannelData(1).slice() : left;
    worker.onmessage = (ev) => {
      const d = ev.data;
      if (d.progress !== undefined) { onProgress(d.progress); return; }
      if (d.done) {
        const sr = buf.sampleRate;
        const voice = new AudioBuffer({ length: d.voice.length, numberOfChannels: 2, sampleRate: sr });
        voice.copyToChannel(d.voice, 0); voice.copyToChannel(d.voice, 1);
        const background = new AudioBuffer({ length: d.bgL.length, numberOfChannels: 2, sampleRate: sr });
        background.copyToChannel(d.bgL, 0); background.copyToChannel(d.bgR, 1);
        worker.terminate();
        onProgress(1);
        resolve({ voice, background, stereo });
      }
    };
    worker.onerror = (e) => { worker.terminate(); reject(new Error(e.message || 'Separation failed')); };
    const transfer = stereo ? [left.buffer, right.buffer] : [left.buffer];
    worker.postMessage({ left, right, sampleRate: buf.sampleRate, strength, denoise }, transfer);
  });
}

/** MP3 file from an AudioBuffer (lamejs, in the browser). */
export async function encodeMp3(buf: AudioBuffer, kbps = 192, onProgress?: (p: number) => void): Promise<Blob> {
  const { Mp3Encoder } = await import('@breezystack/lamejs');
  const channels = Math.min(2, buf.numberOfChannels);
  const sr = [44100, 48000, 32000].includes(buf.sampleRate) ? buf.sampleRate : 44100;
  let src = buf;
  if (sr !== buf.sampleRate) {
    const off = new OfflineAudioContext(channels, Math.ceil(buf.duration * sr), sr);
    const s = off.createBufferSource(); s.buffer = buf; s.connect(off.destination); s.start();
    src = await off.startRendering();
  }
  const enc = new Mp3Encoder(channels, sr, kbps);
  const toI16 = (f: Float32Array) => { const o = new Int16Array(f.length); for (let i = 0; i < f.length; i++) { const v = Math.max(-1, Math.min(1, f[i])); o[i] = v < 0 ? v * 0x8000 : v * 0x7fff; } return o; };
  const L = toI16(src.getChannelData(0));
  const R = channels > 1 ? toI16(src.getChannelData(1)) : undefined;
  const parts: BlobPart[] = [];
  const block = 1152 * 20;
  for (let i = 0; i < L.length; i += block) {
    const out = R ? enc.encodeBuffer(L.subarray(i, i + block), R.subarray(i, i + block)) : enc.encodeBuffer(L.subarray(i, i + block));
    if (out.length) parts.push(new Uint8Array(out));
    if ((i / block) % 20 === 0) { onProgress?.(i / L.length); await new Promise((r) => setTimeout(r, 0)); }
  }
  const end = enc.flush();
  if (end.length) parts.push(new Uint8Array(end));
  onProgress?.(1);
  return new Blob(parts, { type: 'audio/mpeg' });
}

export async function encodeAudio(buf: AudioBuffer, format: 'mp3' | 'mp3hq' | 'wav', onProgress?: (p: number) => void) {
  if (format === 'wav') return { blob: encodeWav(buf), ext: 'wav' };
  return { blob: await encodeMp3(buf, format === 'mp3hq' ? 320 : 192, onProgress), ext: 'mp3' };
}
