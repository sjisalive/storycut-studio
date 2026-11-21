import { useCallback, useEffect, useRef, useState } from 'react';
import type { MediaItem, MediaRole } from './types';
import { useProjectHistory } from './store';
import { assemble, defaultProject } from './assemble';
import { getAudioBuffer, guessRole, readMedia } from './media';
import { detectBeats, loopBeats } from './audio/beats';
import { saveProject } from './projects';
import { buildTemplate } from './templates';
import { uid } from './util';
import { Stepper, STEPS } from './components/common';
import { StepType } from './components/StepType';
import { StepFormat } from './components/StepFormat';
import { StepMedia } from './components/StepMedia';
import { StepContent } from './components/StepContent';
import { StepBites } from './components/StepBites';
import { StepPreview } from './components/StepPreview';
import { StepExport } from './components/StepExport';
import { ProjectsDrawer } from './components/ProjectsDrawer';

type NewFile = File | { blob: Blob; name: string; role?: MediaRole };

export default function App() {
  const store = useProjectHistory(defaultProject());
  const { project: p, update, silent, silentAll, undo, redo, reset, canUndo, canRedo } = store;
  const [step, setStep] = useState(0);
  const [maxDone, setMaxDone] = useState(-1);
  const [drawer, setDrawer] = useState(false);
  const [savedAt, setSavedAt] = useState<number | null>(null);
  const [beatsInfo, setBeatsInfo] = useState('');
  const [busy, setBusy] = useState('');
  const dirty = useRef(false);

  const go = (i: number) => { setMaxDone((m) => Math.max(m, step)); setStep(i); window.scrollTo({ top: 0, behavior: 'smooth' }); };

  const addFiles = useCallback(async (files: NewFile[]) => {
    const items = files.map((f) => {
      const blob = f instanceof File ? f : f.blob;
      const name = f instanceof File ? f.name : f.name;
      const role = f instanceof File ? undefined : f.role;
      const kind: MediaItem['kind'] = blob.type.startsWith('video') ? 'video' : blob.type.startsWith('audio') || /\.(mp3|wav|m4a|ogg|webm)$/i.test(name) && !blob.type.startsWith('video') ? 'audio' : 'image';
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
        const media = cur.media.map((x) => (x.id === it.id ? m : x));
        const musicId = cur.musicId ?? (m.role === 'music' && m.status === 'ready' ? m.id : undefined);
        const logoId = cur.cta.logoId ?? (m.role === 'logo' && m.status === 'ready' ? m.id : undefined);
        return { ...cur, media, musicId, cta: { ...cur.cta, logoId } };
      });
    }));
    return items.map((i) => i.id);
  }, [update, silentAll]);

  // Beat detection when the music changes
  useEffect(() => {
    let live = true;
    if (!p.musicId) { setBeatsInfo(''); return; }
    const id = p.musicId;
    getAudioBuffer(id).then((buf) => {
      if (!live || !buf) return;
      const det = detectBeats(buf);
      setBeatsInfo(det.bpm ? `About ${det.bpm} beats per minute — cuts can follow the beat.` : 'No steady beat found.');
      const beats = loopBeats(det.beats, buf.duration, 600);
      silentAll((cur) => (cur.musicId === id ? { ...cur, beats } : cur));
    });
    return () => { live = false; };
  }, [p.musicId, p.media.find((m) => m.id === p.musicId)?.status]); // eslint-disable-line

  // Autosave to this browser
  useEffect(() => {
    if (!dirty.current) { dirty.current = canUndo || p.scenes.length > 0; if (!dirty.current) return; }
    if (p.media.some((m) => m.status === 'reading')) return;
    const t = setTimeout(() => { saveProject(p).then(() => setSavedAt(Date.now())).catch(() => {}); }, 1500);
    return () => clearTimeout(t);
  }, [p, canUndo]);

  // Undo / redo shortcuts (inputs keep their own text undo)
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement)?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA') return;
      if (!(e.ctrlKey || e.metaKey)) return;
      const k = e.key.toLowerCase();
      if (k === 'z' && !e.shiftKey) { e.preventDefault(); undo(); }
      else if ((k === 'z' && e.shiftKey) || k === 'y') { e.preventDefault(); redo(); }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [undo, redo]);

  const makeVideo = () => {
    if (p.scenes.length && step === 5 && !confirm('Build the video again from the content list? Your scene edits will be replaced (you can undo).')) return;
    update((cur) => ({ ...cur, scenes: assemble(cur) }));
    go(5);
  };
  const onTemplate = async (id: string) => {
    setBusy('Preparing the example…');
    try {
      const proj = await buildTemplate(id, setBusy);
      reset(proj);
      dirty.current = true;
      setMaxDone(4);
      setStep(5);
      window.scrollTo(0, 0);
    } finally { setBusy(''); }
  };

  const readyVisuals = p.media.filter((m) => m.status === 'ready' && m.kind !== 'audio').length;
  const next = () => {
    if (step === 4 || (step === 3 && !p.media.some((m) => m.kind === 'video'))) {
      if (!p.scenes.length) { update((cur) => ({ ...cur, scenes: assemble(cur) })); }
      go(5);
    } else go(Math.min(STEPS.length - 1, step + 1));
  };

  return (
    <div className="app">
      <header className="header">
        <div className="logo">▶</div>
        <span className="brand">StoryCut Studio</span>
        <input className="name" value={p.name} onChange={(e) => update({ name: e.target.value }, 'name')} aria-label="Project name" />
        <span className="spacer" />
        {savedAt && <span className="saved hide-sm">Saved {new Date(savedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>}
        <button className="icon-btn" title="Undo (Ctrl+Z)" disabled={!canUndo} onClick={undo}>↶</button>
        <button className="icon-btn" title="Redo (Ctrl+Shift+Z)" disabled={!canRedo} onClick={redo}>↷</button>
        <button className="btn small" onClick={() => setDrawer(true)}>📁 Projects</button>
        <span className="safe-note">🔒 Files stay on this computer</span>
      </header>
      <Stepper step={step} maxDone={maxDone} onGo={go} />
      <main key={step}>
        {busy && <div className="note">{busy}</div>}
        {step === 0 && <StepType store={store} onTemplate={onTemplate} />}
        {step === 1 && <StepFormat store={store} />}
        {step === 2 && <StepMedia store={store} addFiles={addFiles} beatsInfo={beatsInfo} />}
        {step === 3 && <StepContent store={store} addFiles={addFiles} />}
        {step === 4 && <StepBites store={store} />}
        {step === 5 && <StepPreview store={store} onRebuild={makeVideo} addFiles={addFiles} />}
        {step === 6 && <StepExport store={store} />}
      </main>
      <div className="bottombar">
        <div className="inner">
          <button className="btn" disabled={step === 0} onClick={() => go(step - 1)}>← Back</button>
          <span className="small muted hide-sm">Step {step + 1} of {STEPS.length} · {STEPS[step]}{step >= 2 ? ` · ${readyVisuals} photos/clips, ${p.rows.filter((r) => r.title).length} items` : ''}</span>
          <span className="grow" />
          {step >= 2 && step <= 4 && <button className="btn primary big" onClick={makeVideo}>✨ Make my video</button>}
          {step < STEPS.length - 1 && <button className={`btn ${step < 2 || step >= 5 ? 'primary big' : ''}`} onClick={next}>{step === 5 ? 'Save video →' : step === 4 ? 'Preview →' : 'Next →'}</button>}
        </div>
      </div>
      {drawer && (
        <ProjectsDrawer
          project={p}
          onClose={() => setDrawer(false)}
          onOpen={(np) => { reset(np); dirty.current = true; setStep(np.scenes.length ? 5 : 3); setMaxDone(np.scenes.length ? 4 : 2); }}
          onNew={() => { reset(defaultProject()); dirty.current = false; setStep(0); setMaxDone(-1); }}
        />
      )}
    </div>
  );
}
