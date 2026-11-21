import { useEffect, useRef, useState } from 'react';
import type { Project } from '../types';
import { timeline } from '../render/engine';
import { buildPlan } from '../audio/mix';
import { SCENE_LABELS } from '../presets';
import { stripRich } from '../render/text';

function sceneLabel(p: Project, i: number) {
  const s = p.scenes[i];
  const t = s.texts;
  const txt = t.title || t.lines?.[0] || t.words || t.caption || (s.kind === 'cta' ? p.cta.title : '') || '';
  return `${i + 1}. ${txt ? stripRich(txt) : SCENE_LABELS[s.kind]}`;
}

export function Timeline({ project: p, time, selected, warnings, onSelect, onSeek, onMove, onResize }: {
  project: Project; time: number; selected: string | null; warnings: Set<string>;
  onSelect: (id: string) => void; onSeek: (t: number) => void; onMove: (from: number, to: number) => void; onResize: (id: string, d: number) => void;
}) {
  const wrap = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(800);
  const [dragOver, setDragOver] = useState<number | null>(null);
  const { starts, total } = timeline(p);
  useEffect(() => {
    const el = wrap.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setWidth(el.clientWidth - 90));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  const pps = Math.max(14, width / Math.max(1, total));
  const media = new Map(p.media.map((m) => [m.id, m]));
  const plan = buildPlan(p);
  const trackW = total * pps;

  const seekFromEvent = (e: React.MouseEvent) => {
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
    onSeek(Math.max(0, (e.clientX - rect.left) / pps));
  };
  const startResize = (e: React.PointerEvent, id: string, d0: number) => {
    e.stopPropagation();
    e.preventDefault();
    const x0 = e.clientX;
    const move = (ev: PointerEvent) => onResize(id, Math.max(0.8, Math.round((d0 + (ev.clientX - x0) / pps) * 10) / 10));
    const up = () => { window.removeEventListener('pointermove', move); window.removeEventListener('pointerup', up); };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
  };

  return (
    <div className="timeline" ref={wrap}>
      <div className="lane thin">
        <div className="lane-label">Time</div>
        <div className="lane-track" style={{ width: trackW, cursor: 'pointer' }} onClick={seekFromEvent}>
          {Array.from({ length: Math.floor(total / (pps < 30 ? 5 : 1)) + 1 }, (_, i) => i * (pps < 30 ? 5 : 1)).map((s) => (
            <span key={s} className="small muted" style={{ position: 'absolute', left: s * pps, fontSize: 10 }}>{s}s</span>
          ))}
          <div className="playhead" style={{ left: time * pps }} />
        </div>
      </div>
      <div className="lane">
        <div className="lane-label">Scenes</div>
        <div className="lane-track" style={{ width: trackW }}>
          {p.scenes.map((s, i) => {
            const thumb = media.get(s.mediaIds[0])?.thumb;
            return (
              <div
                key={s.id}
                className={`block ${selected === s.id ? 'sel' : ''} ${warnings.has(s.id) ? 'warn' : ''} ${dragOver === i ? 'drag-over' : ''}`}
                style={{ left: starts[i] * pps + 1, width: Math.max(8, s.duration * pps - 2), backgroundImage: thumb ? `url(${thumb})` : undefined }}
                title={`${sceneLabel(p, i)} · ${s.duration.toFixed(1)} s${warnings.has(s.id) ? ' · text too long' : ''}`}
                draggable
                onDragStart={(e) => e.dataTransfer.setData('text/scene', String(i))}
                onDragOver={(e) => { e.preventDefault(); setDragOver(i); }}
                onDragLeave={() => setDragOver(null)}
                onDrop={(e) => { e.preventDefault(); setDragOver(null); const from = Number(e.dataTransfer.getData('text/scene')); if (!Number.isNaN(from) && from !== i) onMove(from, i); }}
                onClick={() => { onSelect(s.id); onSeek(starts[i] + 0.01); }}
              >
                <span className="lbl">{warnings.has(s.id) ? '⚠ ' : ''}{sceneLabel(p, i)}</span>
                <span className="resize" onPointerDown={(e) => startResize(e, s.id, s.duration)} />
              </div>
            );
          })}
          <div className="playhead" style={{ left: time * pps }} />
        </div>
      </div>
      <div className="lane thin">
        <div className="lane-label">Music</div>
        <div className="lane-track" style={{ width: trackW }}>
          {p.musicId && <div className="block audio" style={{ left: 0, width: trackW }}><span className="lbl">{media.get(p.musicId)?.name}</span></div>}
          {p.musicId && p.snapToBeats && p.beats.filter((b) => b < total).map((b, i) => <span key={i} className="beat" style={{ left: b * pps }} />)}
          <div className="playhead" style={{ left: time * pps }} />
        </div>
      </div>
      <div className="lane thin">
        <div className="lane-label">Voice</div>
        <div className="lane-track" style={{ width: trackW }}>
          {plan.clips.map((c, i) => (
            <div key={i} className="block voice" style={{ left: c.at * pps, width: Math.max(4, c.dur * pps) }}><span className="lbl">{media.get(c.mediaId)?.role === 'voice' ? '🎙' : '🗣'}</span></div>
          ))}
          <div className="playhead" style={{ left: time * pps }} />
        </div>
      </div>
      {p.captions.length > 0 && p.captionStyle !== 'off' && (
        <div className="lane thin">
          <div className="lane-label">Captions</div>
          <div className="lane-track" style={{ width: trackW }}>
            {p.captions.map((c) => <div key={c.id} className="block" style={{ left: c.start * pps, width: Math.max(4, (c.end - c.start) * pps) }} title={c.text}><span className="lbl">{c.text}</span></div>)}
          </div>
        </div>
      )}
    </div>
  );
}
