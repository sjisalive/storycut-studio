import { useCallback, useEffect, useRef, useState } from 'react';
import type { MediaItem, MediaRole, Project } from './types';
import { useProjectHistory } from './store';
import { assemble, defaultProject } from './assemble';
import { getAudioBuffer, guessRole, readMedia } from './media';
import { detectBeats } from './audio/beats';
import { saveProject } from './projects';
import { buildTemplate } from './templates';
import { ASPECTS } from './presets';
import { renderFrame, timeline } from './render/engine';
import { dims } from './export/exporter';
import { ExactRuntime } from './export/runtime';
import { addClips, deleteRange, keepRange, mainMusic, migrate, newOverlay, splitAt } from './edit';
import { download, fmtTime, uid } from './util';
import { Player, type PlayerHandle } from './components/Player';
import { MultiTimeline, type Sel } from './components/MultiTimeline';
import { Inspector } from './components/Inspector';
import { MediaBin } from './components/MediaBin';
import { AudioPanel, StylePanel, TextPanel } from './components/SidePanels';
import { StepType } from './components/StepType';
import { StepFormat } from './components/StepFormat';
import { StepContent } from './components/StepContent';
import { StepBites } from './components/StepBites';
import { StepExport } from './components/StepExport';
import { ProjectsDrawer } from './components/ProjectsDrawer';

type NewFile = File | { blob: Blob; name: string; role?: MediaRole };
type Tab = 'media' | 'text' | 'audio' | 'style';

/** A one-clip project used by "Compress this video". */
function quickProject(p: Project, m: MediaItem): Project {
  const r = m.width / Math.max(1, m.height);
  const aspect = ASPECTS.reduce((best, a) => (Math.abs(Math.log(a.w / a.h / r)) < Math.abs(Math.log(best.w / best.h / r)) ? a : best)).key;
  return {
    ...p, name: m.name.replace(/\.[^.]+$/, ''), aspect, overlays: [], audio: [], captions: [], rangeIn: undefined, rangeOut: undefined,
    scenes: [{ id: uid('s'), kind: 'moment', duration: m.duration, transition: 'cut', texts: {}, mediaIds: [m.id], clipIn: 0, useClipAudio: !!m.hasAudio, volume: 1, speed: 1, fit: 'fit' }],
  };
}

export default function App() {
  const store = useProjectHistory(defaultProject());
  const { project: p, update, silentAll, undo, redo, reset, canUndo, canRedo } = store;
  const player = useRef<PlayerHandle>(null);
  const [time, setTime] = useState(0);
  const [sel, setSel] = useState<Sel>(null);
  const [tab, setTab] = useState<Tab>('media');
  const [pps, setPps] = useState(40);
  const [snapOn, setSnapOn] = useState(true);
  const [warnings, setWarnings] = useState<Set<string>>(new Set());
  const [drawer, setDrawer] = useState<null | 'projects' | 'auto' | 'export'>(null);
  const [quick, setQuick] = useState<Project | null>(null);
  const [savedAt, setSavedAt] = useState<number | null>(null);
  const [beatsInfo, setBeatsInfo] = useState('');
  const [toast, setToast] = useState('');
  const [busy, setBusy] = useState('');
  const dirty = useRef(false);
  const { total } = timeline(p);
  // Test hook (only with ?test in the address) so automated checks can read the project.
  if (typeof location !== 'undefined' && location.search.includes('test')) (window as any).__sc = { store, time, sel };

  const say = useCallback((m: string) => { setToast(m); window.clearTimeout((say as any).t); (say as any).t = window.setTimeout(() => setToast(''), 3500); }, []);
  const onTime = useCallback((t: number) => setTime(t), []);
  const onWarnings = useCallback((w: Set<string>) => setWarnings(w), []);

  const addFiles = useCallback(async (files: NewFile[]) => {
    const items = files.map((f) => {
      const blob = f instanceof File ? f : f.blob;
      const name = f.name;
      const role = f instanceof File ? undefined : f.role;
      const kind: MediaItem['kind'] = blob.type.startsWith('video') ? 'video' : blob.type.startsWith('audio') || (/\.(mp3|wav|m4a|ogg|aac|flac|opus)$/i.test(name)) ? 'audio' : 'image';
      return { id: uid('m'), blob, name, role, kind };
    });
    update((cur) => ({
      ...cur,
      media: [...cur.media, ...items.map((it) => ({ id: it.id, name: it.name, kind: it.kind, role: it.role ?? guessRole(it.name, it.blob.type, 0), mime: it.blob.type, size: it.blob.size, duration: 0, width: 0, height: 0, status: 'reading' as const }))],
    }));
    await Promise.all(items.map(async (it) => {
      const m = await readMedia(it.blob, it.name, { id: it.id, role: it.role });
      silentAll((cur) => {
        if (!cur.media.some((x) => x.id === it.id)) return cur;
        const logoId = cur.cta.logoId ?? (m.role === 'logo' && m.status === 'ready' ? m.id : undefined);
        return { ...cur, media: cur.media.map((x) => (x.id === it.id ? m : x)), cta: { ...cur.cta, logoId } };
      });
    }));
    return items.map((i) => i.id);
  }, [update, silentAll]);

  // Beats from the main music (shifted to where it sits on the timeline, looped)
  const music = mainMusic(p);
  const musicKey = music ? `${music.mediaId}|${music.at}|${music.offset}|${music.loop}|${p.media.find((m) => m.id === music.mediaId)?.status}` : '';
  useEffect(() => {
    let live = true;
    if (!music) { setBeatsInfo(''); silentAll((c) => (c.beats.length ? { ...c, beats: [] } : c)); return; }
    getAudioBuffer(music.mediaId).then((buf) => {
      if (!live || !buf) return;
      const det = detectBeats(buf);
      const beats: number[] = [];
      for (let rep = 0; rep < 60 && beats.length < 3000; rep++) {
        const shift = music.at - music.offset + rep * buf.duration;
        let any = false;
        for (const b of det.beats) { const t = b + shift; if (t >= music.at && t < 900) { beats.push(Math.round(t * 1000) / 1000); any = true; } }
        if (!music.loop && rep > 0) break;
        if (!any && rep > 0 && shift > 900) break;
      }
      setBeatsInfo(det.bpm ? `About ${det.bpm} beats per minute (green ticks on the timeline).` : 'No steady beat found in this music.');
      silentAll((c) => ({ ...c, beats }));
    });
    return () => { live = false; };
  }, [musicKey]); // eslint-disable-line

  // Autosave
  useEffect(() => {
    if (!dirty.current) { dirty.current = canUndo || p.scenes.length > 0; if (!dirty.current) return; }
    if (p.media.some((m) => m.status === 'reading')) return;
    const t = setTimeout(() => { saveProject(p).then(() => setSavedAt(Date.now())).catch(() => {}); }, 1500);
    return () => clearTimeout(t);
  }, [p, canUndo]);

  // ------------------------------------------------------------ edit actions
  const split = () => { const q = splitAt(p, time); if (q) { update(q); say(`Split at ${fmtTime(time)}`); } else say('Move the playhead inside a clip to split it (montage scenes cannot be split).'); };
  const deleteSel = () => {
    if (!sel) { say('Select something on the timeline first.'); return; }
    if (sel.kind === 'scene') update((c) => ({ ...c, scenes: c.scenes.filter((s) => s.id !== sel.id) }));
    if (sel.kind === 'overlay') update((c) => ({ ...c, overlays: c.overlays.filter((s) => s.id !== sel.id) }));
    if (sel.kind === 'audio') update((c) => ({ ...c, audio: c.audio.filter((s) => s.id !== sel.id) }));
    setSel(null);
  };
  const duplicateSel = () => {
    if (sel?.kind === 'scene') update((c) => { const i = c.scenes.findIndex((s) => s.id === sel.id); const sc = [...c.scenes]; sc.splice(i + 1, 0, { ...structuredClone(sc[i]), id: uid('s') }); return { ...c, scenes: sc }; });
    if (sel?.kind === 'overlay') update((c) => { const o = c.overlays.find((x) => x.id === sel.id)!; return { ...c, overlays: [...c.overlays, { ...o, id: uid('o'), at: o.at + o.dur }] }; });
    if (sel?.kind === 'audio') update((c) => { const a = c.audio.find((x) => x.id === sel.id)!; return { ...c, audio: [...c.audio, { ...a, id: uid('a'), at: a.at + a.dur, toEnd: false }] }; });
  };
  const setIn = () => update((c) => ({ ...c, rangeIn: time, rangeOut: c.rangeOut !== undefined && c.rangeOut > time ? c.rangeOut : Math.min(total, time + 2) }));
  const setOut = () => update((c) => ({ ...c, rangeOut: time, rangeIn: c.rangeIn !== undefined && c.rangeIn < time ? c.rangeIn : Math.max(0, time - 2) }));
  const hasRange = p.rangeIn !== undefined && p.rangeOut !== undefined && p.rangeOut - p.rangeIn > 0.02;
  const delRange = () => { if (!hasRange) { say('Mark a part first with I and O (or Shift + drag on the time ruler).'); return; } const d = p.rangeOut! - p.rangeIn!; update(deleteRange(p, p.rangeIn!, p.rangeOut!)); player.current?.seek(p.rangeIn!); say(`Deleted ${d.toFixed(1)} s from all tracks`); };
  const keepPart = () => { if (!hasRange) return; update(keepRange(p, p.rangeIn!, p.rangeOut!)); player.current?.seek(0); say('Kept only the marked part'); };
  const snapshot = async () => {
    const { w, h } = dims(p.aspect, 1080);
    const c = document.createElement('canvas'); c.width = w; c.height = h;
    const rt = new ExactRuntime();
    await rt.draw(c.getContext('2d')!, p, time, w, h);
    await rt.dispose();
    c.toBlob((b) => b && download(b, `frame-${fmtTime(time).replace(/[:.]/g, '-')}.png`), 'image/png');
  };
  void renderFrame;

  // Shortcuts
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const el = e.target as HTMLInputElement;
      const tag = el?.tagName;
      const typing = (tag === 'INPUT' && !['range', 'checkbox', 'radio', 'button'].includes(el.type)) || tag === 'TEXTAREA' || tag === 'SELECT';
      if (typing || drawer) return;
      if (tag === 'INPUT' && (e.key.startsWith('Arrow') || e.key === 'Home' || e.key === 'End')) el.blur();
      const k = e.key.toLowerCase();
      const mod = e.ctrlKey || e.metaKey;
      if (mod && k === 'z' && !e.shiftKey) { e.preventDefault(); undo(); return; }
      if (mod && ((k === 'z' && e.shiftKey) || k === 'y')) { e.preventDefault(); redo(); return; }
      if (mod && k === 'd') { e.preventDefault(); duplicateSel(); return; }
      if (mod) return;
      if (e.code === 'Space') { e.preventDefault(); (document.activeElement as HTMLElement)?.blur?.(); player.current?.toggle(); }
      else if (k === 's') split();
      else if (k === 'i') setIn();
      else if (k === 'o') setOut();
      else if (k === 't') { const o = newOverlay('title', time); update((c) => ({ ...c, overlays: [...c.overlays, o] })); setSel({ kind: 'overlay', id: o.id }); }
      else if ((k === 'delete' || k === 'backspace') && e.shiftKey) { e.preventDefault(); delRange(); }
      else if (k === 'delete' || k === 'backspace') { e.preventDefault(); deleteSel(); }
      else if (k === 'escape') { setSel(null); update((c) => ({ ...c, rangeIn: undefined, rangeOut: undefined })); }
      else if (k === 'arrowright') { e.preventDefault(); player.current?.step(e.shiftKey ? 1 : 1 / 30); }
      else if (k === 'arrowleft') { e.preventDefault(); player.current?.step(e.shiftKey ? -1 : -1 / 30); }
      else if (k === 'home') player.current?.seek(0);
      else if (k === 'end') player.current?.seek(total);
      else if (k === '+' || k === '=') setPps((x) => Math.min(300, x * 1.25));
      else if (k === '-') setPps((x) => Math.max(4, x / 1.25));
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  const makeVideo = () => {
    if (p.scenes.length && !confirm('Build the video track again from the content list? Your current clips on the video track will be replaced (Undo is available). Text, music and voice tracks stay.')) return;
    update((cur) => ({ ...cur, scenes: assemble(cur) }));
    setDrawer(null);
    player.current?.seek(0);
  };
  const onTemplate = async (id: string) => {
    setBusy('Preparing the example…');
    try { reset(migrate(await buildTemplate(id, setBusy))); dirty.current = true; setDrawer(null); setSel(null); }
    finally { setBusy(''); }
  };

  return (
    <div className="app editor">
      <header className="header">
        <div className="logo">▶</div>
        <span className="brand">StoryCut Studio</span>
        <input className="name" value={p.name} onChange={(e) => update({ name: e.target.value }, 'name')} aria-label="Project name" />
        <button className="icon-btn" title="Undo (Ctrl+Z)" disabled={!canUndo} onClick={undo}>↶</button>
        <button className="icon-btn" title="Redo (Ctrl+Shift+Z)" disabled={!canRedo} onClick={redo}>↷</button>
        <span className="spacer" />
        {savedAt && <span className="saved hide-sm">Saved {new Date(savedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>}
        <button className="btn small" onClick={() => setDrawer('auto')}>✨ Auto video</button>
        <button className="btn small" onClick={() => setDrawer('projects')}>📁 Projects</button>
        <button className="btn small primary" onClick={() => { setQuick(null); setDrawer('export'); }}>⬇ Export</button>
      </header>
      {busy && <div className="note" style={{ margin: 8 }}>{busy}</div>}
      <div className="ws">
        <aside className="ws-left card">
          <div className="tabs">
            {([['media', '🎞 Media'], ['text', '🔤 Text'], ['audio', '🎵 Audio'], ['style', '🎨 Style']] as [Tab, string][]).map(([k, l]) => (
              <button key={k} className={tab === k ? 'on' : ''} onClick={() => setTab(k)}>{l}</button>
            ))}
          </div>
          <div className="tab-body">
            {tab === 'media' && <MediaBin store={store} addFiles={addFiles} time={time} onCompress={(id) => { const m = p.media.find((x) => x.id === id); if (m) { setQuick(quickProject(p, m)); setDrawer('export'); } }} />}
            {tab === 'text' && <TextPanel store={store} time={time} setSel={setSel} />}
            {tab === 'audio' && <AudioPanel store={store} time={time} addFiles={addFiles} sel={sel} beatsInfo={beatsInfo} />}
            {tab === 'style' && <StylePanel store={store} />}
          </div>
        </aside>
        <section className="ws-center">
          {!p.scenes.length && (
            <div className="empty-hint">
              <b>Start here</b>
              <span>Drop clips in <b>Media</b> and press ＋ (or “Merge all onto timeline”), or press <b>✨ Auto video</b> to build one from a list or open a ready example.</span>
            </div>
          )}
          <Player ref={player} project={p} onTime={onTime} onWarnings={onWarnings} edit={{
            selected: sel?.kind === 'overlay' ? sel.id : undefined,
            onPick: (id) => { if (id) { setSel({ kind: 'overlay', id }); } else if (sel?.kind === 'overlay') setSel(null); },
            onChange: (id, patch, key) => update((c) => ({ ...c, overlays: c.overlays.map((o) => (o.id === id ? { ...o, ...patch } : o)) }), key),
          }} />
          <div className="toolbar">
            <button className="tb" onClick={split} title="Split at playhead (S)">✂<span>Split</span></button>
            <button className="tb" onClick={deleteSel} disabled={!sel} title="Delete selected (Del)">🗑<span>Delete</span></button>
            <button className="tb" onClick={duplicateSel} disabled={!sel} title="Duplicate (Ctrl+D)">⧉<span>Copy</span></button>
            <span className="sep" />
            <button className="tb" onClick={setIn} title="Mark part start (I)">⇤<span>Start</span></button>
            <button className="tb" onClick={setOut} title="Mark part end (O)">⇥<span>End</span></button>
            <button className="tb" onClick={delRange} disabled={!hasRange} title="Delete the marked part from all tracks (Shift+Del)">⌫<span>Cut part</span></button>
            <button className="tb" onClick={keepPart} disabled={!hasRange} title="Keep only the marked part">⬚<span>Keep part</span></button>
            {hasRange && <span className="small muted">{fmtTime(p.rangeIn!)}–{fmtTime(p.rangeOut!)}</span>}
            <span className="sep" />
            <button className="tb" onClick={() => { const o = newOverlay('title', time); update((c) => ({ ...c, overlays: [...c.overlays, o] })); setSel({ kind: 'overlay', id: o.id }); }} title="Add text at playhead (T)">🔤<span>Text</span></button>
            <button className="tb" onClick={snapshot} title="Save this frame as PNG">📷<span>Frame</span></button>
            <span className="grow" />
            <label className="small row" title="Snap edges to clips, beats and playhead"><input type="checkbox" checked={snapOn} onChange={(e) => setSnapOn(e.target.checked)} /> Snap</label>
            <button className="icon-btn" title="Zoom out (−)" onClick={() => setPps((x) => Math.max(4, x / 1.25))}>−</button>
            <button className="icon-btn" title="Zoom in (+)" onClick={() => setPps((x) => Math.min(300, x * 1.25))}>＋</button>
          </div>
          {toast && <div className="toast">{toast}</div>}
        </section>
        <aside className="ws-right card">
          <Inspector store={store} sel={sel} setSel={setSel} warnings={warnings} addFiles={addFiles} />
        </aside>
        <section className="ws-bottom"
          onDragOver={(e) => { if (e.dataTransfer.types.includes('text/media')) e.preventDefault(); }}
          onDrop={(e) => {
            const id = e.dataTransfer.getData('text/media');
            if (!id) return;
            e.preventDefault();
            const m = p.media.find((x) => x.id === id);
            if (!m) return;
            if (m.kind === 'audio') update((c) => ({ ...c, audio: [...c.audio, { id: uid('a'), mediaId: id, role: m.role === 'music' ? 'music' : 'voice', at: time, offset: 0, dur: m.duration, volume: 1, fadeIn: 0.3, fadeOut: 0.6, duck: m.role === 'music' }] }));
            else update(addClips(p, [id]));
          }}>
          <MultiTimeline store={store} time={time} sel={sel} onSelect={setSel} onSeek={(t) => player.current?.seek(t)} pps={pps} setPps={setPps} snapOn={snapOn} warnings={warnings} />
        </section>
      </div>

      {drawer === 'auto' && (
        <>
          <div className="drawer-bg" onClick={() => setDrawer(null)} />
          <aside className="drawer xl">
            <div className="row" style={{ justifyContent: 'space-between', position: 'sticky', top: -18, background: 'var(--bg)', padding: '8px 0', zIndex: 3 }}>
              <h2 style={{ fontSize: 18 }}>✨ Auto video — everything on one page</h2>
              <div className="row">
                <button className="btn primary" onClick={makeVideo}>✨ Make my video</button>
                <button className="icon-btn" onClick={() => setDrawer(null)}>×</button>
              </div>
            </div>
            <StepType store={store} onTemplate={onTemplate} />
            <StepFormat store={store} />
            <StepContent store={store} addFiles={addFiles} />
            <StepBites store={store} />
            <div className="row" style={{ justifyContent: 'flex-end', margin: '16px 0' }}><button className="btn primary big" onClick={makeVideo}>✨ Make my video</button></div>
          </aside>
        </>
      )}
      {drawer === 'export' && (
        <>
          <div className="drawer-bg" onClick={() => setDrawer(null)} />
          <aside className="drawer lg">
            <div className="row" style={{ justifyContent: 'flex-end' }}><button className="icon-btn" onClick={() => setDrawer(null)}>×</button></div>
            <StepExport project={quick ?? p} quick={!!quick} title={quick ? `Compress “${quick.name}”` : undefined} />
          </aside>
        </>
      )}
      {drawer === 'projects' && (
        <ProjectsDrawer
          project={p}
          onClose={() => setDrawer(null)}
          onOpen={(np) => { reset(migrate(np)); dirty.current = true; setSel(null); }}
          onNew={() => { reset(defaultProject()); dirty.current = false; setSel(null); }}
        />
      )}
    </div>
  );
}
