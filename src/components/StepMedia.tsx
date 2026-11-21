import { useRef, useState } from 'react';
import type { Store } from '../store';
import type { MediaRole, MusicMood } from '../types';
import { synthMusic } from '../audio/synth';
import { fmtBytes, fmtTime } from '../util';
import { More, Note, PageHead, Thumb, statusTag } from './common';

const ROLE_OPTIONS: Record<string, [MediaRole, string][]> = {
  video: [['clip', 'Clip'], ['photo', 'Clip (as photo)']],
  image: [['photo', 'Photo'], ['logo', 'Logo'], ['cutout', 'Person cut-out']],
  audio: [['music', 'Music'], ['voice', 'Voice']],
};

export function StepMedia({ store, addFiles, beatsInfo }: { store: Store; addFiles: (files: File[] | { blob: Blob; name: string; role?: MediaRole }[]) => Promise<unknown>; beatsInfo: string }) {
  const { project: p, update } = store;
  const input = useRef<HTMLInputElement>(null);
  const [over, setOver] = useState(false);
  const [mood, setMood] = useState<MusicMood>(p.style.mood);
  const [making, setMaking] = useState(false);
  const music = p.media.filter((m) => m.kind === 'audio' && m.status === 'ready');
  const visuals = p.media.filter((m) => m.kind !== 'audio');
  const audio = p.media.filter((m) => m.kind === 'audio');
  const errors = p.media.filter((m) => m.status === 'error');

  const remove = (id: string) => update((cur) => ({
    ...cur,
    media: cur.media.filter((m) => m.id !== id),
    rows: cur.rows.map((r) => (r.mediaId === id ? { ...r, mediaId: undefined } : r)),
    bites: cur.bites.filter((b) => b.mediaId !== id),
    scenes: cur.scenes.map((s) => ({ ...s, mediaIds: s.mediaIds.filter((x) => x !== id), voiceId: s.voiceId === id ? undefined : s.voiceId })),
    musicId: cur.musicId === id ? undefined : cur.musicId,
    cta: { ...cur.cta, logoId: cur.cta.logoId === id ? undefined : cur.cta.logoId, cutoutId: cur.cta.cutoutId === id ? undefined : cur.cta.cutoutId },
  }));
  const setRole = (id: string, role: MediaRole) => update((cur) => ({
    ...cur,
    media: cur.media.map((m) => (m.id === id ? { ...m, role } : m)),
    musicId: role === 'music' && !cur.musicId ? id : cur.musicId === id && role !== 'music' ? undefined : cur.musicId,
    cta: role === 'logo' && !cur.cta.logoId ? { ...cur.cta, logoId: id } : cur.cta,
  }));

  const makeBed = async () => {
    setMaking(true);
    try {
      const blob = await synthMusic(mood, p.targetLength + 6, p.id + mood);
      await addFiles([{ blob, name: `music-bed-${mood}.wav`, role: 'music' }]);
    } finally { setMaking(false); }
  };

  return (
    <>
      <PageHead title="Add your media" sub="Drop videos, photos, logos, music and voice clips. Nothing is uploaded — files stay on this computer." />
      <div
        className={`drop ${over ? 'over' : ''}`}
        onClick={() => input.current?.click()}
        onDragOver={(e) => { e.preventDefault(); setOver(true); }}
        onDragLeave={() => setOver(false)}
        onDrop={(e) => { e.preventDefault(); setOver(false); addFiles([...e.dataTransfer.files]); }}
      >
        <div style={{ fontSize: 28 }}>⬆️</div>
        <b>Drop files here</b> <span className="muted">or click to choose</span>
        <div className="small muted">MP4 / MOV / WebM · JPG / PNG / WebP · MP3 / WAV / M4A</div>
        <input ref={input} type="file" multiple hidden accept="video/*,image/*,audio/*,.mov,.mkv,.m4a" onChange={(e) => { addFiles([...(e.target.files ?? [])]); e.target.value = ''; }} />
      </div>
      {errors.length > 0 && <Note kind="bad">{errors.length} file(s) could not be read. MP4 (H.264), JPG/PNG and MP3/WAV work best.</Note>}
      <div className="grid g2" style={{ marginTop: 16 }}>
        <div className="card">
          <h3>Videos & photos <span className="tag">{visuals.length}</span></h3>
          <div className="list">
            {visuals.map((m) => (
              <div className="li" key={m.id}>
                <Thumb m={m} />
                <div className="grow">
                  <div style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{m.name}</div>
                  <div className="small muted">{m.kind === 'video' ? `${fmtTime(m.duration)} · ` : ''}{m.width ? `${m.width}×${m.height} · ` : ''}{fmtBytes(m.size)}{m.placeholder ? ' · placeholder' : ''}</div>
                </div>
                <select value={m.role} onChange={(e) => setRole(m.id, e.target.value as MediaRole)} style={{ width: 'auto' }}>
                  {(ROLE_OPTIONS[m.kind] ?? []).map(([r, l]) => <option key={r} value={r}>{l}</option>)}
                </select>
                {statusTag(m)}
                <button className="icon-btn" title="Remove" onClick={() => remove(m.id)}>×</button>
              </div>
            ))}
            {!visuals.length && <p className="muted small">No videos or photos yet.</p>}
          </div>
        </div>
        <div className="card">
          <h3>Music & voice <span className="tag">{audio.length}</span></h3>
          <div className="list">
            {audio.map((m) => (
              <div className="li" key={m.id}>
                <Thumb m={m} />
                <div className="grow">
                  <div style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{m.name}</div>
                  <div className="small muted">{fmtTime(m.duration)} · {fmtBytes(m.size)}</div>
                </div>
                <select value={m.role} onChange={(e) => setRole(m.id, e.target.value as MediaRole)} style={{ width: 'auto' }}>
                  {ROLE_OPTIONS.audio.map(([r, l]) => <option key={r} value={r}>{l}</option>)}
                </select>
                {statusTag(m)}
                <button className="icon-btn" title="Remove" onClick={() => remove(m.id)}>×</button>
              </div>
            ))}
          </div>
          <label className="field" style={{ marginTop: 10 }}>Background music
            <select value={p.musicId ?? ''} onChange={(e) => update({ musicId: e.target.value || undefined })}>
              <option value="">No music</option>
              {music.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
            </select>
          </label>
          {p.musicId && <p className="small muted">{beatsInfo}</p>}
          <div className="row" style={{ marginTop: 8 }}>
            <span className="small muted">No music file?</span>
            <select value={mood} onChange={(e) => setMood(e.target.value as MusicMood)} style={{ width: 'auto' }}>
              {(['energetic', 'festive', 'corporate', 'warm', 'calm', 'patriotic', 'elegant'] as MusicMood[]).map((m) => <option key={m} value={m}>{m[0].toUpperCase() + m.slice(1)}</option>)}
            </select>
            <button className="btn small" disabled={making} onClick={makeBed}>{making ? 'Making…' : 'Make a simple music bed'}</button>
          </div>
          <More label="Sound options">
            <label className="field">Music volume: {Math.round(p.musicVolume * 100)}%
              <input type="range" min={0} max={1} step={0.05} value={p.musicVolume} onChange={(e) => update({ musicVolume: +e.target.value }, 'mv')} />
            </label>
            <label className="field">Music level under speech: {Math.round(p.duckLevel * 100)}%
              <input type="range" min={0.05} max={0.5} step={0.01} value={p.duckLevel} onChange={(e) => update({ duckLevel: +e.target.value }, 'duck')} />
            </label>
            <label className="row small"><input type="checkbox" checked={p.snapToBeats} onChange={(e) => update({ snapToBeats: e.target.checked })} /> Cut on the music beat</label>
            <p className="small muted">The final mix is levelled to about −14 LUFS (the loudness YouTube, Instagram and WhatsApp expect).</p>
          </More>
        </div>
      </div>
    </>
  );
}
