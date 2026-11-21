import { useEffect, useRef, useState } from 'react';
import type { Store } from '../store';
import type { MarkBox, Scene } from '../types';
import { getVisual, seekVideo } from '../media';
import { renderFrame, type Runtime } from '../render/engine';
import { dims } from '../export/exporter';
import { uid } from '../util';

/** Crop edges and mark watermark / logo areas on the clip's own frame. */
export function FramePicker({ store, sceneId, onClose }: { store: Store; sceneId: string; onClose: () => void }) {
  const { project: p, update } = store;
  const s = p.scenes.find((x) => x.id === sceneId)!;
  const mediaId = s.mediaIds[0];
  const src = useRef<HTMLCanvasElement>(null);
  const out = useRef<HTMLCanvasElement>(null);
  const [ready, setReady] = useState(false);
  const [selBox, setSelBox] = useState<string | null>(null);
  const [draft, setDraft] = useState<{ x: number; y: number; w: number; h: number } | null>(null);
  const crop = s.crop ?? { l: 0, r: 0, t: 0, b: 0 };
  const marks = s.marks ?? [];
  const set = (patch: Partial<Scene>, key?: string) => update((c) => ({ ...c, scenes: c.scenes.map((x) => (x.id === s.id ? { ...x, ...patch } : x)) }), key ? `${s.id}-${key}` : undefined);

  useEffect(() => { (async () => { const m = p.media.find((x) => x.id === mediaId); if (m?.kind === 'video') await seekVideo(mediaId, (s.clipIn ?? 0) + 0.05); setReady(true); })(); }, [mediaId]); // eslint-disable-line

  // draw source frame with crop shading and boxes
  useEffect(() => {
    const c = src.current, vis = getVisual(mediaId);
    if (!c || !vis || !ready) return;
    const W = c.width, H = Math.round((W * vis.h) / vis.w);
    if (c.height !== H) c.height = H;
    const g = c.getContext('2d')!;
    g.drawImage(vis.src, 0, 0, W, H);
    g.fillStyle = 'rgba(0,0,0,0.6)';
    g.fillRect(0, 0, W * crop.l, H); g.fillRect(W * (1 - crop.r), 0, W * crop.r, H);
    g.fillRect(W * crop.l, 0, W * (1 - crop.l - crop.r), H * crop.t); g.fillRect(W * crop.l, H * (1 - crop.b), W * (1 - crop.l - crop.r), H * crop.b);
    g.strokeStyle = '#a8d5b5'; g.lineWidth = 2;
    g.strokeRect(W * crop.l, H * crop.t, W * (1 - crop.l - crop.r), H * (1 - crop.t - crop.b));
    for (const m of [...marks, ...(draft ? [{ ...draft, id: 'draft', mode: 'fill' as const }] : [])]) {
      g.setLineDash([6, 4]);
      g.strokeStyle = m.id === selBox ? '#f59e0b' : '#dc2626';
      g.lineWidth = 2;
      g.strokeRect(m.x * W, m.y * H, m.w * W, m.h * H);
      g.setLineDash([]);
    }
    // result preview
    const o = out.current;
    if (o) {
      const d = dims(p.aspect, 360);
      if (o.width !== d.w) { o.width = d.w; o.height = d.h; }
      const rt: Runtime = { overflow: new Set(), layers: [], visual: (id) => getVisual(id) };
      const only = { ...p, scenes: [{ ...s, fadeIn: 0, fadeOut: 0, transition: 'cut' as const }], overlays: [], captions: [] };
      renderFrame(o.getContext('2d')!, only, Math.min(0.5, s.duration / 2), d.w, d.h, rt);
    }
  }, [ready, crop.l, crop.r, crop.t, crop.b, marks, draft, selBox, mediaId, p, s]);

  const pos = (e: React.PointerEvent) => {
    const r = src.current!.getBoundingClientRect();
    return { x: Math.min(1, Math.max(0, (e.clientX - r.left) / r.width)), y: Math.min(1, Math.max(0, (e.clientY - r.top) / r.height)) };
  };
  const down = (e: React.PointerEvent) => {
    const a = pos(e);
    const hit = [...marks].reverse().find((m) => a.x >= m.x && a.x <= m.x + m.w && a.y >= m.y && a.y <= m.y + m.h);
    if (hit) { setSelBox(hit.id); return; }
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
    const move = (ev: PointerEvent) => {
      const r = src.current!.getBoundingClientRect();
      const b = { x: Math.min(1, Math.max(0, (ev.clientX - r.left) / r.width)), y: Math.min(1, Math.max(0, (ev.clientY - r.top) / r.height)) };
      setDraft({ x: Math.min(a.x, b.x), y: Math.min(a.y, b.y), w: Math.abs(b.x - a.x), h: Math.abs(b.y - a.y) });
    };
    const up = (ev: PointerEvent) => {
      window.removeEventListener('pointermove', move); window.removeEventListener('pointerup', up);
      const r = src.current!.getBoundingClientRect();
      const b = { x: Math.min(1, Math.max(0, (ev.clientX - r.left) / r.width)), y: Math.min(1, Math.max(0, (ev.clientY - r.top) / r.height)) };
      setDraft(null);
      const box: MarkBox = { id: uid('mk'), x: Math.min(a.x, b.x), y: Math.min(a.y, b.y), w: Math.abs(b.x - a.x), h: Math.abs(b.y - a.y), mode: 'fill' };
      if (box.w > 0.01 && box.h > 0.01) { set({ marks: [...marks, box] }); setSelBox(box.id); }
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
  };
  const cropToShape = () => {
    const vis = getVisual(mediaId);
    if (!vis) return;
    const target = { '16:9': 16 / 9, '9:16': 9 / 16, '1:1': 1, '4:5': 0.8 }[p.aspect];
    const r = vis.w / vis.h;
    if (r > target) { const keep = target / r; set({ crop: { l: (1 - keep) / 2, r: (1 - keep) / 2, t: 0, b: 0 }, fit: 'fill' }); }
    else { const keep = r / target; set({ crop: { l: 0, r: 0, t: (1 - keep) / 2, b: (1 - keep) / 2 }, fit: 'fill' }); }
  };
  const box = marks.find((m) => m.id === selBox);

  return (
    <div className="modal-bg" onClick={onClose}>
      <div className="modal wide" onClick={(e) => e.stopPropagation()}>
        <div className="row" style={{ justifyContent: 'space-between' }}>
          <h3 style={{ margin: 0 }}>Crop & remove watermark</h3>
          <button className="icon-btn" onClick={onClose}>×</button>
        </div>
        <div className="picker-grid">
          <div>
            <canvas ref={src} width={640} height={360} className="frame" onPointerDown={down} />
            <p className="small muted">Drag on the picture to mark a watermark or logo. Click a box to change or delete it. The green frame is what stays after cropping.</p>
          </div>
          <div className="col" style={{ gap: 8 }}>
            <span className="small muted">Result</span>
            <canvas ref={out} className="frame" style={{ maxHeight: 260, objectFit: 'contain' }} />
          </div>
        </div>
        <div className="grid g2" style={{ marginTop: 10 }}>
          <div className="card tight">
            <b className="small">Crop edges</b>
            {(['l', 'r', 't', 'b'] as const).map((k) => (
              <label key={k} className="field">{{ l: 'Left', r: 'Right', t: 'Top', b: 'Bottom' }[k]}: {Math.round(crop[k] * 100)}%
                <input type="range" min={0} max={0.45} step={0.005} value={crop[k]} onChange={(e) => set({ crop: { ...crop, [k]: +e.target.value } }, 'crop' + k)} />
              </label>
            ))}
            <div className="row">
              <button className="btn small" onClick={cropToShape}>Crop to {p.aspect} shape</button>
              <button className="btn small" onClick={() => set({ crop: undefined })}>No crop</button>
            </div>
          </div>
          <div className="card tight">
            <b className="small">Watermark / logo areas <span className="tag">{marks.length}</span></b>
            {box ? (
              <div className="col" style={{ gap: 6, marginTop: 6 }}>
                <label className="field">How to hide it
                  <select value={box.mode} onChange={(e) => set({ marks: marks.map((m) => (m.id === box.id ? { ...m, mode: e.target.value as MarkBox['mode'] } : m)) })}>
                    <option value="fill">Remove — fill from surroundings</option><option value="blur">Blur it</option>
                  </select>
                </label>
                {(['x', 'y', 'w', 'h'] as const).map((k) => (
                  <label key={k} className="field">{{ x: 'Left edge', y: 'Top edge', w: 'Width', h: 'Height' }[k]}: {Math.round(box[k] * 100)}%
                    <input type="range" min={0} max={1} step={0.002} value={box[k]} onChange={(e) => set({ marks: marks.map((m) => (m.id === box.id ? { ...m, [k]: +e.target.value } : m)) }, 'mk' + k)} />
                  </label>
                ))}
                <button className="btn small" onClick={() => { set({ marks: marks.filter((m) => m.id !== box.id) }); setSelBox(null); }}>Delete this box</button>
              </div>
            ) : <p className="small muted">No box selected. Drag on the picture to add one.</p>}
            {marks.length > 0 && <button className="btn small" style={{ marginTop: 6 }} onClick={() => update((c) => ({ ...c, scenes: c.scenes.map((x) => (x.mediaIds[0] === mediaId ? { ...x, marks: structuredClone(marks), crop: s.crop } : x)) }))}>Apply to all clips from this file</button>}
            <p className="small muted">Works best on small, still logos in a corner. Moving watermarks need a box covering their whole path.</p>
          </div>
        </div>
        <div className="row" style={{ justifyContent: 'flex-end', marginTop: 10 }}><button className="btn primary" onClick={onClose}>Done</button></div>
      </div>
    </div>
  );
}
