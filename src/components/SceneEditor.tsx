import { useRef, useState } from 'react';
import type { Store } from '../store';
import type { ListEntry, MediaRole, Scene, SceneKind, SceneTexts, TransitionKind } from '../types';
import { SCENE_LABELS, TRANSITION_LABELS } from '../presets';
import { MediaPicker, Note } from './common';
import { uid } from '../util';

export function SceneEditor({ store, sceneId, warn, onSelect, addFiles }: {
  store: Store; sceneId: string; warn: boolean; onSelect: (id: string | null) => void;
  addFiles: (f: { blob: Blob; name: string; role?: MediaRole }[]) => Promise<string[]>;
}) {
  const { project: p, update } = store;
  const idx = p.scenes.findIndex((s) => s.id === sceneId);
  const s = p.scenes[idx];
  const [rec, setRec] = useState<MediaRecorder | null>(null);
  const [recErr, setRecErr] = useState('');
  const chunks = useRef<Blob[]>([]);
  if (!s) return <p className="muted small">Click a scene in the timeline to edit it.</p>;

  const set = (patch: Partial<Scene>, key?: string) => update((cur) => ({ ...cur, scenes: cur.scenes.map((x) => (x.id === s.id ? { ...x, ...patch } : x)) }), key ? `${s.id}-${key}` : undefined);
  const setT = (patch: Partial<SceneTexts>, key: string) => set({ texts: { ...s.texts, ...patch } }, key);
  const setEntries = (entries: ListEntry[]) => set({ entries }, 'entries');
  const first = p.media.find((m) => m.id === s.mediaIds[0]);
  const maxMedia = s.kind === 'montage' ? 8 : s.kind === 'headline' ? 4 : s.kind === 'steps' && s.mode === 'compare' ? 2 : s.kind === 'cta' ? 1 : 1;

  const startRec = async () => {
    setRecErr('');
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true } });
      const r = new MediaRecorder(stream);
      chunks.current = [];
      r.ondataavailable = (e) => e.data.size && chunks.current.push(e.data);
      r.onstop = async () => {
        stream.getTracks().forEach((t) => t.stop());
        const blob = new Blob(chunks.current, { type: r.mimeType || 'audio/webm' });
        const [id] = await addFiles([{ blob, name: `voice-scene-${idx + 1}.${blob.type.includes('mp4') ? 'm4a' : 'webm'}`, role: 'voice' }]);
        if (id) update((cur) => ({ ...cur, scenes: cur.scenes.map((x) => (x.id === s.id ? { ...x, voiceId: id } : x)) }));
        setRec(null);
      };
      r.start();
      setRec(r);
    } catch (e: any) { setRecErr(`Microphone not available: ${e?.message ?? e}`); }
  };

  const moveScene = (d: number) => update((cur) => {
    const sc = [...cur.scenes];
    const j = idx + d;
    if (j < 0 || j >= sc.length) return cur;
    [sc[idx], sc[j]] = [sc[j], sc[idx]];
    return { ...cur, scenes: sc };
  });

  return (
    <div className="col" style={{ gap: 10 }}>
      <div className="row" style={{ justifyContent: 'space-between' }}>
        <h3 style={{ margin: 0 }}>Scene {idx + 1}</h3>
        <div className="row" style={{ gap: 2 }}>
          <button className="icon-btn" title="Move earlier" onClick={() => moveScene(-1)}>←</button>
          <button className="icon-btn" title="Move later" onClick={() => moveScene(1)}>→</button>
          <button className="icon-btn" title="Duplicate (Ctrl+D)" onClick={() => update((cur) => { const sc = [...cur.scenes]; const copy = { ...structuredClone(s), id: uid('s') }; sc.splice(idx + 1, 0, copy); return { ...cur, scenes: sc }; })}>⧉</button>
          <button className="icon-btn" title="Delete (Del)" onClick={() => { update((cur) => ({ ...cur, scenes: cur.scenes.filter((x) => x.id !== s.id) })); onSelect(null); }}>🗑</button>
        </div>
      </div>
      {warn && <Note kind="warn">Some text here is too long and was shrunk a lot. Try fewer words.</Note>}
      <div className="grid g2">
        <label className="field">Type
          <select value={s.kind} onChange={(e) => set({ kind: e.target.value as SceneKind })}>
            {Object.entries(SCENE_LABELS).map(([k, l]) => <option key={k} value={k}>{l}</option>)}
          </select>
        </label>
        <label className="field">Length (s)
          <input type="number" min={0.8} max={60} step={0.1} value={Math.round(s.duration * 100) / 100} onChange={(e) => set({ duration: Math.max(0.8, +e.target.value || 1) }, 'dur')} />
        </label>
      </div>
      <label className="field">Transition to next
        <select value={s.transition} onChange={(e) => set({ transition: e.target.value as TransitionKind })}>
          {Object.entries(TRANSITION_LABELS).map(([k, l]) => <option key={k} value={k}>{l}</option>)}
        </select>
      </label>

      {(s.kind === 'hook' || s.kind === 'headline') && (
        <label className="field">Text lines (*word* = accent colour)
          <textarea rows={3} value={(s.texts.lines ?? []).join('\n')} onChange={(e) => setT({ lines: e.target.value.split('\n') }, 'lines')} />
        </label>
      )}
      {s.kind === 'item' && (
        <>
          <label className="field">Title<input type="text" value={s.texts.title ?? ''} onChange={(e) => setT({ title: e.target.value }, 'title')} /></label>
          <label className="field">Subtitle<input type="text" value={s.texts.subtitle ?? ''} onChange={(e) => setT({ subtitle: e.target.value }, 'sub')} /></label>
          <div className="grid g2">
            <label className="field">Highlight<input type="text" value={s.texts.highlight ?? ''} onChange={(e) => setT({ highlight: e.target.value }, 'hl')} /></label>
            <label className="field">Badge<input type="text" value={s.texts.badge ?? ''} list="badges" onChange={(e) => setT({ badge: e.target.value }, 'badge')} /></label>
          </div>
        </>
      )}
      {s.kind === 'speaker' && (
        <>
          <label className="field">Key words (comma separated)<input type="text" value={s.texts.words ?? ''} onChange={(e) => setT({ words: e.target.value }, 'words')} /></label>
          <div className="grid g2">
            <label className="field">Name<input type="text" value={s.texts.name ?? ''} onChange={(e) => setT({ name: e.target.value }, 'name')} /></label>
            <label className="field">Role<input type="text" value={s.texts.role ?? ''} onChange={(e) => setT({ role: e.target.value }, 'role')} /></label>
          </div>
          <label className="row small"><input type="checkbox" checked={!!s.useClipAudio} onChange={(e) => set({ useClipAudio: e.target.checked })} /> Use the speaker’s sound</label>
        </>
      )}
      {(s.kind === 'montage' || s.kind === 'moment') && (
        <label className="field">Caption (optional)<input type="text" value={s.texts.caption ?? ''} onChange={(e) => setT({ caption: e.target.value }, 'cap')} /></label>
      )}
      {(s.kind === 'steps' || s.kind === 'stat') && (
        <>
          {s.kind === 'steps' && (
            <label className="field">Layout
              <select value={s.mode ?? 'steps'} onChange={(e) => set({ mode: e.target.value as any })}>
                <option value="steps">Numbered steps</option><option value="compare">Before / after</option>
              </select>
            </label>
          )}
          <label className="field">Heading<input type="text" value={s.texts.title ?? ''} onChange={(e) => setT({ title: e.target.value }, 'title')} /></label>
          <div className="col">
            <span className="small muted">{s.kind === 'stat' ? 'Numbers (up to 3)' : s.mode === 'compare' ? 'Labels (first = before, second = after)' : 'Steps'}</span>
            {(s.entries ?? []).map((en, i) => (
              <div className="row" key={i} style={{ flexWrap: 'nowrap' }}>
                <input type="text" value={en.label} placeholder="Label" onChange={(e) => setEntries((s.entries ?? []).map((x, j) => (j === i ? { ...x, label: e.target.value } : x)))} />
                <input type="text" value={en.value} placeholder={s.kind === 'stat' ? '1,200+' : 'Detail'} style={{ maxWidth: 110 }} onChange={(e) => setEntries((s.entries ?? []).map((x, j) => (j === i ? { ...x, value: e.target.value } : x)))} />
                <button className="icon-btn" onClick={() => setEntries((s.entries ?? []).filter((_, j) => j !== i))}>×</button>
              </div>
            ))}
            <button className="btn small" disabled={s.kind === 'stat' && (s.entries?.length ?? 0) >= 3} onClick={() => setEntries([...(s.entries ?? []), { label: '', value: '' }])}>＋ Add</button>
          </div>
        </>
      )}
      {s.kind === 'cta' && (
        <>
          <label className="field">Title (empty = from step 4)<input type="text" value={s.texts.title ?? ''} placeholder={p.cta.title} onChange={(e) => setT({ title: e.target.value || undefined }, 'title')} /></label>
          <p className="small muted">Logo, website, QR code and cut-out are set in step 4 → Ending.</p>
        </>
      )}
      {p.lang2 && s.kind !== 'montage' && s.kind !== 'speaker' && (
        <label className="field">Second-language line<input type="text" value={s.texts.second ?? ''} onChange={(e) => setT({ second: e.target.value }, 'second')} /></label>
      )}

      <div className="col">
        <span className="small muted">Media {s.kind === 'montage' ? '(clips in order)' : ''}</span>
        <div className="row">
          {s.mediaIds.map((id, i) => (
            <div key={i} style={{ position: 'relative' }}>
              <MediaPicker media={p.media} value={id} size={48} onChange={(nid) => set({ mediaIds: nid ? s.mediaIds.map((x, j) => (j === i ? nid : x)) : s.mediaIds.filter((_, j) => j !== i) })} filter={(m) => m.kind !== 'audio'} />
            </div>
          ))}
          {s.mediaIds.length < maxMedia && <MediaPicker media={p.media} value={undefined} size={48} allowNone={false} onChange={(nid) => nid && set({ mediaIds: [...s.mediaIds, nid] })} filter={(m) => m.kind !== 'audio'} />}
        </div>
      </div>
      {first?.kind === 'video' && s.kind !== 'montage' && (
        <label className="field">Clip starts at {(s.clipIn ?? 0).toFixed(1)} s
          <input type="range" min={0} max={Math.max(0, first.duration - 0.5)} step={0.1} value={s.clipIn ?? 0} onChange={(e) => set({ clipIn: +e.target.value }, 'clipin')} />
        </label>
      )}

      <div className="col">
        <span className="small muted">Voiceover</span>
        <div className="row">
          {!rec ? <button className="btn small" onClick={startRec}>🎙 Record</button> : <button className="btn small primary" onClick={() => rec.stop()}>■ Stop recording</button>}
          <select value={s.voiceId ?? ''} onChange={(e) => set({ voiceId: e.target.value || undefined })} style={{ width: 'auto', flex: 1 }}>
            <option value="">No voiceover</option>
            {p.media.filter((m) => m.kind === 'audio' && m.status === 'ready').map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
          </select>
        </div>
        {recErr && <Note kind="bad">{recErr}</Note>}
      </div>
    </div>
  );
}
