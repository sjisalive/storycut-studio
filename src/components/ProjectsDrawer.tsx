import { useEffect, useRef, useState } from 'react';
import type { Project } from '../types';
import { deleteProject, listProjects, loadProject, openProjectFile, saveProject, saveProjectFile, type ProjectMeta } from '../projects';
import { uid } from '../util';
import { Note } from './common';

export function ProjectsDrawer({ project, onClose, onOpen, onNew }: {
  project: Project; onClose: () => void; onOpen: (p: Project) => void; onNew: () => void;
}) {
  const [list, setList] = useState<ProjectMeta[]>([]);
  const [msg, setMsg] = useState('');
  const [busy, setBusy] = useState(false);
  const file = useRef<HTMLInputElement>(null);
  const refresh = () => listProjects().then(setList);
  useEffect(() => { refresh(); }, []);

  const wrap = async (f: () => Promise<void>) => { setBusy(true); setMsg(''); try { await f(); } catch (e: any) { setMsg(e?.message ?? String(e)); } finally { setBusy(false); } };
  const open = (m: ProjectMeta) => wrap(async () => {
    setMsg('Opening…');
    const p = await loadProject(m.id, (n, t) => setMsg(`Loading media ${n}/${t}…`));
    if (!p) throw new Error('Project not found');
    onOpen(m.isTemplate ? { ...p, id: uid('p'), name: `${p.name} (new)`, isTemplate: false } : p);
    onClose();
  });
  const saved = list.filter((x) => !x.isTemplate);
  const templates = list.filter((x) => x.isTemplate);
  const Item = ({ m }: { m: ProjectMeta }) => (
    <div className="li">
      <div className="thumb" style={{ backgroundImage: m.thumb ? `url(${m.thumb})` : undefined }}>{!m.thumb && '🎬'}</div>
      <div className="grow">
        <div style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{m.name}{m.id === project.id && <span className="tag green" style={{ marginLeft: 6 }}>open</span>}</div>
        <div className="small muted">{m.aspect} · {new Date(m.updated).toLocaleString()}</div>
      </div>
      <button className="btn small" disabled={busy} onClick={() => open(m)}>{m.isTemplate ? 'Use' : 'Open'}</button>
      <button className="icon-btn" title="Delete" onClick={() => wrap(async () => { if (confirm(`Delete “${m.name}”?`)) { await deleteProject(m.id); await refresh(); } })}>×</button>
    </div>
  );

  return (
    <>
      <div className="drawer-bg" onClick={onClose} />
      <aside className="drawer">
        <div className="row" style={{ justifyContent: 'space-between', marginBottom: 12 }}>
          <h2 style={{ fontSize: 18 }}>Projects</h2>
          <button className="icon-btn" onClick={onClose}>×</button>
        </div>
        <div className="card">
          <div className="row">
            <button className="btn primary" onClick={() => { onNew(); onClose(); }}>＋ New project</button>
            <button className="btn" disabled={busy} onClick={() => wrap(async () => { await saveProject(project); await refresh(); setMsg('Saved in this browser.'); })}>Save now</button>
            <button className="btn" disabled={busy} onClick={() => wrap(async () => { await saveProject({ ...project, id: uid('p'), name: `${project.name} template` }, { asTemplate: true }); await refresh(); setMsg('Saved as a template. Next time pick it, then just change the list and clips.'); })}>Save as template</button>
          </div>
          <div className="row" style={{ marginTop: 10 }}>
            <button className="btn small" disabled={busy} onClick={() => wrap(() => saveProjectFile(project))}>⬇ Save project file</button>
            <button className="btn small" disabled={busy} onClick={() => file.current?.click()}>⬆ Open project file</button>
            <input ref={file} type="file" hidden accept=".storycut,.zip" onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ''; if (f) wrap(async () => { setMsg('Opening…'); onOpen(await openProjectFile(f)); onClose(); }); }} />
          </div>
          <p className="small muted">Projects save automatically in this browser. A project file (.storycut) carries everything — media included — to another computer.</p>
          {msg && <Note>{msg}</Note>}
        </div>
        <div className="card">
          <h3>Saved here <span className="tag">{saved.length}</span></h3>
          <div className="list">{saved.map((m) => <Item key={m.id} m={m} />)}{!saved.length && <span className="small muted">Nothing saved yet.</span>}</div>
        </div>
        <div className="card">
          <h3>My templates <span className="tag">{templates.length}</span></h3>
          <div className="list">{templates.map((m) => <Item key={m.id} m={m} />)}{!templates.length && <span className="small muted">Use “Save as template” to reuse a look and scene plan.</span>}</div>
        </div>
      </aside>
    </>
  );
}
