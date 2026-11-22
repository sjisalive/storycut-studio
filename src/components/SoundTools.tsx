import { useEffect, useRef, useState } from 'react';
import type { MediaRole } from '../types';
import type { Store } from '../store';
import { getAudioBuffer } from '../media';
import { encodeAudio, separateVoice, type Separated } from '../audio/separate';
import { encodeWav } from '../audio/synth';
import { timeline } from '../render/engine';
import { download, uid } from '../util';
import { Note, Progress } from './common';

type Fmt = 'mp3' | 'mp3hq' | 'wav';

/** "Separate voice": split a file's sound into voice only and background (voice removed). */
export function SoundTools({ store, mediaId, sceneId, time, addFiles, onClose }: {
  store: Store; mediaId: string; sceneId?: string; time: number;
  addFiles: (f: { blob: Blob; name: string; role?: MediaRole }[]) => Promise<string[]>;
  onClose: () => void;
}) {
  const { project: p, update } = store;
  const m = p.media.find((x) => x.id === mediaId);
  const scene = sceneId ? p.scenes.find((s) => s.id === sceneId) : undefined;
  const [strength, setStrength] = useState(0.6);
  const [denoise, setDenoise] = useState(true);
  const [busy, setBusy] = useState(false);
  const [pct, setPct] = useState(0);
  const [res, setRes] = useState<Separated | null>(null);
  const [orig, setOrig] = useState<AudioBuffer | null>(null);
  const [msg, setMsg] = useState('');
  const [fmt, setFmt] = useState<Fmt>('mp3');
  const [playing, setPlaying] = useState<string | null>(null);
  const ctx = useRef<AudioContext | null>(null);
  const node = useRef<AudioBufferSourceNode | null>(null);
  const added = useRef<Record<string, string>>({});
  const base = (m?.name ?? 'sound').replace(/\.[^.]+$/, '');

  useEffect(() => { getAudioBuffer(mediaId).then(setOrig); }, [mediaId]);
  useEffect(() => () => { node.current?.stop(); ctx.current?.close(); }, []);

  const startAt = scene ? scene.clipIn ?? 0 : 0;
  const play = async (key: string, buf: AudioBuffer | null) => {
    node.current?.stop(); node.current = null;
    if (playing === key || !buf) { setPlaying(null); return; }
    if (!ctx.current) ctx.current = new AudioContext();
    await ctx.current.resume();
    const src = ctx.current.createBufferSource();
    src.buffer = buf; src.connect(ctx.current.destination);
    src.onended = () => setPlaying((k) => (k === key ? null : k));
    src.start(0, Math.min(startAt, Math.max(0, buf.duration - 1)));
    node.current = src;
    setPlaying(key);
  };

  const run = async () => {
    if (!orig) return;
    setBusy(true); setMsg(''); setRes(null); added.current = {};
    try {
      const out = await separateVoice(orig, strength, denoise, setPct);
      setRes(out);
      if (!out.stereo) setMsg('This sound is mono (one channel), so only the noise clean-up and speech filter could be used. Music in a mono recording cannot be pulled apart as well as in stereo.');
    } catch (e: any) { setMsg(`Could not separate: ${e?.message ?? e}`); } finally { setBusy(false); }
  };

  const save = async (which: 'voice' | 'background') => {
    if (!res) return;
    setBusy(true);
    try {
      const { blob, ext } = await encodeAudio(which === 'voice' ? res.voice : res.background, fmt, setPct);
      download(blob, `${base}-${which === 'voice' ? 'voice-only' : 'no-voice'}.${ext}`);
    } finally { setBusy(false); }
  };

  /** Put the result on the Voice track, lined up with the clip, and mute the clip's own sound. */
  const use = async (which: 'voice' | 'background') => {
    if (!res) return;
    let id = added.current[which];
    if (!id) {
      [id] = await addFiles([{ blob: encodeWav(which === 'voice' ? res.voice : res.background), name: `${base}-${which === 'voice' ? 'voice-only' : 'no-voice'}.wav`, role: which === 'voice' ? 'voice' : 'clip' as MediaRole }]);
      added.current[which] = id;
    }
    const { starts } = timeline(p);
    const i = scene ? p.scenes.indexOf(scene) : -1;
    const at = i >= 0 ? starts[i] : time;
    const offset = scene ? scene.clipIn ?? 0 : 0;
    const dur = scene ? scene.duration : (which === 'voice' ? res.voice : res.background).duration;
    update((c) => ({
      ...c,
      media: c.media.map((x) => (x.id === id && which === 'background' ? { ...x, role: 'music' } : x)),
      audio: [...c.audio, { id: uid('a'), mediaId: id, role: which === 'voice' ? 'voice' : 'sfx', at, offset, dur, volume: 1, fadeIn: 0.05, fadeOut: 0.1 }],
      scenes: scene ? c.scenes.map((s) => (s.id === scene.id ? { ...s, muted: true } : s)) : c.scenes,
    }));
    setMsg(which === 'voice'
      ? `Voice placed on the Voice track${scene ? ' in line with the clip, and the clip’s own sound is muted' : ` at the playhead`}. Your music will dip under it automatically.`
      : `Background placed on the Voice track${scene ? ' in line with the clip, and the clip’s own sound is muted' : ''}.`);
  };

  return (
    <div className="modal-bg" onClick={onClose}>
      <div className="modal" style={{ width: 'min(620px, 100%)' }} onClick={(e) => e.stopPropagation()}>
        <div className="row" style={{ justifyContent: 'space-between' }}>
          <h3 style={{ margin: 0 }}>🎙 Separate voice</h3>
          <button className="icon-btn" onClick={onClose}>×</button>
        </div>
        <p className="small muted" style={{ marginTop: 4 }}>{m?.name} · {orig ? `${orig.duration.toFixed(1)} s, ${orig.numberOfChannels > 1 ? 'stereo' : 'mono'}` : 'reading sound…'}</p>
        {!orig && m && <Note kind="warn">Reading the sound… (if this stays, the file has no sound track).</Note>}
        <div className="row" style={{ gap: 6 }}>
          <span className="small muted">Strength</span>
          {([[0.3, 'Gentle'], [0.6, 'Normal'], [1, 'Strong']] as [number, string][]).map(([v, l]) => (
            <button key={l} className={`btn small ${strength === v ? 'primary' : ''}`} onClick={() => setStrength(v)}>{l}</button>
          ))}
        </div>
        <label className="row small" style={{ marginTop: 8 }}><input type="checkbox" checked={denoise} onChange={(e) => setDenoise(e.target.checked)} /> Also reduce background noise & hum</label>
        <div className="row" style={{ marginTop: 10 }}>
          <button className="btn primary" disabled={!orig || busy} onClick={run}>{res ? 'Separate again' : 'Separate'}</button>
          <button className="btn small" disabled={!orig} onClick={() => play('orig', orig)}>{playing === 'orig' ? '■ Stop' : '▶ Original'}</button>
        </div>
        {busy && <div style={{ marginTop: 10 }}><Progress value={pct} /></div>}
        {res && (
          <div className="col" style={{ gap: 8, marginTop: 12 }}>
            {(['voice', 'background'] as const).map((w) => (
              <div key={w} className="card tight">
                <div className="row" style={{ justifyContent: 'space-between' }}>
                  <b className="small">{w === 'voice' ? '🎙 Voice only' : '🎵 Background (voice removed)'}</b>
                  <button className="btn small" onClick={() => play(w, res[w])}>{playing === w ? '■ Stop' : '▶ Listen'}</button>
                </div>
                <div className="row" style={{ marginTop: 6 }}>
                  <button className="btn small" disabled={busy} onClick={() => save(w)}>⬇ Save {fmt === 'wav' ? 'WAV' : 'MP3'}</button>
                  <button className="btn small primary" disabled={busy} onClick={() => use(w)}>Use on timeline</button>
                </div>
              </div>
            ))}
            <label className="row small">File type
              <select value={fmt} onChange={(e) => setFmt(e.target.value as Fmt)} style={{ width: 'auto' }}>
                <option value="mp3">MP3 (192 kbps)</option><option value="mp3hq">MP3 high quality (320 kbps)</option><option value="wav">WAV (uncompressed)</option>
              </select>
            </label>
          </div>
        )}
        {msg && <Note>{msg}</Note>}
        <p className="small muted" style={{ marginTop: 10 }}>
          Runs on this computer. It keeps what sits in the centre of a stereo mix (where voices usually are), keeps speech frequencies, cleans steady noise and quietens gaps between phrases.
          It works best when the voice is louder than the music; it is not as clean as studio AI tools on loud songs. Try Strong if music still leaks through, Gentle if the voice sounds thin.
        </p>
      </div>
    </div>
  );
}
