import { useState } from 'react';
import type { Store } from '../store';
import type { FrameDesign, GridCell, GridLayout, Scene } from '../types';
import { FRAME_DESIGNS, GRID_LAYOUTS, gridFromRange, insertGrid } from '../edit';
import { gridCount, gridRects } from '../render/engine';
import { MediaPicker, Note } from './common';
import { fmtTime } from '../util';

/** Tiny drawing of a layout (and design) for the buttons. */
export function LayoutIcon({ layout, design = 'clean', portrait }: { layout: GridLayout; design?: FrameDesign; portrait?: boolean }) {
  const W = portrait ? 27 : 48, H = portrait ? 48 : 27;
  const rects = gridRects(layout, !!portrait);
  const round = design === 'rounded' || design === 'neon' ? 3 : 0;
  return (
    <span className={`lay-icon d-${design}`} style={{ width: W, height: H }}>
      {rects.map(([x, y, w, h], i) => (
        <i key={i} style={{
          left: `${x * 100}%`, top: `${y * 100}%`, width: `${w * 100}%`, height: `${h * 100}%`,
          borderRadius: design === 'circle' && !(layout.startsWith('pip') && i === 0) ? '50%' : round,
          transform: design === 'tilted' ? `rotate(${i % 2 ? 4 : -4}deg)` : undefined,
          zIndex: i,
        }} />
      ))}
    </span>
  );
}

/** Window to create a split screen (for the marked part, or at the playhead). */
export function GridPicker({ store, time, onClose, onDone }: { store: Store; time: number; onClose: () => void; onDone: (sceneId: string) => void }) {
  const { project: p, update } = store;
  const [layout, setLayout] = useState<GridLayout>('2h');
  const [design, setDesign] = useState<FrameDesign>('rounded');
  const [picks, setPicks] = useState<(string | undefined)[]>([]);
  const hasRange = p.rangeIn !== undefined && p.rangeOut !== undefined && p.rangeOut - p.rangeIn > 0.3;
  const portrait = p.aspect === '9:16' || p.aspect === '4:5';
  const n = gridCount(layout);
  const make = () => {
    const chosen = picks.slice(0, n).filter(Boolean) as string[];
    const r = hasRange ? gridFromRange(p, p.rangeIn!, p.rangeOut!, layout, design, chosen) : insertGrid(p, time, layout, design, chosen);
    update(r.project);
    onDone(r.id);
  };
  return (
    <div className="modal-bg" onClick={onClose}>
      <div className="modal wide" onClick={(e) => e.stopPropagation()}>
        <div className="row" style={{ justifyContent: 'space-between' }}>
          <h3 style={{ margin: 0 }}>▦ Split screen — several videos at once</h3>
          <button className="icon-btn" onClick={onClose}>×</button>
        </div>
        <p className="small muted" style={{ marginTop: 4 }}>
          {hasRange ? <>For the marked part <b>{fmtTime(p.rangeIn!)} – {fmtTime(p.rangeOut!)}</b>. The video already there goes in frame 1.</> : <>Will be added after the clip at the playhead ({fmtTime(time)}). Tip: mark a part with I and O first to turn that part into a split screen.</>}
        </p>
        <b className="small">1. Layout</b>
        <div className="lay-grid">
          {GRID_LAYOUTS.map(([k, l]) => (
            <button key={k} className={`choice tight ${layout === k ? 'on' : ''}`} onClick={() => setLayout(k)}>
              <LayoutIcon layout={k} design={design} portrait={portrait} /><span>{l}</span>
            </button>
          ))}
        </div>
        <b className="small">2. Frame design</b>
        <div className="lay-grid">
          {FRAME_DESIGNS.map(([k, l]) => (
            <button key={k} className={`choice tight ${design === k ? 'on' : ''}`} onClick={() => setDesign(k)}>
              <LayoutIcon layout={layout} design={k} portrait={portrait} /><span>{l}</span>
            </button>
          ))}
        </div>
        <b className="small">3. Video in each frame <span className="muted">(empty frames are filled with your other clips)</span></b>
        <div className="row" style={{ marginTop: 6, gap: 12 }}>
          {Array.from({ length: n }, (_, i) => (
            <div key={i} className="col" style={{ alignItems: 'center', gap: 2 }}>
              <MediaPicker media={p.media} value={picks[i]} size={56} onChange={(id) => setPicks((x) => { const y = [...x]; y[i] = id; return y; })} filter={(m) => m.kind !== 'audio' && m.role !== 'logo'} />
              <span className="small muted">{hasRange && i === 0 && !picks[0] ? 'Frame 1 (current)' : `Frame ${i + 1}`}</span>
            </div>
          ))}
        </div>
        <div className="row" style={{ justifyContent: 'flex-end', marginTop: 14 }}>
          <button className="btn" onClick={onClose}>Cancel</button>
          <button className="btn primary" onClick={make}>▦ Make split screen</button>
        </div>
      </div>
    </div>
  );
}

/** Settings for a selected split-screen scene. */
export function GridSettings({ store, scene }: { store: Store; scene: Scene }) {
  const { project: p, update } = store;
  const [msg, setMsg] = useState('');
  const cells = scene.cells ?? [];
  const layout = scene.layout ?? '2h';
  const n = gridCount(layout);
  const portrait = p.aspect === '9:16' || p.aspect === '4:5';
  const set = (patch: Partial<Scene>, key?: string) => update((c) => ({ ...c, scenes: c.scenes.map((x) => (x.id === scene.id ? { ...x, ...patch } : x)) }), key ? `${scene.id}-${key}` : undefined);
  const setCells = (next: GridCell[], key?: string) => set({ cells: next, mediaIds: next.map((c) => c.mediaId) }, key);
  const setCell = (i: number, patch: Partial<GridCell>, key?: string) => {
    const next = [...cells];
    while (next.length <= i) next.push({ mediaId: '', clipIn: 0 });
    next[i] = { ...next[i], ...patch };
    setCells(next.filter((c, k) => c.mediaId || k < n), key);
  };
  return (
    <div className="col" style={{ gap: 10 }}>
      <h3 style={{ margin: 0 }}>▦ Split screen</h3>
      <div className="lay-grid compact">
        {GRID_LAYOUTS.map(([k, l]) => (
          <button key={k} title={l} className={`choice tight ${layout === k ? 'on' : ''}`} onClick={() => set({ layout: k })}><LayoutIcon layout={k} design={scene.frame} portrait={portrait} /></button>
        ))}
      </div>
      <label className="field">Frame design
        <select value={scene.frame ?? 'clean'} onChange={(e) => set({ frame: e.target.value as FrameDesign, gap: undefined, radius: undefined, border: undefined })}>
          {FRAME_DESIGNS.map(([k, l]) => <option key={k} value={k}>{l}</option>)}
        </select>
      </label>
      {Array.from({ length: n }, (_, i) => {
        const c = cells[i];
        const m = p.media.find((x) => x.id === c?.mediaId);
        return (
          <div key={i} className="card tight">
            <div className="row" style={{ flexWrap: 'nowrap' }}>
              <MediaPicker media={p.media} value={c?.mediaId || undefined} size={48} onChange={(id) => setCell(i, { mediaId: id ?? '', clipIn: 0, sound: false })} filter={(x) => x.kind !== 'audio' && x.role !== 'logo'} />
              <div className="col grow" style={{ gap: 2 }}>
                <b className="small">Frame {i + 1}</b>
                <span className="small muted" style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{m?.name ?? 'Empty — pick a video'}</span>
              </div>
              <button className="icon-btn" title="Move to the previous frame" disabled={i === 0 || !c} onClick={() => { const next = [...cells]; [next[i - 1], next[i]] = [next[i], next[i - 1]]; setCells(next.filter(Boolean)); }}>↑</button>
            </div>
            {m?.kind === 'video' && (
              <>
                <label className="field">Starts at {(c!.clipIn).toFixed(1)} s of {m.duration.toFixed(1)} s
                  <input type="range" min={0} max={Math.max(0, m.duration - 0.3)} step={0.1} value={c!.clipIn} onChange={(e) => setCell(i, { clipIn: +e.target.value }, 'cin' + i)} />
                </label>
                <div className="row">
                  <label className="row small"><input type="checkbox" checked={!!c!.sound} disabled={!m.hasAudio} onChange={(e) => setCell(i, { sound: e.target.checked })} /> Sound{m.hasAudio ? '' : ' (none)'}</label>
                  {c!.sound && <input type="range" min={0} max={2} step={0.05} value={c!.volume ?? 1} onChange={(e) => setCell(i, { volume: +e.target.value }, 'vol' + i)} style={{ width: 90 }} title="Volume" />}
                </div>
              </>
            )}
            {m && (
              <div className="row">
                <select value={c!.fit ?? 'fill'} onChange={(e) => setCell(i, { fit: e.target.value as any })} style={{ width: 'auto' }} className="small">
                  <option value="fill">Fill frame</option><option value="fit">Show whole</option>
                </select>
                <label className="row small">Zoom <input type="range" min={1} max={2.5} step={0.05} value={c!.zoom ?? 1.02} onChange={(e) => setCell(i, { zoom: +e.target.value }, 'z' + i)} style={{ width: 80 }} /></label>
              </div>
            )}
          </div>
        );
      })}
      <div className="grid g2">
        <label className="field">Gap between frames: {scene.gap === undefined ? 'auto' : scene.gap.toFixed(1)}
          <input type="range" min={0} max={8} step={0.2} value={scene.gap ?? 2} onChange={(e) => set({ gap: +e.target.value }, 'gap')} />
        </label>
        <label className="field">Rounded corners: {scene.radius === undefined ? 'auto' : scene.radius.toFixed(1)}
          <input type="range" min={0} max={10} step={0.2} value={scene.radius ?? 0} onChange={(e) => set({ radius: +e.target.value }, 'rad')} />
        </label>
      </div>
      <div className="row">
        <span className="small muted">Border / background colour</span>
        <input type="color" value={scene.border || '#ffffff'} onChange={(e) => set({ border: e.target.value }, 'bd')} style={{ width: 40, height: 28, border: '1px solid var(--line)', borderRadius: 6 }} />
        {scene.border !== undefined && <button className="btn small" onClick={() => set({ border: undefined })}>Default</button>}
      </div>
      <button className="btn small" onClick={() => { const mv = cells.map((c) => p.media.find((m) => m.id === c.mediaId)).filter((m) => m?.kind === 'video').map((m, k) => m!.duration - (cells[k]?.clipIn ?? 0)); if (mv.length) { set({ duration: Math.round(Math.min(...mv) * 100) / 100 }); setMsg('Length set to the shortest video, so no frame repeats.'); } }}>Fit length to the shortest video</button>
      {msg && <Note>{msg}</Note>}
      <p className="small muted">Text, logos and music on the other tracks play over the split screen as usual. Speed, fades and colour look below apply to all frames.</p>
    </div>
  );
}
