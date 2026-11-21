import { useEffect, useRef, useState } from 'react';
import type { Store } from '../store';
import type { Bite } from '../types';
import { objectUrl } from '../media';
import { fmtTime, uid } from '../util';
import { Note, PageHead, Thumb } from './common';

export function StepBites({ store }: { store: Store }) {
  const { project: p, update } = store;
  const clips = p.media.filter((m) => m.kind === 'video' && m.status === 'ready');
  const [clipId, setClipId] = useState(clips[0]?.id);
  const [inT, setIn] = useState(0);
  const [outT, setOut] = useState(4);
  const [words, setWords] = useState('');
  const [name, setName] = useState('');
  const [role, setRole] = useState('');
  const [editing, setEditing] = useState<string | null>(null);
  const vid = useRef<HTMLVideoElement>(null);
  const clip = clips.find((c) => c.id === clipId);

  useEffect(() => { if (!clipId && clips[0]) setClipId(clips[0].id); }, [clips, clipId]);
  useEffect(() => { if (clip && !editing) { setIn(0); setOut(Math.min(clip.duration, 5)); } }, [clipId]); // eslint-disable-line

  const save = () => {
    if (!clip) return;
    const a = Math.max(0, Math.min(inT, outT)), b = Math.min(clip.duration, Math.max(inT, outT));
    if (b - a < 0.5) return;
    const bite: Bite = { id: editing ?? uid('b'), mediaId: clip.id, inT: a, outT: b, words, name, role };
    update((cur) => ({ ...cur, bites: editing ? cur.bites.map((x) => (x.id === editing ? bite : x)) : [...cur.bites, bite] }));
    setEditing(null); setWords('');
  };
  const edit = (b: Bite) => {
    setEditing(b.id); setClipId(b.mediaId); setIn(b.inT); setOut(b.outT); setWords(b.words); setName(b.name); setRole(b.role);
    setTimeout(() => { if (vid.current) vid.current.currentTime = b.inT; }, 50);
  };
  const preview = () => {
    const v = vid.current;
    if (!v) return;
    v.currentTime = inT;
    v.muted = false;
    v.play();
    const stop = () => { if (v.currentTime >= outT) { v.pause(); v.removeEventListener('timeupdate', stop); } };
    v.addEventListener('timeupdate', stop);
  };

  return (
    <>
      <PageHead title="Any speaker bites? (optional)" sub="Pick the best few seconds of someone talking and type 2–4 key words. They fly in beside the speaker." />
      {!clips.length ? (
        <Note>Add a video of someone speaking in step 3 to use this. You can skip this step.</Note>
      ) : (
        <div className="grid g2">
          <div className="card">
            <div className="row" style={{ marginBottom: 10 }}>
              {clips.map((c) => (
                <button key={c.id} className="icon-btn" style={{ width: 'auto', height: 'auto', outline: c.id === clipId ? '2px solid var(--check)' : 'none', borderRadius: 8 }} onClick={() => { setEditing(null); setClipId(c.id); }} title={c.name}>
                  <Thumb m={c} />
                </button>
              ))}
            </div>
            {clip && (
              <>
                <video ref={vid} src={objectUrl(clip.id)} controls playsInline style={{ width: '100%', borderRadius: 10, background: '#000', maxHeight: 320 }} />
                <div className="row" style={{ marginTop: 8 }}>
                  <button className="btn small" onClick={() => setIn(vid.current?.currentTime ?? 0)}>Set start here</button>
                  <span className="tag green">{fmtTime(inT)}</span>
                  <button className="btn small" onClick={() => setOut(vid.current?.currentTime ?? 0)}>Set end here</button>
                  <span className="tag green">{fmtTime(outT)}</span>
                  <button className="btn small" onClick={preview}>▶ Play this part</button>
                </div>
              </>
            )}
          </div>
          <div className="card">
            <h3>{editing ? 'Edit bite' : 'New bite'}</h3>
            <label className="field">Key words (2–4, separated by commas)
              <input type="text" value={words} placeholder="Faster, Cleaner, Cheaper" onChange={(e) => setWords(e.target.value)} />
            </label>
            <div className="grid g2" style={{ marginTop: 8 }}>
              <label className="field">Speaker name<input type="text" value={name} onChange={(e) => setName(e.target.value)} /></label>
              <label className="field">Role / place<input type="text" value={role} onChange={(e) => setRole(e.target.value)} /></label>
            </div>
            <div className="row" style={{ marginTop: 12 }}>
              <button className="btn primary" onClick={save} disabled={!clip || Math.abs(outT - inT) < 0.5}>{editing ? 'Save bite' : 'Add bite'} ({Math.abs(outT - inT).toFixed(1)} s)</button>
              {editing && <button className="btn" onClick={() => setEditing(null)}>Cancel</button>}
            </div>
            <h3 style={{ marginTop: 18 }}>Bites <span className="tag">{p.bites.length}</span></h3>
            <div className="list">
              {p.bites.map((b) => (
                <div className="li" key={b.id}>
                  <Thumb m={p.media.find((m) => m.id === b.mediaId)} />
                  <div className="grow">
                    <div>{b.words || <span className="muted">No key words</span>}</div>
                    <div className="small muted">{b.name}{b.role ? ` · ${b.role}` : ''} · {fmtTime(b.inT)}–{fmtTime(b.outT)}</div>
                  </div>
                  <button className="icon-btn" title="Edit" onClick={() => edit(b)}>✎</button>
                  <button className="icon-btn" title="Remove" onClick={() => update((c) => ({ ...c, bites: c.bites.filter((x) => x.id !== b.id) }))}>×</button>
                </div>
              ))}
            </div>
            <p className="small muted">Their sound plays in the video and the music dips under it automatically.</p>
          </div>
        </div>
      )}
    </>
  );
}
