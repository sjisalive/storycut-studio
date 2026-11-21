import { useRef, useState } from 'react';
import type { Store } from '../store';
import type { MediaItem, MediaRole } from '../types';
import { addClips, beatMontage, imageOverlay, mainMusic, setMusic } from '../edit';
import { getAudioBuffer } from '../media';
import { encodeWav } from '../audio/synth';
import { makeCutout } from '../cutout';
import { timeline } from '../render/engine';
import { download, fmtTime, uid } from '../util';
import { Note, Thumb, statusTag } from './common';

export function MediaBin({ store, addFiles, time, onCompress }: {
  store: Store; time: number;
  addFiles: (f: (File | { blob: Blob; name: string; role?: MediaRole })[]) => Promise<string[]>;
  onCompress: (mediaId: string) => void;
}) {
  const { project: p, update } = store;
  const input = useRef<HTMLInputElement>(null);
  const [over, setOver] = useState(false);
  const [picked, setPicked] = useState<string[]>([]);
  const [menu, setMenu] = useState<string | null>(null);
  const [msg, setMsg] = useState('');
  const [everyN, setEveryN] = useState(2);
  const { total } = timeline(p);

  const toggle = (id: string) => setPicked((x) => (x.includes(id) ? x.filter((y) => y !== id) : [...x, id]));
  const addAudio = (m: MediaItem) => {
    if (m.role === 'music' && !mainMusic(p)) { update(setMusic(p, m.id)); setMsg('Added as background music for the whole video.'); return; }
    update((c) => ({ ...c, audio: [...c.audio, { id: uid('a'), mediaId: m.id, role: m.role === 'music' ? 'music' : 'voice', at: time, offset: 0, dur: m.duration, volume: 1, fadeIn: m.role === 'music' ? 1 : 0.05, fadeOut: m.role === 'music' ? 1.5 : 0.1, duck: m.role === 'music' }] }));
    setMsg(`Added at ${fmtTime(time)} on the ${m.role === 'music' ? 'Music' : 'Voice'} track.`);
  };
  const remove = (id: string) => update((c) => ({
    ...c,
    media: c.media.filter((m) => m.id !== id),
    rows: c.rows.map((r) => (r.mediaId === id ? { ...r, mediaId: undefined } : r)),
    bites: c.bites.filter((b) => b.mediaId !== id),
    scenes: c.scenes.map((s) => ({ ...s, mediaIds: s.mediaIds.filter((x) => x !== id), voiceId: s.voiceId === id ? undefined : s.voiceId })),
    audio: c.audio.filter((a) => a.mediaId !== id),
    overlays: c.overlays.filter((o) => o.mediaId !== id),
    cta: { ...c.cta, logoId: c.cta.logoId === id ? undefined : c.cta.logoId, cutoutId: c.cta.cutoutId === id ? undefined : c.cta.cutoutId },
  }));
  const extractAudio = async (m: MediaItem) => {
    const buf = await getAudioBuffer(m.id);
    if (!buf) { setMsg('This file has no sound.'); return; }
    download(encodeWav(buf), m.name.replace(/\.[^.]+$/, '') + '-sound.wav');
  };
  const cutout = async (m: MediaItem) => {
    try {
      const blob = await makeCutout(m.id, m.kind === 'video' ? Math.min(1, m.duration / 2) : undefined, setMsg);
      await addFiles([{ blob, name: m.name.replace(/\.[^.]+$/, '') + '-cutout.png', role: 'cutout' }]);
      setMsg('Cut-out added to the media list.');
    } catch (e: any) { setMsg(`Could not cut out (needs internet the first time): ${e?.message ?? e}`); }
  };

  const visuals = p.media.filter((m) => m.kind !== 'audio');
  const sounds = p.media.filter((m) => m.kind === 'audio');
  const Row = ({ m }: { m: MediaItem }) => (
    <div className="li bin" draggable={m.status === 'ready'} onDragStart={(e) => e.dataTransfer.setData('text/media', m.id)}>
      {m.kind !== 'audio' && <input type="checkbox" checked={picked.includes(m.id)} onChange={() => toggle(m.id)} title="Select for merge / beat montage" />}
      <Thumb m={m} size={48} />
      <div className="grow">
        <div className="nm" title={m.name}>{m.name}</div>
        <div className="small muted">{m.kind === 'image' ? m.role : fmtTime(m.duration)}{m.kind === 'video' && !m.hasAudio && m.status === 'ready' ? ' · no sound' : ''} {m.status !== 'ready' && statusTag(m)}</div>
      </div>
      {m.status === 'ready' && (
        m.kind === 'audio'
          ? <button className="btn small" title="Add to the audio track" onClick={() => addAudio(m)}>＋</button>
          : <button className="btn small" title="Add to the end of the video track" onClick={() => update(addClips(p, [m.id]))}>＋</button>
      )}
      <div className="picker">
        <button className="icon-btn" onClick={() => setMenu(menu === m.id ? null : m.id)} title="More">⋯</button>
        {menu === m.id && (
          <div className="menu" onMouseLeave={() => setMenu(null)}>
            {m.kind !== 'audio' && <button onClick={() => { const i = p.scenes.findIndex((_, k) => timeline(p).starts[k] + p.scenes[k].duration > time); update(addClips(p, [m.id], i < 0 ? undefined : i + 1)); setMenu(null); }}>Insert after playhead clip</button>}
            {m.kind === 'image' && <button onClick={() => { update((c) => ({ ...c, overlays: [...c.overlays, imageOverlay(m.id, time, Math.max(2, total - time))] })); setMenu(null); }}>Put on top as logo / picture</button>}
            {m.kind === 'audio' && <button onClick={() => { update(setMusic(p, m.id)); setMenu(null); }}>Use as background music</button>}
            {m.kind === 'video' && <button onClick={() => { onCompress(m.id); setMenu(null); }}>Compress this video…</button>}
            {m.kind !== 'image' && <button onClick={() => { extractAudio(m); setMenu(null); }}>Save its sound (WAV)</button>}
            {m.kind !== 'audio' && <button onClick={() => { cutout(m); setMenu(null); }}>Remove background (cut-out)</button>}
            {m.kind === 'audio' && <>
              <button onClick={() => { update((c) => ({ ...c, media: c.media.map((x) => (x.id === m.id ? { ...x, role: 'music' } : x)) })); setMenu(null); }}>Mark as music</button>
              <button onClick={() => { update((c) => ({ ...c, media: c.media.map((x) => (x.id === m.id ? { ...x, role: 'voice' } : x)) })); setMenu(null); }}>Mark as voice</button>
            </>}
            {m.kind === 'image' && <button onClick={() => { update((c) => ({ ...c, cta: { ...c.cta, logoId: m.id }, media: c.media.map((x) => (x.id === m.id ? { ...x, role: 'logo' } : x)) })); setMenu(null); }}>Use as end-card logo</button>}
            <button className="danger" onClick={() => { remove(m.id); setMenu(null); }}>Remove</button>
          </div>
        )}
      </div>
    </div>
  );

  return (
    <div className="col" style={{ gap: 10 }}>
      <div
        className={`drop compact ${over ? 'over' : ''}`}
        onClick={() => input.current?.click()}
        onDragOver={(e) => { e.preventDefault(); setOver(true); }}
        onDragLeave={() => setOver(false)}
        onDrop={(e) => { e.preventDefault(); setOver(false); if (e.dataTransfer.files.length) addFiles([...e.dataTransfer.files]); }}
      >
        <b>⬆ Drop videos, photos, music</b>
        <div className="small muted">or click to choose · stays on this computer</div>
        <input ref={input} type="file" multiple hidden accept="video/*,image/*,audio/*,.mov,.mkv,.m4a" onChange={(e) => { addFiles([...(e.target.files ?? [])]); e.target.value = ''; }} />
      </div>
      {msg && <Note>{msg}</Note>}
      {picked.length > 0 && (
        <div className="card tight">
          <div className="small"><b>{picked.length} selected</b></div>
          <div className="row" style={{ marginTop: 6 }}>
            <button className="btn small primary" onClick={() => { update(addClips(p, picked)); setPicked([]); setMsg('Merged onto the end of the video track.'); }}>Merge onto timeline</button>
            <button className="btn small" onClick={() => setPicked([])}>Clear</button>
          </div>
          <div className="row" style={{ marginTop: 6 }}>
            <button className="btn small" disabled={!p.beats.length} title={p.beats.length ? '' : 'Add music first'} onClick={() => {
              if (p.scenes.length && !confirm('Replace the video track with a beat montage? (Undo is available)')) return;
              update(beatMontage(p, picked, everyN, p.targetLength)); setMsg(`Beat montage made: a new clip every ${everyN} beat(s), ${p.targetLength} s long.`);
            }}>🥁 Beat montage</button>
            <select value={everyN} onChange={(e) => setEveryN(+e.target.value)} style={{ width: 'auto' }} className="small">
              {[1, 2, 4, 8].map((n) => <option key={n} value={n}>every {n} beat{n > 1 ? 's' : ''}</option>)}
            </select>
          </div>
        </div>
      )}
      <div className="list">
        {visuals.map((m) => <Row key={m.id} m={m} />)}
        {sounds.map((m) => <Row key={m.id} m={m} />)}
        {!p.media.length && <p className="small muted">No media yet. Drop files above, or open an example from ✨ Auto video.</p>}
      </div>
      {visuals.length > 1 && <button className="btn small" onClick={() => { update(addClips(p, visuals.filter((m) => m.status === 'ready').map((m) => m.id))); setMsg('All clips and photos merged onto the timeline.'); }}>Merge all onto timeline</button>}
    </div>
  );
}
