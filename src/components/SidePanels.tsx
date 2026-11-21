import { useRef, useState } from 'react';
import type { Store } from '../store';
import type { CaptionStyle, MediaRole, MusicMood, Overlay } from '../types';
import { cutOnBeats, mainMusic, newOverlay, setMusic, type ShuffleOpts } from '../edit';
import { autoCaptions, captionsFromScenes, type WhisperSize } from '../audio/captions';
import { synthMusic } from '../audio/synth';
import { ASPECTS, STYLE_PACKS } from '../presets';
import { assignTransitions } from '../assemble';
import { fmtTime, uid } from '../util';
import { More, Note, Progress } from './common';
import type { Sel } from './MultiTimeline';

type AddFiles = (f: { blob: Blob; name: string; role?: MediaRole }[]) => Promise<string[]>;

export function TextPanel({ store, time, setSel }: { store: Store; time: number; setSel: (s: Sel) => void }) {
  const { project: p, update } = store;
  const [capMsg, setCapMsg] = useState('');
  const [capPct, setCapPct] = useState<number | undefined>();
  const [busy, setBusy] = useState(false);
  const [model, setModel] = useState<WhisperSize>('base');
  const add = (preset: Overlay['preset']) => {
    const o = newOverlay(preset, time);
    update((c) => ({ ...c, overlays: [...c.overlays, o] }));
    setSel({ kind: 'overlay', id: o.id });
  };
  const runAuto = async () => {
    setBusy(true);
    try {
      const caps = await autoCaptions(p, model, (m, pct) => { setCapMsg(m); setCapPct(pct); });
      update({ captions: caps, captionStyle: p.captionStyle === 'off' ? 'word' : p.captionStyle });
      setCapMsg(`${caps.length} caption lines added.`);
    } catch (e: any) { setCapMsg(`${e?.message ?? e}`); } finally { setBusy(false); setCapPct(undefined); }
  };
  const presets: [Overlay['preset'], string, string][] = [
    ['title', 'Big title', 'Bold centred heading'], ['lower', 'Lower third', 'Name & role strip'], ['caption', 'Subtitle box', 'Text in a dark box'],
    ['tag', 'Tag / badge', '“NEW”, “Sale”, “Live”'], ['plain', 'Plain text', 'Anywhere on screen'],
  ];
  return (
    <div className="col" style={{ gap: 10 }}>
      <span className="small muted">Added at the playhead ({fmtTime(time)}) on the Text track. Drag it on the timeline to move it.</span>
      <div className="grid g2">
        {presets.map(([k, l, h]) => (
          <button key={k} className="choice tight" onClick={() => add(k)}><b>{l}</b><span>{h}</span></button>
        ))}
      </div>
      <div className="card tight">
        <div className="row" style={{ justifyContent: 'space-between' }}>
          <b className="small">Captions</b>
          <select value={p.captionStyle} onChange={(e) => update({ captionStyle: e.target.value as CaptionStyle })} style={{ width: 'auto' }} className="small">
            <option value="off">Off</option><option value="line">Simple line</option><option value="word">Word-by-word colour</option><option value="box">Word-by-word box</option>
          </select>
        </div>
        <div className="row" style={{ marginTop: 8 }}>
          <button className="btn small" disabled={busy} onClick={runAuto}>🗣 From speech</button>
          <select value={model} onChange={(e) => setModel(e.target.value as WhisperSize)} style={{ width: 'auto' }} className="small">
            <option value="base">Fast model</option><option value="small">Better model</option>
          </select>
          <button className="btn small" onClick={() => update({ captions: captionsFromScenes(p), captionStyle: p.captionStyle === 'off' ? 'line' : p.captionStyle })}>From scene text</button>
          {p.captions.length > 0 && <button className="btn small" onClick={() => update({ captions: [] })}>Clear</button>}
        </div>
        {capMsg && <Note>{capMsg}</Note>}
        {capPct !== undefined && <Progress value={capPct} />}
        {p.captions.length > 0 && (
          <More label={`Edit ${p.captions.length} lines`}>
            <div className="list">
              {p.captions.map((c) => (
                <div className="li" key={c.id}>
                  <span className="small muted" style={{ width: 40 }}>{fmtTime(c.start)}</span>
                  <input type="text" value={c.text} onChange={(e) => update((cur) => ({ ...cur, captions: cur.captions.map((x) => (x.id === c.id ? { ...x, text: e.target.value, words: undefined } : x)) }), 'cap-' + c.id)} />
                  <button className="icon-btn" onClick={() => update((cur) => ({ ...cur, captions: cur.captions.filter((x) => x.id !== c.id) }))}>×</button>
                </div>
              ))}
            </div>
          </More>
        )}
        <p className="small muted">Speech captions run Whisper in this browser; the model downloads once (internet needed), your audio stays here.</p>
      </div>
    </div>
  );
}

export interface ShuffleCtl { opts: Omit<ShuffleOpts, 'seed'>; setOpts: (o: Omit<ShuffleOpts, 'seed'>) => void; run: (o?: { fresh?: boolean }) => void; count: number }

export function AudioPanel({ store, time, addFiles, sel, beatsInfo, shuffle }: { store: Store; time: number; addFiles: AddFiles; sel: Sel; beatsInfo: string; shuffle?: ShuffleCtl }) {
  const { project: p, update } = store;
  const [mood, setMood] = useState<MusicMood>(p.style.mood);
  const [making, setMaking] = useState(false);
  const [rec, setRec] = useState<MediaRecorder | null>(null);
  const [msg, setMsg] = useState('');
  const [everyN, setEveryN] = useState(2);
  const chunks = useRef<Blob[]>([]);
  const recAt = useRef(0);
  const music = mainMusic(p);
  const songs = p.media.filter((m) => m.kind === 'audio' && m.status === 'ready');

  const makeBed = async () => {
    setMaking(true);
    try {
      const blob = await synthMusic(mood, Math.max(20, p.targetLength) + 6, uid('m') + mood);
      const [id] = await addFiles([{ blob, name: `music-bed-${mood}.wav`, role: 'music' }]);
      if (id) update((c) => setMusic(c, id));
    } finally { setMaking(false); }
  };
  const startRec = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true } });
      const r = new MediaRecorder(stream);
      chunks.current = [];
      recAt.current = time;
      r.ondataavailable = (e) => e.data.size && chunks.current.push(e.data);
      r.onstop = async () => {
        stream.getTracks().forEach((t) => t.stop());
        const blob = new Blob(chunks.current, { type: r.mimeType || 'audio/webm' });
        const [id] = await addFiles([{ blob, name: `voice-${fmtTime(recAt.current).replace(':', 'm')}.${blob.type.includes('mp4') ? 'm4a' : 'webm'}`, role: 'voice' }]);
        const at = recAt.current;
        setTimeout(() => update((c) => {
          const m = c.media.find((x) => x.id === id);
          return { ...c, audio: [...c.audio, { id: uid('a'), mediaId: id, role: 'voice', at, offset: 0, dur: m?.duration || 5, volume: 1, fadeIn: 0.05, fadeOut: 0.1 }] };
        }), 300);
        setRec(null);
        setMsg('Voice added to the Voice track. Music dips under it automatically.');
      };
      r.start();
      setRec(r);
    } catch (e: any) { setMsg(`Microphone not available: ${e?.message ?? e}`); }
  };
  const beatCut = (all: boolean) => {
    const ids = all ? p.scenes.map((s) => s.id) : sel?.kind === 'scene' ? [sel.id] : [];
    if (!ids.length) { setMsg('Select a clip on the timeline first (or use “all clips”).'); return; }
    const { project, cuts } = cutOnBeats(p, ids, everyN);
    if (!cuts) { setMsg('No beats fall inside the chosen clip(s).'); return; }
    update(project);
    setMsg(`Cut in ${cuts} place(s) on the beat. Delete the pieces you don’t want, or change their look.`);
  };

  return (
    <div className="col" style={{ gap: 10 }}>
      <div className="card tight">
        <b className="small">Background music</b>
        <select value={music?.mediaId ?? ''} onChange={(e) => update(setMusic(p, e.target.value || undefined))} style={{ marginTop: 6 }}>
          <option value="">No music</option>
          {songs.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
        </select>
        {music && (
          <>
            <label className="field" style={{ marginTop: 8 }}>Volume: {Math.round(music.volume * 100)}%
              <input type="range" min={0} max={1.5} step={0.05} value={music.volume} onChange={(e) => update((c) => ({ ...c, audio: c.audio.map((a) => (a.id === music.id ? { ...a, volume: +e.target.value } : a)) }), 'mvol')} />
            </label>
            <div className="grid g2">
              <label className="field">Fade in (s)<input type="number" min={0} max={20} step={0.5} value={music.fadeIn} onChange={(e) => update((c) => ({ ...c, audio: c.audio.map((a) => (a.id === music.id ? { ...a, fadeIn: Math.max(0, +e.target.value) } : a)) }), 'mfi')} /></label>
              <label className="field">Fade out (s)<input type="number" min={0} max={20} step={0.5} value={music.fadeOut} onChange={(e) => update((c) => ({ ...c, audio: c.audio.map((a) => (a.id === music.id ? { ...a, fadeOut: Math.max(0, +e.target.value) } : a)) }), 'mfo')} /></label>
            </div>
            <label className="field">Music level under speech: {Math.round(p.duckLevel * 100)}%
              <input type="range" min={0.05} max={0.6} step={0.01} value={p.duckLevel} onChange={(e) => update({ duckLevel: +e.target.value }, 'duck')} />
            </label>
            <p className="small muted">{beatsInfo}</p>
          </>
        )}
        <div className="row" style={{ marginTop: 6 }}>
          <select value={mood} onChange={(e) => setMood(e.target.value as MusicMood)} style={{ width: 'auto' }} className="small">
            {(['energetic', 'festive', 'corporate', 'warm', 'calm', 'patriotic', 'elegant'] as MusicMood[]).map((m) => <option key={m} value={m}>{m[0].toUpperCase() + m.slice(1)}</option>)}
          </select>
          <button className="btn small" disabled={making} onClick={makeBed}>{making ? 'Making…' : '🎹 Make a music bed'}</button>
        </div>
      </div>
      <div className="card tight">
        <b className="small">Cut on the beat</b>
        <div className="row" style={{ marginTop: 6 }}>
          <select value={everyN} onChange={(e) => setEveryN(+e.target.value)} style={{ width: 'auto' }} className="small">
            {[1, 2, 4, 8].map((n) => <option key={n} value={n}>every {n} beat{n > 1 ? 's' : ''}</option>)}
          </select>
          <button className="btn small" disabled={!p.beats.length} onClick={() => beatCut(false)}>✂ Selected clip</button>
          <button className="btn small" disabled={!p.beats.length} onClick={() => beatCut(true)}>✂ All clips</button>
        </div>
        <label className="row small" style={{ marginTop: 6 }}><input type="checkbox" checked={p.snapToBeats} onChange={(e) => update({ snapToBeats: e.target.checked })} /> Snap scene ends & montage cuts to beats</label>
        {!p.beats.length && <p className="small muted">Add music first — beats are found automatically.</p>}
      </div>
      {shuffle && (
        <div className="card tight">
          <b className="small">🔀 Beat shuffle</b>
          <p className="small muted" style={{ margin: '4px 0 6px' }}>Cuts the clips on your video track into beat-long pieces and mixes them in a new order, every cut on a beat. Not happy? Shuffle again.</p>
          <div className="grid g2">
            <label className="field">Cut every
              <select value={String(shuffle.opts.rhythm)} onChange={(e) => shuffle.setOpts({ ...shuffle.opts, rhythm: e.target.value === 'mix' ? 'mix' : (+e.target.value as 1 | 2 | 4) })}>
                <option value="1">1 beat (fast)</option><option value="2">2 beats</option><option value="4">4 beats (calm)</option><option value="mix">Mixed (lively)</option>
              </select>
            </label>
            <label className="field">Length
              <select value={String(shuffle.opts.length)} onChange={(e) => { const v = e.target.value; shuffle.setOpts({ ...shuffle.opts, length: v === 'same' || v === 'music' ? v : +v }); }}>
                <option value="same">Same as now</option><option value="music">Whole song</option><option value="15">15 s</option><option value="30">30 s</option><option value="60">60 s</option>
              </select>
            </label>
          </div>
          <label className="row small" style={{ marginTop: 6 }}><input type="checkbox" checked={shuffle.opts.keepEnds} onChange={(e) => shuffle.setOpts({ ...shuffle.opts, keepEnds: e.target.checked })} /> Keep the opening title & end card in place</label>
          <div className="row" style={{ marginTop: 8 }}>
            <button className="btn small primary" disabled={!p.beats.length} onClick={() => shuffle.run()}>🔀 {shuffle.count ? 'Shuffle again' : 'Shuffle to the beat'}</button>
            {shuffle.count > 0 && <button className="btn small" onClick={() => shuffle.run({ fresh: true })} title="Use what is on the video track now as the new set of clips">Start from current track</button>}
          </div>
          {shuffle.count > 0 && <p className="small muted" style={{ marginTop: 6 }}>Mix {shuffle.count}. Each new mix uses your original clips. Ctrl+Z steps back to earlier mixes.</p>}
        </div>
      )}
      <div className="card tight">
        <b className="small">Voiceover</b>
        <div className="row" style={{ marginTop: 6 }}>
          {!rec ? <button className="btn small" onClick={startRec}>🎙 Record at {fmtTime(time)}</button> : <button className="btn small primary" onClick={() => rec.stop()}>■ Stop recording</button>}
        </div>
        <p className="small muted">Or drop a recording in Media and press ＋ to put it at the playhead.</p>
      </div>
      {msg && <Note>{msg}</Note>}
    </div>
  );
}

export function StylePanel({ store }: { store: Store }) {
  const { project: p, update } = store;
  return (
    <div className="col" style={{ gap: 10 }}>
      <label className="field">Video shape
        <select value={p.aspect} onChange={(e) => update({ aspect: e.target.value as any })}>
          {ASPECTS.map((a) => <option key={a.key} value={a.key}>{a.label} — {a.hint}</option>)}
        </select>
      </label>
      <span className="small muted">Style (colours, fonts, shapes, transitions)</span>
      <div className="col" style={{ gap: 6 }}>
        {STYLE_PACKS.map((s) => (
          <button key={s.id} className={`choice tight row ${p.style.id === s.id ? 'on' : ''}`} style={{ flexDirection: 'row', alignItems: 'center' }}
            onClick={() => update((c) => { const style = structuredClone(s); const scenes = structuredClone(c.scenes); assignTransitions(scenes.filter((x) => x.kind !== 'moment'), style); return { ...c, style, scenes }; })}>
            <span className="bar mini">{[s.colors.bg, s.colors.accent, s.colors.accent2, s.colors.panel].map((c, i) => <i key={i} style={{ background: c }} />)}</span>
            <b style={{ fontFamily: s.fontHead }}>{s.name}</b>
          </button>
        ))}
      </div>
      <span className="small muted">More colour, font and brand settings are in ✨ Auto video → Look.</span>
    </div>
  );
}
