import { useEffect, useRef, useState } from 'react';
import type { MediaItem } from '../types';
import { getAudioBuffer, getBlob } from '../media';
import { separateVoice } from '../audio/separate';
import { Note, Progress } from './common';
import { decodeFile, FmtSelect, saveBuffer, secs, useBufferPlayer, type AudioFmt } from './audioUi';

type What = 'all' | 'voice' | 'background';
interface Job { id: string; name: string; source: { file?: File; mediaId?: string }; status: 'waiting' | 'working' | 'done' | 'error'; note?: string; out?: AudioBuffer; dur?: number }

/** 🎵 Extract audio: MP3 / WAV from one or many videos, optionally voice only or voice removed. */
export function ExtractTab({ media, preselect, onStudio, onTimeline }: {
  media: MediaItem[];
  preselect?: { id: string } | null;
  onStudio: (buf: AudioBuffer, name: string) => void;
  onTimeline: (buf: AudioBuffer, name: string) => Promise<void>;
}) {
  const [jobs, setJobs] = useState<Job[]>([]);
  const [what, setWhat] = useState<What>('all');
  const [strength, setStrength] = useState(0.6);
  const [fmt, setFmt] = useState<AudioFmt>('mp3');
  const [running, setRunning] = useState(false);
  const [pct, setPct] = useState(0);
  const [msg, setMsg] = useState('');
  const fileRef = useRef<HTMLInputElement>(null);
  const pl = useBufferPlayer();
  const usable = media.filter((m) => m.status === 'ready' && (m.kind === 'audio' || m.hasAudio));

  const addMedia = (id: string) => {
    const m = media.find((x) => x.id === id);
    if (!m) return;
    setJobs((js) => (js.some((j) => j.source.mediaId === id) ? js : [...js, { id: `j${Date.now()}${id}`, name: m.name.replace(/\.[^.]+$/, ''), source: { mediaId: id }, status: 'waiting' }]));
  };
  useEffect(() => { if (preselect) addMedia(preselect.id); }, [preselect]); // eslint-disable-line react-hooks/exhaustive-deps
  const addFiles = (fs: FileList | File[]) => {
    const list = [...fs].filter((f) => /^(video|audio)\//.test(f.type) || /\.(mp4|mov|webm|mkv|m4v|3gp|mp3|wav|m4a|aac|ogg|flac|opus)$/i.test(f.name));
    setJobs((js) => [...js, ...list.map((f, i) => ({ id: `j${Date.now()}${i}`, name: f.name.replace(/\.[^.]+$/, ''), source: { file: f }, status: 'waiting' as const }))]);
  };
  const patch = (id: string, p: Partial<Job>) => setJobs((js) => js.map((j) => (j.id === id ? { ...j, ...p } : j)));
  const suffix = what === 'voice' ? '-voice-only' : what === 'background' ? '-no-voice' : '';

  const extractOne = async (j: Job): Promise<AudioBuffer> => {
    let buf: AudioBuffer | null;
    if (j.source.file) buf = await decodeFile(j.source.file);
    else {
      buf = await getAudioBuffer(j.source.mediaId!);
      if (!buf) { const b = getBlob(j.source.mediaId!); if (b) buf = await decodeFile(b); }
    }
    if (!buf) throw new Error('no sound');
    if (what === 'all') return buf;
    const sep = await separateVoice(buf, strength, true, setPct);
    return what === 'voice' ? sep.voice : sep.background;
  };

  const runAll = async () => {
    setRunning(true); setMsg('');
    let ok = 0;
    for (const j of jobs) {
      if (j.status === 'done' && j.note === what) { ok++; continue; }
      patch(j.id, { status: 'working', out: undefined });
      setPct(0);
      try {
        const out = await extractOne(j);
        patch(j.id, { status: 'done', out, dur: out.duration, note: what });
        await saveBuffer(out, `${j.name}${suffix}`, fmt, setPct);
        ok++;
      } catch (e: any) {
        patch(j.id, { status: 'error', note: /no sound|decode|Unable/i.test(String(e?.message ?? e)) ? 'This file has no sound track the browser can read.' : String(e?.message ?? e) });
      }
    }
    setRunning(false);
    if (ok) setMsg(`${ok} file${ok > 1 ? 's' : ''} saved to your Downloads folder.`);
  };

  return (
    <div className="tool-page">
      <div className="tool-main card">
        <h3 className="tool-title">🎵 Extract audio</h3>
        <div className="drop-big" onDragOver={(e) => e.preventDefault()} onDrop={(e) => { e.preventDefault(); addFiles(e.dataTransfer.files); }} onClick={() => fileRef.current?.click()}>
          Drop videos here (several at once is fine) — or click to choose. Nothing is uploaded; it all happens on this computer.
        </div>
        <input ref={fileRef} type="file" multiple accept="video/*,audio/*" hidden onChange={(e) => { if (e.target.files) addFiles(e.target.files); e.target.value = ''; }} />
        {!!usable.length && (
          <select value="" onChange={(e) => addMedia(e.target.value)} style={{ width: 'auto', marginTop: 8 }} aria-label="Add a file from the project">
            <option value="">＋ Add a file from this video project…</option>
            {usable.map((m) => <option key={m.id} value={m.id}>{m.kind === 'video' ? '🎬' : '🎵'} {m.name}</option>)}
          </select>
        )}

        {!!jobs.length && (
          <div className="col" style={{ gap: 6, marginTop: 12 }}>
            {jobs.map((j) => (
              <div key={j.id} className="card tight row" style={{ gap: 8 }}>
                <span className="grow small"><b>{j.name}</b>{j.dur ? <span className="muted"> · {secs(j.dur)}</span> : null}
                  {j.status === 'working' && <span className="muted"> · working…</span>}
                  {j.status === 'error' && <span className="bad-text"> · {j.note}</span>}
                </span>
                {j.out && <>
                  <button className="btn small" onClick={() => pl.play(j.id, j.out!)}>{pl.playing === j.id ? '■' : '▶'}</button>
                  <button className="btn small" title="Save again" onClick={() => saveBuffer(j.out!, `${j.name}${j.note === 'voice' ? '-voice-only' : j.note === 'background' ? '-no-voice' : ''}`, fmt)}>⬇</button>
                  <button className="btn small" title="Edit in Sound Studio" onClick={() => onStudio(j.out!, j.name)}>🎚</button>
                  <button className="btn small" title="Add to the video's Voice track" onClick={async () => { await onTimeline(j.out!, j.name); setMsg(`“${j.name}” added to the Voice track.`); }}>＋</button>
                </>}
                {!running && <button className="icon-btn" title="Remove from list" onClick={() => setJobs((js) => js.filter((x) => x.id !== j.id))}>×</button>}
              </div>
            ))}
            {running && <Progress value={pct} />}
            <div className="row">
              <button className="btn primary" disabled={running} onClick={runAll}>⬇ Extract {jobs.length > 1 ? `all ${jobs.length}` : ''} as {fmt === 'wav' ? 'WAV' : 'MP3'}</button>
              {!running && <button className="btn small" onClick={() => setJobs([])}>Clear list</button>}
            </div>
          </div>
        )}
        {msg && <Note>{msg}</Note>}
      </div>

      <aside className="tool-side card">
        <b className="small">What to keep</b>
        <div className="col" style={{ gap: 6, marginTop: 6 }}>
          {([['all', '🔊 Full sound', 'Everything as it is in the video'], ['voice', '🎙 Voice only', 'Removes music and background noise'], ['background', '🎵 Background only', 'Removes the voice (karaoke style)']] as [What, string, string][]).map(([k, l, d]) => (
            <label key={k} className={`voice-card ${what === k ? 'on' : ''}`}>
              <input type="radio" name="what" checked={what === k} onChange={() => setWhat(k)} />
              <span className="grow"><b>{l}</b><br /><span className="small muted">{d}</span></span>
            </label>
          ))}
        </div>
        {what !== 'all' && (
          <div className="row" style={{ gap: 6, marginTop: 8 }}>
            <span className="small muted">Strength</span>
            {([[0.3, 'Gentle'], [0.6, 'Normal'], [1, 'Strong']] as [number, string][]).map(([v, l]) => (
              <button key={l} className={`btn small ${strength === v ? 'primary' : ''}`} onClick={() => setStrength(v)}>{l}</button>
            ))}
          </div>
        )}
        <label className="field small" style={{ marginTop: 12 }}>File type <FmtSelect value={fmt} onChange={setFmt} /></label>
        <p className="small muted" style={{ marginTop: 12 }}>
          Voice separation keeps what sits in the centre of a stereo mix and in the speech range; it works best when the voice is louder than the music.
          Use <b>🎚</b> on a result to clean it further (bass, treble, loudness).
        </p>
      </aside>
    </div>
  );
}
