import { useRef, useState } from 'react';
import type { Store } from '../store';
import type { AspectKey } from '../types';
import { ASPECTS } from '../presets';
import { timeline } from '../render/engine';
import { EXPORT_PRESETS, dims, estimateBytes, exportGif, exportThumbnail, exportVideo, supportsWebCodecs, type ExportPreset } from '../export/exporter';
import { captionsFromScenes, toSrt } from '../audio/captions';
import { download, fmtBytes, fmtTime } from '../util';
import { Note, PageHead, Progress } from './common';

interface Result { name: string; blob: Blob; url: string; note?: string; ms: number }

export function StepExport({ store }: { store: Store }) {
  const { project: p } = store;
  const [preset, setPreset] = useState<ExportPreset>(EXPORT_PRESETS[0]);
  const [extra, setExtra] = useState<AspectKey[]>([]);
  const [busy, setBusy] = useState(false);
  const [pct, setPct] = useState(0);
  const [label, setLabel] = useState('');
  const [err, setErr] = useState('');
  const [results, setResults] = useState<Result[]>([]);
  const abort = useRef<AbortController | null>(null);
  const { total } = timeline(p);
  const base = p.name.replace(/[^\p{L}\p{N}\- ]+/gu, '').trim().replace(/\s+/g, '-') || 'video';
  const formats: AspectKey[] = [p.aspect, ...extra.filter((a) => a !== p.aspect)];

  const run = async () => {
    setBusy(true); setErr('');
    abort.current = new AbortController();
    try {
      for (let i = 0; i < formats.length; i++) {
        const a = formats[i];
        const t0 = performance.now();
        const res = await exportVideo(p, preset, a, (v, l) => { setPct((i + v) / formats.length); setLabel(`${a}: ${l}`); }, abort.current.signal);
        const name = `${base}-${a.replace(':', 'x')}-${preset.id}.${res.ext}`;
        setResults((r) => [{ name, blob: res.blob, url: URL.createObjectURL(res.blob), note: res.note, ms: performance.now() - t0 }, ...r]);
      }
      setLabel('All done');
    } catch (e: any) {
      if (e?.name !== 'AbortError') setErr(e?.message ?? String(e));
      else setLabel('Cancelled');
    } finally { setBusy(false); }
  };

  const extraFile = async (kind: 'png' | 'srt' | 'gif') => {
    setBusy(true); setErr('');
    try {
      if (kind === 'png') download(await exportThumbnail(p, p.aspect), `${base}-thumbnail.png`);
      if (kind === 'srt') {
        const caps = p.captions.length ? p.captions : captionsFromScenes(p);
        download(new Blob([toSrt(caps)], { type: 'application/x-subrip' }), `${base}.srt`);
      }
      if (kind === 'gif') download(await exportGif(p, p.aspect, (v, l) => { setPct(v); setLabel(l); }), `${base}-preview.gif`);
    } catch (e: any) { setErr(e?.message ?? String(e)); } finally { setBusy(false); }
  };

  return (
    <>
      <PageHead title="Save your video" sub="Everything is made right here in your browser. Keep this tab open until it finishes." />
      {!p.scenes.length && <Note kind="warn">There are no scenes yet. Go to Preview and press “Make my video”.</Note>}
      {!supportsWebCodecs() && <Note kind="warn">This browser lacks the fast video encoder, so recording happens in real time (slower). Chrome or Edge is recommended.</Note>}
      <div className="grid g3">
        {EXPORT_PRESETS.map((pr) => {
          const d = dims(p.aspect, pr.short);
          return (
            <button key={pr.id} className={`choice ${preset.id === pr.id ? 'on' : ''}`} onClick={() => setPreset(pr)}>
              <b>{pr.label}</b>
              <span>{pr.hint}</span>
              <span>{d.w}×{d.h} · about {fmtBytes(estimateBytes(pr, total))}</span>
            </button>
          );
        })}
      </div>
      <div className="card" style={{ marginTop: 16 }}>
        <h3>Also make these shapes (text moves to fit)</h3>
        <div className="row">
          {ASPECTS.filter((a) => a.key !== p.aspect).map((a) => (
            <label key={a.key} className="row small" style={{ marginRight: 14 }}>
              <input type="checkbox" checked={extra.includes(a.key)} onChange={(e) => setExtra((x) => (e.target.checked ? [...x, a.key] : x.filter((k) => k !== a.key)))} />
              {a.label}
            </label>
          ))}
        </div>
        <div className="row" style={{ marginTop: 14 }}>
          <button className="btn primary big" disabled={busy || !p.scenes.length} onClick={run}>⬇ Make {formats.length > 1 ? `${formats.length} videos` : 'MP4'} ({fmtTime(total)})</button>
          {busy && <button className="btn" onClick={() => abort.current?.abort()}>Cancel</button>}
        </div>
        {(busy || pct > 0) && (
          <div style={{ marginTop: 12 }}>
            <Progress value={pct} />
            <div className="small muted" style={{ marginTop: 6 }}>{label}</div>
          </div>
        )}
        {err && <Note kind="bad">Something went wrong: {err}</Note>}
      </div>
      {results.length > 0 && (
        <div className="card">
          <h3>Ready to download</h3>
          <div className="list">
            {results.map((r) => (
              <div className="li" key={r.url} style={{ alignItems: 'flex-start' }}>
                <video src={r.url} controls playsInline style={{ width: 180, maxHeight: 180, borderRadius: 8, background: '#000' }} />
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
      <div className="card">
        <h3>Extras</h3>
        <div className="row">
          <button className="btn" disabled={busy || !p.scenes.length} onClick={() => extraFile('png')}>🖼 Thumbnail (PNG)</button>
          <button className="btn" disabled={busy || !p.scenes.length} onClick={() => extraFile('srt')}>💬 Captions (.srt)</button>
          <button className="btn" disabled={busy || !p.scenes.length} onClick={() => extraFile('gif')}>🎞 GIF preview (6 s)</button>
        </div>
        <p className="small muted">The .srt uses your captions, or the on-screen text if you have no captions.</p>
      </div>
    </>
  );
}
