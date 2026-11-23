import { useEffect, useMemo, useRef, useState } from 'react';
import type { MediaItem } from '../types';
import { getAudioBuffer } from '../media';
import { integratedLoudness } from '../audio/loudness';
import { analyse, DEFAULT_STUDIO, matchVoice, processSound, STUDIO_PRESETS, voiceProfile, type StudioSettings, type VoiceProfile } from '../audio/studio';
import { separateVoice } from '../audio/separate';
import { Note, Progress } from './common';
import { BufWave, decodeFile, FmtSelect, saveBuffer, secs, useBufferPlayer, type AudioFmt } from './audioUi';

export interface StudioInput { buf: AudioBuffer; name: string }

function slice(buf: AudioBuffer, a: number, b: number) {
  const s = Math.max(0, Math.floor(a * buf.sampleRate)), e = Math.min(buf.length, Math.ceil(b * buf.sampleRate));
  if (s === 0 && e === buf.length) return buf;
  const out = new AudioBuffer({ length: Math.max(1, e - s), numberOfChannels: buf.numberOfChannels, sampleRate: buf.sampleRate });
  for (let c = 0; c < buf.numberOfChannels; c++) out.copyToChannel(buf.getChannelData(c).subarray(s, e), c);
  return out;
}

function Slider({ label, value, min, max, step, onChange, show, hint }: { label: string; value: number; min: number; max: number; step: number; onChange: (v: number) => void; show: string; hint?: string }) {
  return (
    <label className="field small studio-slider" title={hint}>
      <span className="row" style={{ justifyContent: 'space-between' }}><span>{label}</span><b>{show}</b></span>
      <input type="range" min={min} max={max} step={step} value={value} onChange={(e) => onChange(+e.target.value)} />
    </label>
  );
}
const db = (v: number) => `${v > 0 ? '+' : ''}${v.toFixed(1)} dB`;

/** 🎚 Sound Studio: change bass, treble, speed, pitch, loudness, echo… of any sound. */
export function StudioTab({ input, media, onTimeline }: {
  input: StudioInput | null;
  media: MediaItem[];
  onTimeline: (buf: AudioBuffer, name: string) => Promise<void>;
}) {
  const [src, setSrc] = useState<StudioInput | null>(input);
  const [s, setS] = useState<StudioSettings>({ ...DEFAULT_STUDIO });
  const [preset, setPreset] = useState('');
  const [trim, setTrim] = useState<[number, number]>([0, 0]);
  const [out, setOut] = useState<AudioBuffer | null>(null);
  const [outKey, setOutKey] = useState('');
  const [busy, setBusy] = useState('');
  const [pct, setPct] = useState(0);
  const [err, setErr] = useState('');
  const [msg, setMsg] = useState('');
  const [fmt, setFmt] = useState<AudioFmt>('mp3');
  const fileRef = useRef<HTMLInputElement>(null);
  const refRef = useRef<HTMLInputElement>(null);
  const [refMusic, setRefMusic] = useState(true);
  const [matched, setMatched] = useState('');
  const matchTo = async (f: File) => {
    if (!src) { setErr('Open the voice you want to change first, then pick the sample.'); return; }
    setErr(''); setBusy('Listening to the sample…'); setPct(0);
    try {
      let rb = await decodeFile(f);
      if (refMusic) rb = (await separateVoice(rb, 0.6, true, (p) => { setBusy('Isolating the sample voice from its music…'); setPct(p); })).voice;
      const ref = voiceProfile(rb), me = voiceProfile(slice(src.buf, trim[0], trim[1] || src.buf.duration));
      saveSampleProfile(ref, f.name);
      const m = matchVoice(me, ref);
      setS({ ...DEFAULT_STUDIO, ...m }); setPreset('');
      const sign = (v: number) => (v > 0 ? `+${v}` : `${v}`);
      setMatched(`Matched to “${f.name}”: sample voice ${Math.round(ref.f0)} Hz vs yours ${Math.round(me.f0)} Hz → pitch ${sign(m.pitch!)} semitones, intonation ×${m.intonation}, pace ×${m.speed}, tone bass ${sign(m.bass!)} / presence ${sign(m.presence!)} / treble ${sign(m.treble!)} dB. Fine-tune with the sliders below.`);
    } catch (e: any) { setErr(`Could not read the sample: ${e?.message ?? e}`); }
    finally { setBusy(''); }
  };
  const pl = useBufferPlayer();

  useEffect(() => { if (input) { setSrc(input); } }, [input]);
  useEffect(() => { setOut(null); setTrim([0, src?.buf.duration ?? 0]); pl.stop(); setMsg(''); }, [src]); // eslint-disable-line react-hooks/exhaustive-deps

  const info = useMemo(() => (src ? { ...analyse(src.buf), lufs: integratedLoudness(src.buf) } : null), [src]);
  const outInfo = useMemo(() => (out ? { lufs: integratedLoudness(out), ...analyse(out) } : null), [out]);
  const set = (patch: Partial<StudioSettings>) => { setS((x) => ({ ...x, ...patch })); setPreset(''); };
  const key = JSON.stringify([s, trim, src?.name, src?.buf.length]);
  const stale = !!out && outKey !== key;

  const loadFile = async (f: File) => {
    setErr(''); setBusy('Reading the sound…');
    try { setSrc({ buf: await decodeFile(f), name: f.name.replace(/\.[^.]+$/, '') }); }
    catch { setErr('This file has no sound the browser can read.'); }
    finally { setBusy(''); }
  };
  const loadMedia = async (id: string) => {
    const m = media.find((x) => x.id === id);
    if (!m) return;
    setBusy('Reading the sound…');
    const b = await getAudioBuffer(id);
    setBusy('');
    if (!b) { setErr('This file has no sound.'); return; }
    setSrc({ buf: b, name: m.name.replace(/\.[^.]+$/, '') });
  };

  const render = async () => {
    if (!src) return null;
    if (out && !stale) return out;
    setErr(''); setBusy('Working…'); setPct(0);
    try {
      const r = await processSound(slice(src.buf, trim[0], trim[1] || src.buf.duration), s, (stage, p) => { setBusy(stage); setPct(p); });
      setOut(r); setOutKey(key);
      return r;
    } catch (e: any) { setErr(`Could not process: ${e?.message ?? e}`); return null; }
    finally { setBusy(''); }
  };

  const applyPreset = (k: string) => { const p = STUDIO_PRESETS.find((x) => x[0] === k); if (!p) return; setS({ ...DEFAULT_STUDIO, ...p[2] }); setPreset(k); };
  const outName = `${src?.name ?? 'sound'}-edited`;
  const playable = sorted(media);

  return (
    <div className="tool-page">
      <div className="tool-main card">
        <h3 className="tool-title">🎚 Sound Studio</h3>
        <div className="row" style={{ flexWrap: 'wrap', gap: 6 }}>
          <button className="btn small" onClick={() => fileRef.current?.click()}>📂 Open audio or video file…</button>
          <input ref={fileRef} type="file" accept="audio/*,video/*,.mp3,.wav,.m4a,.ogg,.aac,.flac" hidden onChange={(e) => { const f = e.target.files?.[0]; if (f) loadFile(f); e.target.value = ''; }} />
          {!!playable.length && (
            <select value="" onChange={(e) => loadMedia(e.target.value)} style={{ width: 'auto' }} aria-label="Use a file from the project">
              <option value="">…or use a file from this video</option>
              {playable.map((m) => <option key={m.id} value={m.id}>{m.kind === 'video' ? '🎬' : '🎵'} {m.name}</option>)}
            </select>
          )}
        </div>
        {!src && (
          <div className="drop-big" onDragOver={(e) => e.preventDefault()} onDrop={(e) => { e.preventDefault(); const f = e.dataTransfer.files[0]; if (f) loadFile(f); }} onClick={() => fileRef.current?.click()}>
            Drop an MP3, WAV or video here — or make a voice-over in <b>🗣 Voice-over</b> and press <b>Edit sound</b>.
          </div>
        )}
        {src && info && (
          <>
            <div className="small muted" style={{ marginTop: 10 }}>
              <b style={{ color: 'var(--text)' }}>{src.name}</b> · {secs(info.duration)} · {info.mono ? 'mono' : 'stereo'} · {info.lufs.toFixed(1)} LUFS · peak {info.peakDb.toFixed(1)} dB
              {info.clipped > 20 && <span className="bad-text"> · {info.clipped} clipped samples</span>}
            </div>
            <div className="row" style={{ justifyContent: 'space-between', marginTop: 8 }}>
              <b className="small">Before</b>
              <button className="btn small" onClick={() => pl.play('in', src.buf, trim[0])}>{pl.playing === 'in' ? '■ Stop' : '▶ Original'}</button>
            </div>
            <BufWave buf={src.buf} color="#9aa59d" pos={pl.playing === 'in' ? pl.pos : undefined} onSeek={(t) => pl.play('in2', src.buf, t)} />
            <div className="row small" style={{ gap: 10, marginTop: 6 }}>
              <label className="row">Keep from <input type="number" min={0} step={0.1} value={+trim[0].toFixed(1)} onChange={(e) => setTrim([Math.max(0, Math.min(+e.target.value, trim[1] - 0.1)), trim[1]])} style={{ width: 70 }} /> s</label>
              <label className="row">to <input type="number" min={0} step={0.1} value={+trim[1].toFixed(1)} onChange={(e) => setTrim([trim[0], Math.min(src.buf.duration, Math.max(+e.target.value, trim[0] + 0.1))])} style={{ width: 70 }} /> s</label>
              {(trim[0] > 0 || trim[1] < src.buf.duration - 0.05) && <button className="btn small" onClick={() => setTrim([0, src.buf.duration])}>Whole file</button>}
            </div>

            <div className="row" style={{ justifyContent: 'space-between', marginTop: 14 }}>
              <b className="small">After {out && !stale && `· ${secs(out.duration)} · ${outInfo?.lufs.toFixed(1)} LUFS · peak ${outInfo?.peakDb.toFixed(1)} dB`}</b>
              <button className="btn small primary" disabled={!!busy} onClick={async () => { if (pl.playing === 'out') { pl.stop(); return; } const r = await render(); if (r) pl.play('out', r); }}>
                {pl.playing === 'out' ? '■ Stop' : stale || !out ? '▶ Apply & listen' : '▶ Listen'}
              </button>
            </div>
            <BufWave buf={out} pos={pl.playing === 'out' ? pl.pos : undefined} onSeek={(t) => out && pl.play('out', out, t)} />
            {stale && <div className="small muted">Settings changed — press Apply & listen to hear them.</div>}
            {busy && <div style={{ marginTop: 6 }}><span className="small muted">{busy}</span><Progress value={pct} /></div>}
            {err && <Note kind="bad">{err}</Note>}
            <div className="row" style={{ marginTop: 10, flexWrap: 'wrap', gap: 6 }}>
              <FmtSelect value={fmt} onChange={setFmt} />
              <button className="btn small" disabled={!!busy} onClick={async () => { const r = await render(); if (r) { setBusy('Saving…'); try { await saveBuffer(r, outName, fmt, setPct); } finally { setBusy(''); } } }}>⬇ Save</button>
              <button className="btn small primary" disabled={!!busy} onClick={async () => { const r = await render(); if (r) { await onTimeline(r, outName); setMsg('Added to the Voice track at the playhead.'); } }}>＋ Add to video</button>
            </div>
            {msg && <Note>{msg}</Note>}
          </>
        )}
      </div>

      <aside className="tool-side card studio-side">
        <b className="small">🎯 Sound like a sample voice</b>
        <p className="small muted" style={{ margin: '4px 0 6px' }}>Pick a video or MP3 with the voice you like. Pitch, liveliness, pace and tone are matched (the words and accent stay the voice's own).</p>
        <div className="row" style={{ gap: 6, flexWrap: 'wrap' }}>
          <button className="btn small primary" disabled={!src || !!busy} onClick={() => refRef.current?.click()}>Choose sample…</button>
          <label className="row small"><input type="checkbox" checked={refMusic} onChange={(e) => setRefMusic(e.target.checked)} /> sample has music</label>
        </div>
        <input ref={refRef} type="file" accept="audio/*,video/*" hidden onChange={(e) => { const f = e.target.files?.[0]; if (f) matchTo(f); e.target.value = ''; }} />
        {matched && <Note>{matched}</Note>}
        <div className="studio-group">Quick looks</div>
        <div className="chips" style={{ marginTop: 6 }}>
          {STUDIO_PRESETS.map(([k, l]) => <button key={k} className={`chip ${preset === k ? 'on' : ''}`} onClick={() => applyPreset(k)}>{l}</button>)}
          <button className="chip" onClick={() => { setS({ ...DEFAULT_STUDIO }); setPreset(''); }}>↺ Reset</button>
        </div>

        <div className="studio-group">Tone</div>
        <Slider label="Bass" value={s.bass} min={-12} max={12} step={0.5} show={db(s.bass)} onChange={(v) => set({ bass: v })} hint="Low frequencies (below ~160 Hz): fuller, deeper" />
        <Slider label="Middle" value={s.mid} min={-12} max={12} step={0.5} show={db(s.mid)} onChange={(v) => set({ mid: v })} hint="Around 800 Hz: lower it to remove a boxy sound" />
        <Slider label="Presence" value={s.presence} min={-12} max={12} step={0.5} show={db(s.presence)} onChange={(v) => set({ presence: v })} hint="Around 3.5 kHz: makes speech clear and forward" />
        <Slider label="Treble" value={s.treble} min={-12} max={12} step={0.5} show={db(s.treble)} onChange={(v) => set({ treble: v })} hint="Above ~6.5 kHz: brightness and air" />
        <Slider label="Low cut" value={s.lowCut} min={0} max={250} step={10} show={s.lowCut ? `${s.lowCut} Hz` : 'off'} onChange={(v) => set({ lowCut: v })} hint="Removes rumble, fan and handling noise" />

        <div className="studio-group">Voice</div>
        <Slider label="Speed" value={s.speed} min={0.5} max={2} step={0.05} show={`${s.speed.toFixed(2)}×`} onChange={(v) => set({ speed: v })} hint="Faster or slower — the voice keeps its pitch" />
        <Slider label="Pitch" value={s.pitch} min={-12} max={12} step={0.5} show={`${s.pitch > 0 ? '+' : ''}${s.pitch} semitones`} onChange={(v) => set({ pitch: v })} hint="Deeper (−) or higher (+) voice; length stays the same" />
        <Slider label="Intonation" value={s.intonation ?? 1} min={0.6} max={1.8} step={0.05} show={`×${(s.intonation ?? 1).toFixed(2)}`} onChange={(v) => set({ intonation: v })} hint="How much the voice rises and falls: higher = livelier, announcer-like; lower = flatter, calmer" />
        <Slider label="Volume" value={s.gain} min={-12} max={12} step={0.5} show={db(s.gain)} onChange={(v) => set({ gain: v })} />

        <div className="studio-group">Level & dynamics</div>
        <Slider label="Compression" value={s.compress} min={0} max={1} step={0.05} show={s.compress ? `${Math.round(s.compress * 100)}%` : 'off'} onChange={(v) => set({ compress: v })} hint="Evens out loud and soft words" />
        <label className="field small">Loudness
          <select value={s.loudness ?? ''} onChange={(e) => set({ loudness: e.target.value === '' ? null : +e.target.value })}>
            <option value="">Keep as it is</option>
            <option value={-14}>−14 LUFS · YouTube, Instagram, WhatsApp</option>
            <option value={-16}>−16 LUFS · voice-over / podcast</option>
            <option value={-18}>−18 LUFS · quieter</option>
            <option value={-23}>−23 LUFS · TV broadcast</option>
          </select>
        </label>

        <div className="studio-group">Space</div>
        <Slider label="Echo" value={s.echo} min={0} max={1} step={0.05} show={s.echo ? `${Math.round(s.echo * 100)}%` : 'off'} onChange={(v) => set({ echo: v })} />
        <Slider label="Reverb" value={s.reverb} min={0} max={1} step={0.05} show={s.reverb ? `${Math.round(s.reverb * 100)}%` : 'off'} onChange={(v) => set({ reverb: v })} hint="Room / hall sound" />

        <div className="studio-group">Clean & edit</div>
        <label className="row small"><input type="checkbox" checked={s.clean} onChange={(e) => set({ clean: e.target.checked })} /> Reduce background noise & hum</label>
        <label className="field small">Long pauses
          <select value={s.maxPause} onChange={(e) => set({ maxPause: +e.target.value })}>
            <option value={0}>Keep as they are</option>
            <option value={1.2}>Shorten to 1.2 s</option>
            <option value={0.8}>Shorten to 0.8 s</option>
            <option value={0.5}>Shorten to 0.5 s (tight)</option>
          </select>
        </label>
        <Slider label="Fade in" value={s.fadeIn} min={0} max={5} step={0.1} show={s.fadeIn ? `${s.fadeIn.toFixed(1)} s` : 'off'} onChange={(v) => set({ fadeIn: v })} />
        <Slider label="Fade out" value={s.fadeOut} min={0} max={5} step={0.1} show={s.fadeOut ? `${s.fadeOut.toFixed(1)} s` : 'off'} onChange={(v) => set({ fadeOut: v })} />
        <label className="row small"><input type="checkbox" checked={s.telephone} onChange={(e) => set({ telephone: e.target.checked })} /> Telephone / walkie-talkie sound</label>
        <label className="row small"><input type="checkbox" checked={s.mono} onChange={(e) => set({ mono: e.target.checked })} /> Save as mono (one channel, smaller file)</label>
      </aside>
    </div>
  );
}

const sorted = (media: MediaItem[]) => media.filter((m) => m.status === 'ready' && (m.kind === 'audio' || m.hasAudio));

/** The last matched sample voice is remembered so the Voice-over tab can use it too. */
export function saveSampleProfile(p: VoiceProfile, name: string) {
  try { localStorage.setItem('sc-sample-voice', JSON.stringify({ ...p, name })); } catch { /* storage blocked */ }
}
export function loadSampleProfile(): (VoiceProfile & { name: string }) | null {
  try { const t = localStorage.getItem('sc-sample-voice'); return t ? JSON.parse(t) : null; } catch { return null; }
}
