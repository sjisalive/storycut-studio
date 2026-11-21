// Offline "music bed" generator so a video can have music without any upload,
// and so the demo templates are fully self-contained.
import type { MusicMood } from '../types';
import { MOOD_TEMPO } from '../presets';
import { seeded } from '../util';

const midi = (n: number) => 440 * Math.pow(2, (n - 69) / 12);

export async function synthMusic(mood: MusicMood, seconds: number, seed = 'music'): Promise<Blob> {
  const sr = 44100;
  const bpm = MOOD_TEMPO[mood];
  const beat = 60 / bpm;
  const bars = Math.ceil(seconds / (beat * 4)) + 1;
  const len = Math.ceil(bars * 4 * beat * sr);
  const ctx = new OfflineAudioContext(2, len, sr);
  const master = ctx.createGain();
  master.gain.value = 0.5;
  const comp = ctx.createDynamicsCompressor();
  master.connect(comp).connect(ctx.destination);
  const rnd = seeded(seed + mood);
  const key = [57, 60, 62, 55, 53][Math.floor(rnd() * 5)]; // A3 C4 D4 G3 F3
  const minor = mood === 'calm' || mood === 'elegant' || mood === 'warm';
  const prog = minor ? [[0, 3, 7], [-4, 0, 3], [-2, 2, 5], [-5, -1, 2]] : [[0, 4, 7], [7, 11, 14], [9, 12, 16], [5, 9, 12]];
  const drums = mood !== 'calm' && mood !== 'elegant';
  const bright = mood === 'energetic' || mood === 'festive';

  const noise = ctx.createBuffer(1, sr, sr);
  const nd = noise.getChannelData(0);
  for (let i = 0; i < nd.length; i++) nd[i] = Math.random() * 2 - 1;

  for (let bar = 0; bar < bars; bar++) {
    const chord = prog[bar % 4];
    const t0 = bar * 4 * beat;
    // pad
    for (const iv of chord) {
      for (const det of [-6, 6]) {
        const o = ctx.createOscillator();
        o.type = bright ? 'sawtooth' : 'triangle';
        o.frequency.value = midi(key + iv);
        o.detune.value = det;
        const f = ctx.createBiquadFilter();
        f.type = 'lowpass'; f.frequency.value = bright ? 2200 : 1200;
        const g = ctx.createGain();
        g.gain.setValueAtTime(0, t0);
        g.gain.linearRampToValueAtTime(0.035, t0 + 0.3);
        g.gain.setValueAtTime(0.035, t0 + 4 * beat - 0.15);
        g.gain.linearRampToValueAtTime(0, t0 + 4 * beat + 0.05);
        o.connect(f).connect(g).connect(master);
        o.start(t0); o.stop(t0 + 4 * beat + 0.1);
      }
    }
    // bass
    for (let b = 0; b < 4; b++) {
      const t = t0 + b * beat;
      const o = ctx.createOscillator();
      o.type = 'sine';
      o.frequency.value = midi(key + chord[0] - 24);
      const g = ctx.createGain();
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(0.28, t + 0.02);
      g.gain.exponentialRampToValueAtTime(0.0001, t + beat * 0.9);
      o.connect(g).connect(master);
      o.start(t); o.stop(t + beat);
    }
    // arpeggio
    const steps = bright ? 8 : 4;
    for (let s = 0; s < steps * 2; s++) {
      if (!bright && rnd() < 0.3) continue;
      const t = t0 + (s * 4 * beat) / (steps * 2);
      const o = ctx.createOscillator();
      o.type = 'square';
      o.frequency.value = midi(key + 12 + chord[s % 3]);
      const f = ctx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = 1800;
      const g = ctx.createGain();
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(bright ? 0.05 : 0.035, t + 0.01);
      g.gain.exponentialRampToValueAtTime(0.0001, t + 0.18);
      o.connect(f).connect(g).connect(master);
      o.start(t); o.stop(t + 0.2);
    }
    if (!drums) continue;
    for (let b = 0; b < 4; b++) {
      const t = t0 + b * beat;
      // kick
      const k = ctx.createOscillator();
      const kg = ctx.createGain();
      k.frequency.setValueAtTime(140, t);
      k.frequency.exponentialRampToValueAtTime(42, t + 0.12);
      kg.gain.setValueAtTime(0.9, t);
      kg.gain.exponentialRampToValueAtTime(0.0001, t + 0.3);
      k.connect(kg).connect(master);
      k.start(t); k.stop(t + 0.32);
      // hat on off-beat
      const h = ctx.createBufferSource(); h.buffer = noise;
      const hf = ctx.createBiquadFilter(); hf.type = 'highpass'; hf.frequency.value = 7000;
      const hg = ctx.createGain();
      const th = t + beat / 2;
      hg.gain.setValueAtTime(0.12, th);
      hg.gain.exponentialRampToValueAtTime(0.0001, th + 0.05);
      h.connect(hf).connect(hg).connect(master);
      h.start(th, rnd() * 0.5, 0.06);
      // clap on 2 & 4
      if (b % 2 === 1) {
        const c = ctx.createBufferSource(); c.buffer = noise;
        const cf = ctx.createBiquadFilter(); cf.type = 'bandpass'; cf.frequency.value = 1500;
        const cg = ctx.createGain();
        cg.gain.setValueAtTime(0.35, t);
        cg.gain.exponentialRampToValueAtTime(0.0001, t + 0.15);
        c.connect(cf).connect(cg).connect(master);
        c.start(t, rnd() * 0.5, 0.16);
      }
    }
  }
  const out = await ctx.startRendering();
  return encodeWav(out);
}

export function encodeWav(buf: AudioBuffer): Blob {
  const ch = buf.numberOfChannels, sr = buf.sampleRate, n = buf.length;
  const dv = new DataView(new ArrayBuffer(44 + n * ch * 2));
  const w = (o: number, s: string) => { for (let i = 0; i < s.length; i++) dv.setUint8(o + i, s.charCodeAt(i)); };
  w(0, 'RIFF'); dv.setUint32(4, 36 + n * ch * 2, true); w(8, 'WAVE'); w(12, 'fmt ');
  dv.setUint32(16, 16, true); dv.setUint16(20, 1, true); dv.setUint16(22, ch, true);
  dv.setUint32(24, sr, true); dv.setUint32(28, sr * ch * 2, true); dv.setUint16(32, ch * 2, true); dv.setUint16(34, 16, true);
  w(36, 'data'); dv.setUint32(40, n * ch * 2, true);
  const data = Array.from({ length: ch }, (_, c) => buf.getChannelData(c));
  let o = 44;
  for (let i = 0; i < n; i++) for (let c = 0; c < ch; c++) {
    const s = Math.max(-1, Math.min(1, data[c][i]));
    dv.setInt16(o, s < 0 ? s * 0x8000 : s * 0x7fff, true); o += 2;
  }
  return new Blob([dv.buffer], { type: 'audio/wav' });
}
