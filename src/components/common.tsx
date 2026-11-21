import { useEffect, useRef, useState, type ReactNode } from 'react';
import type { MediaItem } from '../types';

export const STEPS = ['Type', 'Format', 'Media', 'Content', 'Speakers', 'Preview', 'Export'];

export function Stepper({ step, maxDone, onGo }: { step: number; maxDone: number; onGo: (i: number) => void }) {
  return (
    <nav className="stepper" aria-label="Steps">
      {STEPS.map((s, i) => (
        <span key={s} style={{ display: 'contents' }}>
          {i > 0 && <span className="step-line" />}
          <button className={`step ${i === step ? 'active' : ''} ${i < step || i <= maxDone ? 'done' : ''}`} onClick={() => onGo(i)} title={s}>
            <span className="dot">{i < step ? '✓' : i + 1}</span>
            <span className="label">{s}</span>
          </button>
        </span>
      ))}
    </nav>
  );
}

export function PageHead({ title, sub }: { title: string; sub: string }) {
  return (<><h1 className="page-title">{title}</h1><p className="page-sub">{sub}</p></>);
}

export function Note({ children, kind }: { children: ReactNode; kind?: 'warn' | 'bad' }) {
  return <div className={`note ${kind ?? ''}`}>{children}</div>;
}

export function More({ label = 'More options', children, open }: { label?: string; children: ReactNode; open?: boolean }) {
  return <details className="more" open={open}><summary>{label}</summary><div>{children}</div></details>;
}

export function Progress({ value }: { value: number }) {
  return <div className="progress"><div style={{ width: `${Math.round(Math.max(0, Math.min(1, value)) * 100)}%` }} /></div>;
}

export function statusTag(m: MediaItem) {
  if (m.status === 'reading') return <span className="tag warn">Reading…</span>;
  if (m.status === 'error') return <span className="tag bad" title={m.error}>Error</span>;
  return <span className="tag ok">Ready</span>;
}

export const kindIcon = (m?: MediaItem) => (!m ? '＋' : m.kind === 'video' ? '🎬' : m.kind === 'audio' ? (m.role === 'music' ? '🎵' : '🎙️') : '🖼️');

export function Thumb({ m, size = 56 }: { m?: MediaItem; size?: number }) {
  return (
    <div className="thumb" style={{ width: size, height: Math.round(size * 0.64), backgroundImage: m?.thumb ? `url(${m.thumb})` : undefined }}>
      {!m?.thumb && kindIcon(m)}
    </div>
  );
}

/** Small button that opens a grid of media to choose from. */
export function MediaPicker({ media, value, onChange, filter, allowNone = true, size = 56 }: {
  media: MediaItem[]; value?: string; onChange: (id: string | undefined) => void;
  filter?: (m: MediaItem) => boolean; allowNone?: boolean; size?: number;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent) => { if (!ref.current?.contains(e.target as Node)) setOpen(false); };
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, [open]);
  const list = media.filter((m) => m.status === 'ready' && (filter ? filter(m) : m.kind !== 'audio'));
  const cur = media.find((m) => m.id === value);
  return (
    <div className="picker" ref={ref}>
      <button type="button" className="icon-btn" style={{ width: 'auto', height: 'auto', padding: 0 }} onClick={() => setOpen(!open)} title={cur ? cur.name : 'Choose media'}>
        <Thumb m={cur} size={size} />
      </button>
      {open && (
        <div className="picker-pop">
          {allowNone && <button onClick={() => { onChange(undefined); setOpen(false); }}>None</button>}
          {list.map((m) => (
            <button key={m.id} className={m.id === value ? 'on' : ''} style={{ backgroundImage: m.thumb ? `url(${m.thumb})` : undefined }} title={m.name} onClick={() => { onChange(m.id); setOpen(false); }}>
              {!m.thumb && kindIcon(m)}
            </button>
          ))}
          {!list.length && <span className="small muted" style={{ gridColumn: '1/-1' }}>Add photos or clips in step 3 first.</span>}
        </div>
      )}
    </div>
  );
}

export function useMediaQuery(q: string) {
  const [m, setM] = useState(() => window.matchMedia(q).matches);
  useEffect(() => {
    const mq = window.matchMedia(q);
    const f = () => setM(mq.matches);
    mq.addEventListener('change', f);
    return () => mq.removeEventListener('change', f);
  }, [q]);
  return m;
}
