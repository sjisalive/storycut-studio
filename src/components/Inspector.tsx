import type { Store } from '../store';
import type { AudioItem, ClipLook, LookPreset, MediaRole, Overlay, Scene } from '../types';
import { detachAudio, itemEnd, joinNext } from '../edit';
import { timeline } from '../render/engine';
import { SceneEditor } from './SceneEditor';
import { FONTS } from '../presets';
import { More, Note } from './common';
import type { Sel } from './MultiTimeline';
import { useState } from 'react';
import { FramePicker } from './FramePicker';
import { GridSettings } from './GridPanel';

const LOOKS: [LookPreset, string][] = [['none', 'Original'], ['vivid', 'Vivid'], ['warm', 'Warm'], ['cool', 'Cool'], ['bw', 'Black & white'], ['vintage', 'Vintage'], ['fade', 'Soft fade']];
const SPEEDS = [0.25, 0.5, 0.75, 1, 1.25, 1.5, 2, 3, 4];

export function Inspector({ store, sel, setSel, warnings, addFiles, onSeparate }: {
  store: Store; sel: Sel; setSel: (s: Sel) => void; warnings: Set<string>;
  addFiles: (f: { blob: Blob; name: string; role?: MediaRole }[]) => Promise<string[]>;
  onSeparate?: (mediaId: string, sceneId?: string) => void;
}) {
  const { project: p } = store;
  if (sel?.kind === 'scene' && p.scenes.some((s) => s.id === sel.id)) {
    return (
      <div className="col" style={{ gap: 12 }}>
        {p.scenes.find((s) => s.id === sel.id)?.kind === 'grid' && <GridSettings store={store} scene={p.scenes.find((s) => s.id === sel.id)!} />}
        <ClipSettings store={store} sceneId={sel.id} onSeparate={onSeparate} />
        <More label="Scene text & layout" open={p.scenes.find((s) => s.id === sel.id)?.kind !== 'moment'}>
          <SceneEditor store={store} sceneId={sel.id} warn={warnings.has(sel.id)} onSelect={(id) => setSel(id ? { kind: 'scene', id } : null)} addFiles={addFiles} />
        </More>
      </div>
    );
  }
  if (sel?.kind === 'overlay') {
    const o = p.overlays.find((x) => x.id === sel.id);
    if (o) return <OverlayEditor store={store} o={o} onDone={() => setSel(null)} />;
  }
  if (sel?.kind === 'audio') {
    const a = p.audio.find((x) => x.id === sel.id);
    if (a) return <AudioEditor store={store} a={a} onDone={() => setSel(null)} />;
  }
  const { total } = timeline(p);
  return (
    <div className="col small muted" style={{ gap: 8 }}>
      <h3 style={{ color: 'var(--text)' }}>Nothing selected</h3>
      <span>Click a clip, text or sound on the timeline to change it here.</span>
      <span>{p.scenes.length} clips/scenes · {p.overlays.length} texts · {p.audio.length} sounds · {total.toFixed(1)} s</span>
      <More label="Keyboard shortcuts" open>
        <div className="col">
          <span><span className="kbd">Space</span> play / pause</span>
          <span><span className="kbd">S</span> split at playhead</span>
          <span><span className="kbd">I</span> <span className="kbd">O</span> mark part start / end · <span className="kbd">Shift Del</span> delete the part</span>
          <span><span className="kbd">Del</span> delete selected · <span className="kbd">Ctrl D</span> duplicate</span>
          <span><span className="kbd">←</span> <span className="kbd">→</span> 1 frame (Shift = 1 s)</span>
          <span><span className="kbd">+</span> <span className="kbd">−</span> zoom timeline · <span className="kbd">Ctrl Z</span> undo</span>
          <span>Shift + drag on the time ruler selects a part.</span>
        </div>
      </More>
    </div>
  );
}

function ClipSettings({ store, sceneId, onSeparate }: { store: Store; sceneId: string; onSeparate?: (mediaId: string, sceneId?: string) => void }) {
  const { project: p, update } = store;
  const [msg, setMsg] = useState('');
  const [picker, setPicker] = useState(false);
  const s = p.scenes.find((x) => x.id === sceneId)!;
  const i = p.scenes.indexOf(s);
  const m = p.media.find((x) => x.id === s.mediaIds[0]);
  const set = (patch: Partial<Scene>, key?: string) => update((c) => ({ ...c, scenes: c.scenes.map((x) => (x.id === s.id ? { ...x, ...patch } : x)) }), key ? `${s.id}-${key}` : undefined);
  const look: ClipLook = s.look ?? { brightness: 1, contrast: 1, saturation: 1, preset: 'none' };
  const setLook = (patch: Partial<ClipLook>, key: string) => set({ look: { ...look, ...patch } }, key);
  const isGrid = s.kind === 'grid';
  const isVideo = isGrid ? (s.cells ?? []).some((c) => p.media.find((x) => x.id === c.mediaId)?.kind === 'video') : m?.kind === 'video';
  return (
    <div className="col" style={{ gap: 10 }}>
      <div className="row" style={{ justifyContent: 'space-between' }}>
        <h3 style={{ margin: 0 }}>{isGrid ? 'Timing & look' : `Clip ${i + 1}`}</h3>
        <span className="small muted" style={{ maxWidth: 160, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{m?.name ?? s.kind}</span>
      </div>
      <div className="grid g2">
        <label className="field">Length (s)
          <input type="number" min={0.3} step={0.1} value={Math.round(s.duration * 100) / 100} onChange={(e) => set({ duration: Math.max(0.3, +e.target.value || 0.3) }, 'dur')} />
        </label>
        {isVideo && !isGrid ? (
          <label className="field">Starts at (s)
            <input type="number" min={0} step={0.1} value={Math.round((s.clipIn ?? 0) * 100) / 100} onChange={(e) => set({ clipIn: Math.max(0, Math.min(+e.target.value || 0, (m!.duration || 1) - 0.2)) }, 'in')} />
          </label>
        ) : <span />}
      </div>
      {isVideo && (
        <>
          <label className="field">Speed: {s.speed ?? 1}×
            <select value={s.speed ?? 1} onChange={(e) => { const sp = +e.target.value; const src = s.duration * (s.speed ?? 1); set({ speed: sp, duration: Math.round((src / sp) * 100) / 100 }); }}>
              {SPEEDS.map((v) => <option key={v} value={v}>{v === 1 ? 'Normal (1×)' : `${v}×${v < 1 ? ' slow motion' : ' fast'}`}</option>)}
            </select>
          </label>
          {!isGrid && <div className="row">
            <label className="row small"><input type="checkbox" checked={!!s.useClipAudio && !s.muted} disabled={!m?.hasAudio} onChange={(e) => set({ useClipAudio: e.target.checked, muted: !e.target.checked })} /> Clip sound {m?.hasAudio ? '' : '(none)'}</label>
            <label className="row small"><input type="checkbox" checked={!!s.duck} onChange={(e) => set({ duck: e.target.checked })} /> Dip music under it</label>
          </div>}
          {isGrid && <label className="row small"><input type="checkbox" checked={!s.muted} onChange={(e) => set({ muted: !e.target.checked })} /> Play frame sound (choose which frames above)</label>}
          {!isGrid && s.useClipAudio && !s.muted && (
            <label className="field">Clip volume: {Math.round((s.volume ?? 1) * 100)}%
              <input type="range" min={0} max={2} step={0.05} value={s.volume ?? 1} onChange={(e) => set({ volume: +e.target.value }, 'vol')} />
            </label>
          )}
        </>
      )}
      <div className="grid g2">
        <label className="field">Fade in (s)<input type="number" min={0} max={5} step={0.1} value={s.fadeIn ?? 0} onChange={(e) => set({ fadeIn: Math.max(0, +e.target.value) }, 'fi')} /></label>
        <label className="field">Fade out (s)<input type="number" min={0} max={5} step={0.1} value={s.fadeOut ?? 0} onChange={(e) => set({ fadeOut: Math.max(0, +e.target.value) }, 'fo')} /></label>
      </div>
      {!isGrid && <><div className="grid g2">
        <label className="field">Frame
          <select value={s.fit ?? 'fill'} onChange={(e) => set({ fit: e.target.value as any })}>
            <option value="fill">Fill (crop edges)</option><option value="fit">Fit whole picture</option>
          </select>
        </label>
        <label className="field">Rotate
          <select value={s.rotate ?? 0} onChange={(e) => set({ rotate: +e.target.value as any })}>
            <option value={0}>0°</option><option value={90}>90°</option><option value={180}>180°</option><option value={270}>270°</option>
          </select>
        </label>
      </div>
      {m && m.kind !== 'audio' && (
        <button className="btn small" onClick={() => setPicker(true)}>✂ Crop / 🧽 Remove watermark{s.crop || s.marks?.length ? ` (${[s.crop ? 'cropped' : '', s.marks?.length ? s.marks.length + ' box' : ''].filter(Boolean).join(', ')})` : ''}</button>
      )}
      {picker && <FramePicker store={store} sceneId={s.id} onClose={() => setPicker(false)} />}
      <label className="row small"><input type="checkbox" checked={!!s.flip} onChange={(e) => set({ flip: e.target.checked })} /> Mirror (flip left–right)</label></>}
      <label className="field">Colour look
        <select value={look.preset} onChange={(e) => setLook({ preset: e.target.value as LookPreset }, 'lookp')}>
          {LOOKS.map(([k, l]) => <option key={k} value={k}>{l}</option>)}
        </select>
      </label>
      <More label="Brightness / contrast / colour">
        {(['brightness', 'contrast', 'saturation'] as const).map((k) => (
          <label key={k} className="field">{k[0].toUpperCase() + k.slice(1)}: {Math.round(look[k] * 100)}%
            <input type="range" min={0.3} max={1.8} step={0.02} value={look[k]} onChange={(e) => setLook({ [k]: +e.target.value }, k)} />
          </label>
        ))}
        <button className="btn small" onClick={() => set({ look: undefined })}>Reset colours</button>
      </More>
      {!isGrid && <div className="row">
        <button className="btn small" onClick={() => { const q = joinNext(p, s.id); if (q) update(q); else setMsg('Can only join with the next clip when it continues the same video.'); }}>⤝ Join with next</button>
        {isVideo && m?.hasAudio && <button className="btn small" onClick={() => onSeparate?.(m.id, s.id)}>🎙 Separate voice</button>}
        {isVideo && m?.hasAudio && <button className="btn small" onClick={() => { const q = detachAudio(p, s.id); if (q) { update(q); setMsg('Sound moved to the Voice track — you can now move, trim or fade it on its own.'); } else setMsg('Set speed to 1× first.'); }}>🔊 Detach sound</button>}
      </div>}
      {msg && <Note>{msg}</Note>}
    </div>
  );
}

function OverlayEditor({ store, o, onDone }: { store: Store; o: Overlay; onDone: () => void }) {
  const { project: p, update } = store;
  const set = (patch: Partial<Overlay>, key?: string) => update((c) => ({ ...c, overlays: c.overlays.map((x) => (x.id === o.id ? { ...x, ...patch } : x)) }), key ? `${o.id}-${key}` : undefined);
  return (
    <div className="col" style={{ gap: 10 }}>
      <div className="row" style={{ justifyContent: 'space-between' }}>
        <h3 style={{ margin: 0 }}>{o.kind === 'image' ? 'Picture / logo' : 'Text'}</h3>
        <div className="row" style={{ gap: 2 }}>
          <button className="icon-btn" title="Duplicate" onClick={() => update((c) => ({ ...c, overlays: [...c.overlays, { ...o, id: 'o_' + Math.random().toString(36).slice(2, 9), at: o.at + o.dur }] }))}>⧉</button>
          <button className="icon-btn" title="Delete" onClick={() => { update((c) => ({ ...c, overlays: c.overlays.filter((x) => x.id !== o.id) })); onDone(); }}>🗑</button>
        </div>
      </div>
      {o.kind === 'text' && (
        <>
          <label className="field">Text (*word* = accent colour)
            <textarea rows={3} value={o.text} onChange={(e) => set({ text: e.target.value }, 'text')} />
          </label>
          <label className="field">Style
            <select value={o.preset} onChange={(e) => set({ preset: e.target.value as Overlay['preset'] })}>
              <option value="title">Big title</option><option value="lower">Lower third (name strip)</option><option value="caption">Subtitle box</option><option value="tag">Tag / badge</option><option value="plain">Plain text</option>
            </select>
          </label>
        </>
      )}
      <div className="grid g2">
        <label className="field">Starts (s)<input type="number" min={0} step={0.1} value={Math.round(o.at * 100) / 100} onChange={(e) => set({ at: Math.max(0, +e.target.value) }, 'at')} /></label>
        <label className="field">Length (s)<input type="number" min={0.3} step={0.1} value={Math.round(o.dur * 100) / 100} onChange={(e) => set({ dur: Math.max(0.3, +e.target.value) }, 'dur')} /></label>
      </div>
      <div className="col" style={{ gap: 4 }}>
        <span className="small muted">Place it (or drag it on the picture; drag the green corner to resize)</span>
        <div className="pos-grid">
          {[0.12, 0.5, 0.88].flatMap((y) => [0.15, 0.5, 0.85].map((x) => (
            <button key={`${x}-${y}`} className={Math.abs(o.x - x) < 0.04 && Math.abs(o.y - y) < 0.04 ? 'on' : ''} onClick={() => set({ x, y })} title="Move here" />
          )))}
        </div>
      </div>
      <label className="field">Position — across: {Math.round(o.x * 100)}%
        <input type="range" min={0} max={1} step={0.01} value={o.x} onChange={(e) => set({ x: +e.target.value }, 'x')} />
      </label>
      <label className="field">Position — down: {Math.round(o.y * 100)}%
        <input type="range" min={0} max={1} step={0.01} value={o.y} onChange={(e) => set({ y: +e.target.value }, 'y')} />
      </label>
      <label className="field">Size: {o.size}
        <input type="range" min={o.kind === 'image' ? 3 : 1.5} max={o.kind === 'image' ? 100 : 20} step={0.1} value={o.size} onChange={(e) => set({ size: +e.target.value }, 'size')} />
      </label>
      <label className="field">Rotate: {o.rotate ?? 0}°
        <input type="range" min={-180} max={180} step={1} value={o.rotate ?? 0} onChange={(e) => set({ rotate: +e.target.value }, 'rot')} />
      </label>
      <div className="row" style={{ gap: 4 }}>
        {[[0, 'Straight'], [-90, 'Vertical ↑'], [90, 'Vertical ↓'], [-8, 'Tilt'], [180, 'Upside down']].map(([v, l]) => (
          <button key={String(v)} className={`btn small ${(o.rotate ?? 0) === v ? 'primary' : ''}`} onClick={() => set({ rotate: v as number })}>{l}</button>
        ))}
      </div>
      {o.kind === 'text' && (
        <>
          <div className="grid g2">
            <label className="field">Font
              <select value={o.font ?? ''} onChange={(e) => set({ font: e.target.value || undefined })}>
                <option value="">Style font ({o.preset === 'caption' ? p.style.fontBody : p.style.fontHead})</option>
                {FONTS.map((f) => <option key={f} value={f}>{f}</option>)}
              </select>
            </label>
            <label className="field">Line spacing: {(o.spacing ?? 1.15).toFixed(2)}
              <input type="range" min={0.8} max={2} step={0.05} value={o.spacing ?? 1.15} onChange={(e) => set({ spacing: +e.target.value }, 'sp')} />
            </label>
          </div>
          <div className="row" style={{ gap: 4 }}>
            <button className={`btn small ${o.bold !== false ? 'primary' : ''}`} style={{ fontWeight: 800 }} onClick={() => set({ bold: o.bold === false })} title="Bold">B</button>
            <button className={`btn small ${o.italic ? 'primary' : ''}`} style={{ fontStyle: 'italic' }} onClick={() => set({ italic: !o.italic })} title="Italic">I</button>
            <button className={`btn small ${o.upper ? 'primary' : ''}`} onClick={() => set({ upper: !o.upper })} title="All capitals">AA</button>
            <span className="sep-v" />
            {(['left', 'center', 'right'] as const).map((a) => (
              <button key={a} className={`btn small ${(o.align ?? (o.preset === 'lower' ? 'left' : 'center')) === a ? 'primary' : ''}`} onClick={() => set({ align: a })} title={`Align ${a}`}>{a === 'left' ? '⟸' : a === 'center' ? '⟺' : '⟹'}</button>
            ))}
            <span className="sep-v" />
            <button className={`btn small ${o.shadow ?? o.preset === 'title' ? 'primary' : ''}`} onClick={() => set({ shadow: !(o.shadow ?? o.preset === 'title') })} title="Shadow">Shadow</button>
          </div>
          <div className="grid g2">
            <label className="field">Outline: {o.outline ?? 0}
              <input type="range" min={0} max={12} step={0.5} value={o.outline ?? 0} onChange={(e) => set({ outline: +e.target.value }, 'ol')} />
            </label>
            <label className="field">Outline colour
              <input type="color" value={o.outlineColor || '#000000'} onChange={(e) => set({ outlineColor: e.target.value }, 'olc')} style={{ width: 40, height: 30, border: '1px solid var(--line)', borderRadius: 6 }} />
            </label>
          </div>
        </>
      )}
      {o.kind === 'text' && (
        <div className="grid g2">
          <label className="field">Text colour
            <div className="row" style={{ flexWrap: 'nowrap' }}>
              <input type="color" value={o.color || '#ffffff'} onChange={(e) => set({ color: e.target.value }, 'col')} style={{ width: 40, height: 30, border: '1px solid var(--line)', borderRadius: 6 }} />
              {o.color && <button className="btn small" onClick={() => set({ color: '' })}>Auto</button>}
            </div>
          </label>
          <label className="field">Box colour
            <div className="row" style={{ flexWrap: 'nowrap' }}>
              <input type="color" value={o.bg || '#000000'} onChange={(e) => set({ bg: e.target.value }, 'bg')} style={{ width: 40, height: 30, border: '1px solid var(--line)', borderRadius: 6 }} />
              {o.bg && <button className="btn small" onClick={() => set({ bg: '' })}>None</button>}
            </div>
          </label>
        </div>
      )}
      <div className="grid g2">
        <label className="field">Animation
          <select value={o.anim} onChange={(e) => set({ anim: e.target.value as Overlay['anim'] })}>
            <option value="fade">Fade</option><option value="pop">Pop</option><option value="slide">Slide in</option><option value="type">Word by word</option><option value="none">None</option>
          </select>
        </label>
        <label className="field">Opacity: {Math.round(o.opacity * 100)}%
          <input type="range" min={0.1} max={1} step={0.05} value={o.opacity} onChange={(e) => set({ opacity: +e.target.value }, 'op')} />
        </label>
      </div>
      <button className="btn small" onClick={() => { const { total } = timeline(p); set({ at: 0, dur: Math.max(1, total) }); }}>Show for the whole video</button>
    </div>
  );
}

function AudioEditor({ store, a, onDone }: { store: Store; a: AudioItem; onDone: () => void }) {
  const { project: p, update } = store;
  const m = p.media.find((x) => x.id === a.mediaId);
  const { total } = timeline(p);
  const set = (patch: Partial<AudioItem>, key?: string) => update((c) => ({ ...c, audio: c.audio.map((x) => (x.id === a.id ? { ...x, ...patch } : x)) }), key ? `${a.id}-${key}` : undefined);
  return (
    <div className="col" style={{ gap: 10 }}>
      <div className="row" style={{ justifyContent: 'space-between' }}>
        <h3 style={{ margin: 0 }}>{a.role === 'music' ? 'Music' : a.role === 'voice' ? 'Voice' : 'Sound'}</h3>
        <button className="icon-btn" title="Delete" onClick={() => { update((c) => ({ ...c, audio: c.audio.filter((x) => x.id !== a.id) })); onDone(); }}>🗑</button>
      </div>
      <span className="small muted" style={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>{m?.name} · file {m?.duration.toFixed(1)} s</span>
      <label className="field">Volume: {Math.round(a.volume * 100)}%
        <input type="range" min={0} max={2} step={0.05} value={a.volume} onChange={(e) => set({ volume: +e.target.value }, 'vol')} />
      </label>
      <div className="grid g2">
        <label className="field">Fade in (s)<input type="number" min={0} max={20} step={0.1} value={a.fadeIn} onChange={(e) => set({ fadeIn: Math.max(0, +e.target.value) }, 'fi')} /></label>
        <label className="field">Fade out (s)<input type="number" min={0} max={20} step={0.1} value={a.fadeOut} onChange={(e) => set({ fadeOut: Math.max(0, +e.target.value) }, 'fo')} /></label>
      </div>
      <div className="grid g2">
        <label className="field">Starts on video at (s)<input type="number" min={0} step={0.1} value={Math.round(a.at * 100) / 100} onChange={(e) => set({ at: Math.max(0, +e.target.value) }, 'at')} /></label>
        <label className="field">Start inside file (s)<input type="number" min={0} step={0.1} value={Math.round(a.offset * 100) / 100} onChange={(e) => set({ offset: Math.max(0, Math.min(+e.target.value, (m?.duration ?? 1) - 0.1)) }, 'off')} /></label>
      </div>
      <label className="row small"><input type="checkbox" checked={!!a.toEnd} onChange={(e) => set({ toEnd: e.target.checked, dur: e.target.checked ? a.dur : Math.max(0.5, itemEnd(a, total) - a.at) })} /> Run to the end of the video</label>
      {!a.toEnd && <label className="field">Length (s)<input type="number" min={0.3} step={0.1} value={Math.round(a.dur * 100) / 100} onChange={(e) => set({ dur: Math.max(0.3, +e.target.value) }, 'dur')} /></label>}
      <label className="row small"><input type="checkbox" checked={!!a.loop} onChange={(e) => set({ loop: e.target.checked })} /> Repeat (loop) if the file is shorter</label>
      {a.role === 'music' && <label className="row small"><input type="checkbox" checked={a.duck !== false} onChange={(e) => set({ duck: e.target.checked })} /> Dip under speech (auto-ducking)</label>}
      <label className="field">Track
        <select value={a.role} onChange={(e) => set({ role: e.target.value as AudioItem['role'] })}>
          <option value="music">Music</option><option value="voice">Voice (music dips under it)</option><option value="sfx">Sound effect</option>
        </select>
      </label>
    </div>
  );
}
