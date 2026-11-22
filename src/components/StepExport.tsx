import { useRef, useState } from 'react';
import type { AspectKey, Project } from '../types';
import { ASPECTS } from '../presets';
import { timeline } from '../render/engine';
import { EXPORT_PRESETS, dims, estimateBytes, exportAudioOnly, exportAudioWav, exportGif, type AudioContent, exportThumbnail, exportVideo, presetForSize, supportsWebCodecs, type ExportPreset } from '../export/exporter';
import { captionsFromScenes, toSrt } from '../audio/captions';
import { keepRange } from '../edit';
import { download, fmtBytes, fmtTime } from '../util';
import { Note, Progress } from './common';

interface Result { name: string; blob: Blob; url: string; note?: string; ms: number }

/** Save / compress panel. `project` may be the whole video or a single clip (quick compress). */
export function StepExport({ project: full, title, quick }: { project: Project; title?: string; quick?: boolean }) {
  const [preset, setPreset] = useState<ExportPreset>(EXPORT_PRESETS[quick ? 1 : 0]);
  const [mode, setMode] = useState<'preset' | 'size'>(quick ? 'size' : 'preset');
  const [mb, setMb] = useState(quick ? 15 : 25);
  const [extra, setExtra] = useState<AspectKey[]>([]);
  const hasRange = full.rangeIn !== undefined && full.rangeOut !== undefined && full.rangeOut - full.rangeIn > 0.2;
  const [onlyRange, setOnlyRange] = useState(false);
  const [busy, setBusy] = useState(false);
  const [pct, setPct] = useState(0);
  const [label, setLabel] = useState('');
  const [err, setErr] = useState('');
  const [results, setResults] = useState<Result[]>([]);
  const [aContent, setAContent] = useState<AudioContent>('all');
  const [aFmt, setAFmt] = useState<'mp3' | 'mp3hq' | 'wav'>('mp3');
  const abort = useRef<AbortController | null>(null);
  const p = onlyRange && hasRange ? keepRange(full, full.rangeIn!, full.rangeOut!) : full;
  const { total } = timeline(p);
  const base = (p.name.replace(/[^\p{L}\p{N}\- ]+/gu, '').trim().replace(/\s+/g, '-') || 'video') + (onlyRange && hasRange ? '-part' : '');
  const formats: AspectKey[] = [p.aspect, ...extra.filter((a) => a !== p.aspect)];
  // Never upscale a single clip beyond its own size when compressing it.
  const src = quick ? p.media.find((m) => m.id === p.scenes[0]?.mediaIds[0]) : undefined;
  const srcShort = src ? Math.min(src.width, src.height) - (Math.min(src.width, src.height) % 2) : Infinity;
  const base0 = mode === 'size' ? presetForSize(mb, total) : preset;
  const chosen = srcShort < base0.short ? { ...base0, short: srcShort } : base0;

  const run = async () => {
    setBusy(true); setErr('');
    abort.current = new AbortController();
    try {
      for (let i = 0; i < formats.length; i++) {
        const a = formats[i];
        const t0 = performance.now();
        const res = await exportVideo(p, chosen, a, (v, l) => { setPct((i + v) / formats.length); setLabel(`${a}: ${l}`); }, abort.current.signal);
        const name = `${base}-${a.replace(':', 'x')}-${mode === 'size' ? mb + 'MB' : chosen.id}.${res.ext}`;
        setResults((r) => [{ name, blob: res.blob, url: URL.createObjectURL(res.blob), note: res.note, ms: performance.now() - t0 }, ...r]);
      }
      setLabel('All done');
    } catch (e: any) {
      if (e?.name !== 'AbortError') setErr(e?.message ?? String(e));
      else setLabel('Cancelled');
    } finally { setBusy(false); }
  };

  const audioOnly = async () => {
    setBusy(true); setErr(''); setLabel('Mixing sound…');
    try {
      const { blob, ext } = await exportAudioOnly(p, aContent, aFmt, (v) => { setPct(v); setLabel(v < 0.1 ? 'Mixing sound…' : 'Encoding…'); });
      download(blob, `${base}${aContent === 'nomusic' ? '-no-music' : aContent === 'music' ? '-music-only' : ''}-audio.${ext}`);
      setLabel(`Sound saved (${fmtBytes(blob.size)})`);
    } catch (e: any) { setErr(e?.message ?? String(e)); } finally { setBusy(false); }
  };
  const extraFile = async (kind: 'png' | 'srt' | 'gif' | 'wav') => {
    setBusy(true); setErr('');
    try {
      if (kind === 'png') download(await exportThumbnail(p, p.aspect), `${base}-thumbnail.png`);
      if (kind === 'srt') download(new Blob([toSrt(p.captions.length ? p.captions : captionsFromScenes(p))], { type: 'application/x-subrip' }), `${base}.srt`);
      if (kind === 'gif') download(await exportGif(p, p.aspect, (v, l) => { setPct(v); setLabel(l); }), `${base}-preview.gif`);
      if (kind === 'wav') { setLabel('Mixing sound…'); download(await exportAudioWav(p), `${base}-sound.wav`); setLabel('Sound saved'); }
    } catch (e: any) { setErr(e?.message ?? String(e)); } finally { setBusy(false); }
  };

  return (
    <>
      <h2 style={{ fontSize: 18, marginBottom: 4 }}>{title ?? 'Save your video'}</h2>
      <p className="muted small" style={{ marginTop: 0 }}>Made right here in your browser — keep this tab open until it finishes. Length {fmtTime(total)}.</p>
      {!p.scenes.length && <Note kind="warn">The video track is empty.</Note>}
      {!supportsWebCodecs() && <Note kind="warn">This browser lacks the fast encoder, so saving happens in real time (slower). Chrome or Edge is recommended.</Note>}
      {hasRange && !quick && (
        <label className="row small" style={{ marginBottom: 10 }}><input type="checkbox" checked={onlyRange} onChange={(e) => setOnlyRange(e.target.checked)} /> Only the selected part ({fmtTime(full.rangeIn!)} – {fmtTime(full.rangeOut!)})</label>
      )}
      <div className="row" style={{ marginBottom: 10 }}>
        <button className={`btn small ${mode === 'preset' ? 'primary' : ''}`} onClick={() => setMode('preset')}>Quality</button>
        <button className={`btn small ${mode === 'size' ? 'primary' : ''}`} onClick={() => setMode('size')}>Compress to a file size</button>
      </div>
      {mode === 'preset' ? (
        <div className="grid g3">
          {EXPORT_PRESETS.map((pr) => {
            const d = dims(p.aspect, pr.short);
            return (
              <button key={pr.id} className={`choice ${preset.id === pr.id ? 'on' : ''}`} onClick={() => setPreset(pr)}>
                <b>{pr.label}</b><span>{pr.hint}</span><span>{d.w}×{d.h} · about {fmtBytes(estimateBytes(pr, total))}</span>
              </button>
            );
          })}
        </div>
      ) : (
        <div className="card tight">
          <label className="field">Largest file size: {mb} MB
            <input type="range" min={2} max={200} step={1} value={mb} onChange={(e) => setMb(+e.target.value)} />
          </label>
          <div className="row small muted" style={{ gap: 6 }}>
            {[8, 16, 25, 50, 100].map((v) => <button key={v} className="btn small" onClick={() => setMb(v)}>{v} MB{v === 16 ? ' (WhatsApp)' : v === 25 ? ' (email)' : ''}</button>)}
          </div>
          <p className="small muted">Will save at {dims(p.aspect, chosen.short).w}×{dims(p.aspect, chosen.short).h}, {Math.round(chosen.vbps / 1000)} kbps — about {fmtBytes(estimateBytes(chosen, total))}.</p>
        </div>
      )}
      {!quick && (
        <div className="card tight" style={{ marginTop: 12 }}>
          <b className="small">Also make these shapes (text moves to fit)</b>
          <div className="row" style={{ marginTop: 6 }}>
            {ASPECTS.filter((a) => a.key !== p.aspect).map((a) => (
              <label key={a.key} className="row small" style={{ marginRight: 10 }}>
                <input type="checkbox" checked={extra.includes(a.key)} onChange={(e) => setExtra((x) => (e.target.checked ? [...x, a.key] : x.filter((k) => k !== a.key)))} /> {a.label}
              </label>
            ))}
          </div>
        </div>
      )}
      <div className="row" style={{ marginTop: 14 }}>
        <button className="btn primary big" disabled={busy || !p.scenes.length} onClick={run}>⬇ {quick ? 'Compress' : `Make ${formats.length > 1 ? `${formats.length} videos` : 'MP4'}`}</button>
        {busy && <button className="btn" onClick={() => abort.current?.abort()}>Cancel</button>}
      </div>
      {(busy || pct > 0) && <div style={{ marginTop: 12 }}><Progress value={pct} /><div className="small muted" style={{ marginTop: 6 }}>{label}</div></div>}
      {err && <Note kind="bad">Something went wrong: {err}</Note>}
      {results.length > 0 && (
        <div className="card" style={{ marginTop: 14 }}>
          <h3>Ready to download</h3>
          <div className="list">
            {results.map((r) => (
              <div className="li" key={r.url} style={{ alignItems: 'flex-start' }}>
                <video src={r.url} controls playsInline style={{ width: 160, maxHeight: 160, borderRadius: 8, background: '#000' }} />
                <div className="grow col">
                  <b style={{ wordBreak: 'break-all' }}>{r.name}</b>
                  <span className="small muted">{fmtBytes(r.blob.size)} · made in {Math.round(r.ms / 1000)} s</span>
                  {r.note && <span className="small" style={{ color: 'var(--warn)' }}>{r.note}</span>}
                  <div><button className="btn primary small" onClick={() => download(r.blob, r.name)}>Download</button></div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
      {!quick && (
        <div className="card" style={{ marginTop: 14 }}>
          <h3>Extras</h3>
          <div className="row">
            <button className="btn small" disabled={busy || !p.scenes.length} onClick={() => extraFile('png')}>🖼 Thumbnail (PNG)</button>
            <button className="btn small" disabled={busy || !p.scenes.length} onClick={() => extraFile('srt')}>💬 Captions (.srt)</button>
            <button className="btn small" disabled={busy || !p.scenes.length} onClick={() => extraFile('gif')}>🎞 GIF (6 s)</button>
          </div>
        </div>
      )}
      {!quick && (
        <div className="card" style={{ marginTop: 14 }}>
          <h3>🎵 Audio only</h3>
          <div className="row">
            <select value={aContent} onChange={(e) => setAContent(e.target.value as AudioContent)} style={{ width: 'auto' }}>
              <option value="all">Everything, as you hear it</option>
              <option value="nomusic">Voices & clip sound (no music)</option>
              <option value="music">Music only</option>
            </select>
            <select value={aFmt} onChange={(e) => setAFmt(e.target.value as any)} style={{ width: 'auto' }}>
              <option value="mp3">MP3 · 192 kbps</option><option value="mp3hq">MP3 · 320 kbps</option><option value="wav">WAV · uncompressed</option>
            </select>
            <button className="btn primary small" disabled={busy || !p.scenes.length} onClick={audioOnly}>⬇ Save audio</button>
          </div>
          <p className="small muted">Uses the same mix and levels (about −14 LUFS) as the video{onlyRange && hasRange ? ', only the selected part' : ''}. To pull a voice out of one clip, use 🎙 Separate voice on that clip.</p>
        </div>
      )}
    </>
  );
}
