import { useEffect, useRef, useState } from 'react';
import type { AudioItem, Overlay, Project } from '../types';
import type { Store } from '../store';
import { timeline } from '../render/engine';
import { buildPlan } from '../audio/mix';
import { SCENE_LABELS } from '../presets';
import { stripRich } from '../render/text';
import { itemEnd, snap, snapPoints, trimScene } from '../edit';
import { Waveform } from './Waveform';
import { defaultIn } from '../render/engine';
import { useMemo } from 'react';

export type Sel = { kind: 'scene' | 'overlay' | 'audio'; id: string } | null;

const LABEL_W = 66;

function sceneLabel(p: Project, i: number) {
  const s = p.scenes[i];
  const t = s.texts;
  const m = p.media.find((x) => x.id === s.mediaIds[0]);
  const txt = t.title || t.lines?.[0] || t.words || t.caption || (s.kind === 'cta' ? p.cta.title : '') || (s.kind === 'moment' ? m?.name : '') || '';
  return txt ? stripRich(txt) : SCENE_LABELS[s.kind];
}

export function MultiTimeline({ store, time, sel, onSelect, onSeek, pps, setPps, snapOn, warnings }: {
  store: Store; time: number; sel: Sel; onSelect: (s: Sel) => void; onSeek: (t: number) => void;
  pps: number; setPps: (n: number) => void; snapOn: boolean; warnings: Set<string>;
}) {
  const { project: p, update } = store;
  const wrap = useRef<HTMLDivElement>(null);
  const [dragOver, setDragOver] = useState<number | null>(null);
  const { starts, total } = timeline(p);
  const media = new Map(p.media.map((m) => [m.id, m]));
  const plan = buildPlan(p);
  const span = Math.max(total, ...p.overlays.map((o) => o.at + o.dur), ...p.audio.map((a) => itemEnd(a, total))) + 4;
  const trackW = span * pps;

  // Fit to width the first time there is content
  const fitted = useRef(false);
  useEffect(() => {
    const el = wrap.current;
    if (!el || fitted.current || total <= 0) return;
    fitted.current = true;
    setPps(Math.max(8, Math.min(120, (el.clientWidth - LABEL_W - 30) / (total + 2))));
  }, [total, setPps]);

  const toTime = (clientX: number) => {
    const el = wrap.current!;
    const r = el.getBoundingClientRect();
    return Math.max(0, (clientX - r.left - LABEL_W + el.scrollLeft) / pps);
  };

  /** Generic horizontal drag with snapping; `apply` receives the snapped delta in seconds. */
  const drag = (e: React.PointerEvent, key: string, edgeTime: number, apply: (dt: number) => void) => {
    e.stopPropagation();
    e.preventDefault();
    const x0 = e.clientX;
    const pts = snapOn ? snapPoints(p, time, true).filter((x) => Math.abs(x - edgeTime) > 1e-3) : [];
    let moved = false;
    const move = (ev: PointerEvent) => {
      const raw = (ev.clientX - x0) / pps;
      if (!moved && Math.abs(ev.clientX - x0) < 3) return;
      moved = true;
      const snapped = snapOn ? snap(edgeTime + raw, pts, 8 / pps) - edgeTime : raw;
      apply(snapped);
    };
    const up = () => { window.removeEventListener('pointermove', move); window.removeEventListener('pointerup', up); };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
    void key;
  };

  const setOverlay = (id: string, patch: Partial<Overlay>, key: string) =>
    update((c) => ({ ...c, overlays: c.overlays.map((o) => (o.id === id ? { ...o, ...patch } : o)) }), key);
  const setAudio = (id: string, patch: Partial<AudioItem>, key: string) =>
    update((c) => ({ ...c, audio: c.audio.map((a) => (a.id === id ? { ...a, ...patch } : a)) }), key);

  const rulerDown = (e: React.PointerEvent) => {
    const t0 = toTime(e.clientX);
    onSeek(t0);
    const shift = e.shiftKey;
    const move = (ev: PointerEvent) => {
      const t = toTime(ev.clientX);
      if (shift) update((c) => ({ ...c, rangeIn: Math.min(t0, t), rangeOut: Math.max(t0, t) }), 'range');
      else onSeek(t);
    };
    const up = () => { window.removeEventListener('pointermove', move); window.removeEventListener('pointerup', up); };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
  };

  const stepTicks = pps > 60 ? 1 : pps > 25 ? 2 : pps > 12 ? 5 : 10;
  const range = p.rangeIn !== undefined && p.rangeOut !== undefined ? [p.rangeIn, p.rangeOut] : null;
  const overlayEls = (
    <>
      {range && <div className="range" style={{ left: range[0] * pps, width: (range[1] - range[0]) * pps }} />}
      <div className="playhead" style={{ left: time * pps }} />
    </>
  );
  const isSel = (kind: string, id: string) => sel?.kind === kind && sel.id === id;
  const mainMusicItem = p.audio.find((a) => a.role === 'music' && a.toEnd) ?? p.audio.find((a) => a.role === 'music');
  const beatsKey = p.beats.length + ':' + (p.beats[0] ?? 0) + ':' + (p.beats[p.beats.length - 1] ?? 0);
  const beatCache = useMemo(() => new Map<string, number[]>(), [beatsKey]); // eslint-disable-line
  /** Beats inside [a, b], relative to a (stable array so the waveform is not redrawn needlessly). */
  const beatsIn = (a: number, b: number) => {
    const k = `${a.toFixed(3)}-${b.toFixed(3)}`;
    let v = beatCache.get(k);
    if (!v) { v = p.beats.filter((t) => t >= a && t <= b).map((t) => t - a); beatCache.set(k, v); }
    return v;
  };

  return (
    <div className="mt" ref={wrap} onWheel={(e) => { if (e.ctrlKey || e.metaKey) { e.preventDefault(); setPps(Math.max(4, Math.min(300, pps * (e.deltaY < 0 ? 1.15 : 0.87)))); } }}>
      <div className="mt-inner" style={{ width: trackW + LABEL_W }}>
        {/* Ruler */}
        <div className="mt-row ruler">
          <div className="mt-label">Time</div>
          <div className="mt-track" style={{ width: trackW }} onPointerDown={rulerDown} title="Click or drag to move the playhead. Shift + drag selects a part.">
            {Array.from({ length: Math.ceil(span / stepTicks) + 1 }, (_, i) => i * stepTicks).map((s) => (
              <span key={s} className="tick" style={{ left: s * pps }}>{s < 60 ? `${s}s` : `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`}</span>
            ))}
            {overlayEls}
          </div>
        </div>
        {/* Video */}
        <div className="mt-row video">
          <div className="mt-label">🎬 Video</div>
          <div className="mt-track" style={{ width: trackW }}>
            {p.beats.length > 0 && p.beats.filter((b) => b <= span).map((b, i) => <span key={i} className="beat" style={{ left: b * pps }} />)}
            {p.scenes.map((s, i) => {
              const m = media.get(s.mediaIds[0]);
              const w = Math.max(6, s.duration * pps - 2);
              return (
                <div
                  key={s.id}
                  className={`clip ${isSel('scene', s.id) ? 'sel' : ''} ${warnings.has(s.id) ? 'warn' : ''} ${dragOver === i ? 'drag-over' : ''} ${s.kind === 'moment' ? 'raw' : ''}`}
                  style={{ left: starts[i] * pps + 1, width: w, backgroundImage: m?.thumb ? `url(${m.thumb})` : undefined }}
                  title={`${i + 1}. ${sceneLabel(p, i)} · ${s.duration.toFixed(2)} s${s.speed && s.speed !== 1 ? ` · ${s.speed}×` : ''}`}
                  draggable
                  onDragStart={(e) => e.dataTransfer.setData('text/scene', String(i))}
                  onDragOver={(e) => { e.preventDefault(); setDragOver(i); }}
                  onDragLeave={() => setDragOver(null)}
                  onDrop={(e) => {
                    e.preventDefault(); setDragOver(null);
                    const from = Number(e.dataTransfer.getData('text/scene'));
                    if (!Number.isNaN(from) && from !== i) update((c) => { const sc = [...c.scenes]; const [x] = sc.splice(from, 1); sc.splice(i, 0, x); return { ...c, scenes: sc }; });
                  }}
                  onClick={(e) => { e.stopPropagation(); onSelect({ kind: 'scene', id: s.id }); }}
                >
                  {s.useClipAudio && !s.muted && m?.kind === 'video' && m.hasAudio && w > 10 && (
                    <span className="clip-wave"><Waveform mediaId={m.id} offset={s.clipIn ?? defaultIn(m)} dur={s.duration} rate={s.speed ?? 1} width={w - 4} height={14} volume={s.volume ?? 1} color="rgba(255,255,255,0.9)" fileDur={m.duration} /></span>
                  )}
                  <span className="lbl">{warnings.has(s.id) ? '⚠ ' : ''}{s.muted ? '🔇 ' : ''}{s.speed && s.speed !== 1 ? `${s.speed}× ` : ''}{sceneLabel(p, i)}</span>
                  {w > 18 && <span className="h l" onPointerDown={(e) => drag(e, 'trim', starts[i], (dt) => update((c) => trimScene(c, s.id, 'start', s.duration - dt), 'trim-' + s.id))} />}
                  {w > 18 && <span className="h r" onPointerDown={(e) => drag(e, 'trim', starts[i] + s.duration, (dt) => update((c) => trimScene(c, s.id, 'end', s.duration + dt), 'trim-' + s.id))} />}
                </div>
              );
            })}
            {overlayEls}
          </div>
        </div>
        {/* Text / pictures */}
        <div className="mt-row">
          <div className="mt-label">🔤 Text</div>
          <div className="mt-track" style={{ width: trackW }}>
            {p.overlays.map((o) => (
              <div key={o.id} className={`item text ${isSel('overlay', o.id) ? 'sel' : ''}`} style={{ left: o.at * pps, width: Math.max(6, o.dur * pps) }}
                title={o.text || 'Picture'} onClick={(e) => { e.stopPropagation(); onSelect({ kind: 'overlay', id: o.id }); }}
                onPointerDown={(e) => { onSelect({ kind: 'overlay', id: o.id }); drag(e, 'move', o.at, (dt) => setOverlay(o.id, { at: Math.max(0, o.at + dt) }, 'mv-' + o.id)); }}>
                <span className="lbl">{o.kind === 'image' ? '🖼 ' + (media.get(o.mediaId ?? '')?.name ?? 'Picture') : stripRich(o.text).replace(/\n/g, ' · ')}</span>
                <span className="h l" onPointerDown={(e) => drag(e, 'l', o.at, (dt) => { const d = Math.max(0.3, o.dur - dt); setOverlay(o.id, { at: Math.max(0, o.at + o.dur - d), dur: d }, 'tl-' + o.id); })} />
                <span className="h r" onPointerDown={(e) => drag(e, 'r', o.at + o.dur, (dt) => setOverlay(o.id, { dur: Math.max(0.3, o.dur + dt) }, 'tr-' + o.id))} />
              </div>
            ))}
            {overlayEls}
          </div>
        </div>
        {/* Music */}
        <div className="mt-row">
          <div className="mt-label">🎵 Music</div>
          <div className="mt-track" style={{ width: trackW }}>
            {p.audio.filter((a) => a.role === 'music').map((a) => audioBlock(a))}
            {overlayEls}
          </div>
        </div>
        {/* Voice & sounds */}
        <div className="mt-row">
          <div className="mt-label">🎙 Voice</div>
          <div className="mt-track" style={{ width: trackW }}>
            {plan.clips.filter((c) => c.fromScene).map((c, i) => (
              <div key={'c' + i} className="item ghost" style={{ left: c.at * pps, width: Math.max(4, c.dur * pps) }} title={media.get(c.mediaId)?.kind === 'video' ? 'Sound of the video clip (edit it on the clip)' : 'Scene voiceover'}>
                <Waveform mediaId={c.mediaId} offset={c.offset} dur={c.dur} rate={c.rate} width={Math.max(4, c.dur * pps)} height={30} volume={c.volume} color="rgba(100,116,139,0.55)" fileDur={media.get(c.mediaId)?.duration} />
                <span className="lbl">{media.get(c.mediaId)?.kind === 'video' ? '🗣 clip sound' : '🎙 voiceover'}</span>
              </div>
            ))}
            {p.audio.filter((a) => a.role !== 'music').map((a) => audioBlock(a))}
            {overlayEls}
          </div>
        </div>
      </div>
    </div>
  );

  function audioBlock(a: AudioItem) {
    const end = itemEnd(a, total);
    const w = Math.max(6, (end - a.at) * pps);
    const fi = Math.min(w, a.fadeIn * pps), fo = Math.min(w, a.fadeOut * pps);
    return (
      <div key={a.id} className={`item ${a.role} ${isSel('audio', a.id) ? 'sel' : ''}`} style={{ left: a.at * pps, width: w }}
        title={`${media.get(a.mediaId)?.name ?? ''} · volume ${Math.round(a.volume * 100)}%${a.toEnd ? ' · to the end' : ''}`}
        onClick={(e) => { e.stopPropagation(); onSelect({ kind: 'audio', id: a.id }); }}
        onPointerDown={(e) => { onSelect({ kind: 'audio', id: a.id }); drag(e, 'move', a.at, (dt) => setAudio(a.id, { at: Math.max(0, a.at + dt) }, 'mv-' + a.id)); }}>
        <Waveform mediaId={a.mediaId} offset={a.offset} dur={end - a.at} loop={!!a.loop} width={w} height={30} volume={a.volume}
          color={a.role === 'music' ? 'rgba(47,111,71,0.55)' : a.role === 'voice' ? 'rgba(67,56,202,0.5)' : 'rgba(190,24,93,0.5)'}
          beats={a.role === 'music' && a === mainMusicItem ? beatsIn(a.at, end) : undefined} fileDur={media.get(a.mediaId)?.duration} />
        {fi > 2 && <span className="fade in" style={{ width: fi }} />}
        {fo > 2 && <span className="fade out" style={{ width: fo }} />}
        <span className="lbl">{a.role === 'music' ? '🎵' : a.role === 'voice' ? '🎙' : '🔊'} {media.get(a.mediaId)?.name}</span>
        <span className="h l" onPointerDown={(e) => drag(e, 'l', a.at, (dt) => {
          const d = Math.max(0.3, end - a.at - dt);
          const newAt = Math.max(0, end - d);
          setAudio(a.id, { at: newAt, offset: Math.max(0, a.offset + (newAt - a.at)), dur: a.toEnd ? a.dur : d }, 'al-' + a.id);
        })} />
        <span className="h r" onPointerDown={(e) => drag(e, 'r', end, (dt) => setAudio(a.id, { dur: Math.max(0.3, end - a.at + dt), toEnd: false }, 'ar-' + a.id))} />
      </div>
    );
  }
}
