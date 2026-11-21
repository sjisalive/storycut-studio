import { useCallback, useEffect, useRef, useState } from 'react';
import type { Store } from '../store';
import type { CaptionStyle, MediaRole, SceneKind } from '../types';
import { assignTransitions, newScene, shuffleStyle } from '../assemble';
import { SCENE_LABELS } from '../presets';
import { timeline } from '../render/engine';
import { autoCaptions, captionsFromScenes, type WhisperSize } from '../audio/captions';
import { fmtTime, uid } from '../util';
import { Player, type PlayerHandle } from './Player';
import { Timeline } from './Timeline';
import { SceneEditor } from './SceneEditor';
import { More, Note, PageHead, Progress } from './common';

export function StepPreview({ store, onRebuild, addFiles }: {
  store: Store; onRebuild: () => void;
  addFiles: (f: { blob: Blob; name: string; role?: MediaRole }[]) => Promise<string[]>;
}) {
  const { project: p, update } = store;
  const player = useRef<PlayerHandle>(null);
  const [time, setTime] = useState(0);
  const [sel, setSel] = useState<string | null>(p.scenes[0]?.id ?? null);
  const [warnings, setWarnings] = useState<Set<string>>(new Set());
  const [capMsg, setCapMsg] = useState('');
  const [capPct, setCapPct] = useState<number | undefined>();
  const [capBusy, setCapBusy] = useState(false);
  const [model, setModel] = useState<WhisperSize>('base');
  const { starts, total } = timeline(p);
  const onTime = useCallback((t: number) => setTime(t), []);
  const onWarnings = useCallback((w: Set<string>) => setWarnings(w), []);

  // follow the playhead with the selection
  useEffect(() => {
    const i = starts.findIndex((s, k) => time >= s && time < s + p.scenes[k].duration);
    if (i >= 0 && document.activeElement?.closest('.side') == null) setSel(p.scenes[i].id);
  }, [Math.floor(time * 4)]); // eslint-disable-line

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement)?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;
      const idx = p.scenes.findIndex((s) => s.id === sel);
      if (e.code === 'Space') { e.preventDefault(); player.current?.toggle(); }
      else if (e.key === 'ArrowRight') { e.preventDefault(); player.current?.step(e.shiftKey ? 5 : 1); }
      else if (e.key === 'ArrowLeft') { e.preventDefault(); player.current?.step(e.shiftKey ? -5 : -1); }
      else if (e.key === 'Home') player.current?.seek(0);
      else if ((e.key === 'Delete' || e.key === 'Backspace') && sel) { update((c) => ({ ...c, scenes: c.scenes.filter((s) => s.id !== sel) })); setSel(null); }
      else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'd' && idx >= 0) {
        e.preventDefault();
        update((c) => { const sc = [...c.scenes]; sc.splice(idx + 1, 0, { ...structuredClone(sc[idx]), id: uid('s') }); return { ...c, scenes: sc }; });
      } else if (e.key === ']' && idx < p.scenes.length - 1) { setSel(p.scenes[idx + 1].id); player.current?.seek(starts[idx + 1] + 0.01); }
      else if (e.key === '[' && idx > 0) { setSel(p.scenes[idx - 1].id); player.current?.seek(starts[idx - 1] + 0.01); }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [p, sel, starts, update]);

  const addScene = (kind: SceneKind) => {
    const idx = p.scenes.findIndex((s) => s.id === sel);
    const sc = newScene(kind);
    update((c) => { const list = [...c.scenes]; list.splice(idx >= 0 ? idx + 1 : list.length, 0, sc); return { ...c, scenes: list }; });
    setSel(sc.id);
  };

  const runAutoCaptions = async () => {
    setCapBusy(true);
    try {
      const caps = await autoCaptions(p, model, (m, pct) => { setCapMsg(m); setCapPct(pct); });
      update({ captions: caps, captionStyle: p.captionStyle === 'off' ? 'word' : p.captionStyle });
      setCapMsg(`${caps.length} caption lines added. Check the spelling below.`);
    } catch (e: any) {
      setCapMsg(`${e?.message ?? e}`);
    } finally { setCapBusy(false); setCapPct(undefined); }
  };

  return (
    <>
      <PageHead title="Preview and adjust" sub="Play it, click any scene to change it, drag scenes to reorder. Space plays, ← → jumps, Ctrl+Z undoes." />
      {!p.scenes.length && <Note>No scenes yet. Press “Make my video” below.</Note>}
      <div className="row" style={{ marginBottom: 10 }}>
        <button className="btn" onClick={onRebuild} title="Build again from the content list">↻ Make again</button>
        <button className="btn" onClick={() => { const style = shuffleStyle(p); update((c) => { const scenes = structuredClone(c.scenes); assignTransitions(scenes, style); return { ...c, style, scenes }; }); }}>🎲 Shuffle style</button>
        <select className="btn" value="" onChange={(e) => e.target.value && addScene(e.target.value as SceneKind)} style={{ width: 'auto' }}>
          <option value="">＋ Add scene…</option>
          {Object.entries(SCENE_LABELS).map(([k, l]) => <option key={k} value={k}>{l}</option>)}
        </select>
        <span className="grow" />
        <span className="small muted">{p.scenes.length} scenes · {fmtTime(total)} (target {p.targetLength} s) · {p.style.name}</span>
        {warnings.size > 0 && <span className="tag warn">⚠ {warnings.size} scene(s) with long text</span>}
      </div>
      <div className="studio">
        <div>
          <Player ref={player} project={p} onTime={onTime} onWarnings={onWarnings} />
          <Timeline
            project={p} time={time} selected={sel} warnings={warnings}
            onSelect={setSel} onSeek={(t) => player.current?.seek(t)}
            onMove={(from, to) => update((c) => { const sc = [...c.scenes]; const [x] = sc.splice(from, 1); sc.splice(to, 0, x); return { ...c, scenes: sc }; })}
            onResize={(id, d) => update((c) => ({ ...c, scenes: c.scenes.map((s) => (s.id === id ? { ...s, duration: d } : s)) }), 'resize-' + id)}
          />
          <div className="card" style={{ marginTop: 16 }}>
            <div className="row" style={{ justifyContent: 'space-between' }}>
              <h3 style={{ margin: 0 }}>Captions</h3>
              <label className="row small">Style
                <select value={p.captionStyle} onChange={(e) => update({ captionStyle: e.target.value as CaptionStyle })} style={{ width: 'auto' }}>
                  <option value="off">Off</option><option value="line">Simple line</option><option value="word">Word-by-word colour</option><option value="box">Word-by-word box</option>
                </select>
              </label>
            </div>
            <div className="row" style={{ marginTop: 10 }}>
              <button className="btn small" disabled={capBusy} onClick={runAutoCaptions}>🗣 Auto captions from speech</button>
              <select value={model} onChange={(e) => setModel(e.target.value as WhisperSize)} style={{ width: 'auto' }} className="small">
                <option value="base">Fast (base model, ~80 MB)</option><option value="small">Better (small model, ~250 MB)</option>
              </select>
              <button className="btn small" onClick={() => update({ captions: captionsFromScenes(p), captionStyle: p.captionStyle === 'off' ? 'line' : p.captionStyle })}>Use on-screen text</button>
              {p.captions.length > 0 && <button className="btn small" onClick={() => update({ captions: [] })}>Clear</button>}
            </div>
            {capMsg && <Note>{capMsg}</Note>}
            {capPct !== undefined && <Progress value={capPct} />}
            <p className="small muted">Speech captions use Whisper running inside this browser. The model downloads once (needs internet), your audio stays here.</p>
            {p.captions.length > 0 && (
              <More label={`Edit ${p.captions.length} caption lines`}>
                <div className="list">
                  {p.captions.map((c) => (
                    <div className="li" key={c.id}>
                      <button className="btn small" onClick={() => player.current?.seek(c.start)}>{fmtTime(c.start)}</button>
                      <input type="text" value={c.text} onChange={(e) => update((cur) => ({ ...cur, captions: cur.captions.map((x) => (x.id === c.id ? { ...x, text: e.target.value, words: undefined } : x)) }), 'cap-' + c.id)} />
                      <button className="icon-btn" onClick={() => update((cur) => ({ ...cur, captions: cur.captions.filter((x) => x.id !== c.id) }))}>×</button>
                    </div>
                  ))}
                </div>
              </More>
            )}
          </div>
        </div>
        <aside className="card side">
          {sel ? <SceneEditor store={store} sceneId={sel} warn={warnings.has(sel)} onSelect={setSel} addFiles={addFiles} /> : <p className="muted small">Click a scene in the timeline to edit it.</p>}
          <More label="Keyboard shortcuts">
            <div className="small muted col">
              <span><span className="kbd">Space</span> play / pause</span>
              <span><span className="kbd">←</span> <span className="kbd">→</span> 1 s (Shift = 5 s)</span>
              <span><span className="kbd">[</span> <span className="kbd">]</span> previous / next scene</span>
              <span><span className="kbd">Ctrl Z</span> undo · <span className="kbd">Ctrl Shift Z</span> redo</span>
              <span><span className="kbd">Ctrl D</span> duplicate · <span className="kbd">Del</span> delete scene</span>
            </div>
          </More>
        </aside>
      </div>
    </>
  );
}
