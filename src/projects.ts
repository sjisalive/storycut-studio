// Save / load projects in this browser (IndexedDB) and as portable .storycut files.
import { createStore, del, get, set } from 'idb-keyval';
import { strFromU8, strToU8, unzip, zip } from 'fflate';
import type { BrandKit, Project } from './types';
import { getBlob, readMedia } from './media';
import { download } from './util';
import { migrate } from './edit';

const store = createStore('storycut-studio', 'kv');

export interface ProjectMeta { id: string; name: string; updated: number; isTemplate?: boolean; thumb?: string; videoType: string; aspect: string }

export async function listProjects(): Promise<ProjectMeta[]> {
  return ((await get('index', store)) as ProjectMeta[] | undefined) ?? [];
}

export async function saveProject(p: Project, opts: { asTemplate?: boolean; thumb?: string } = {}) {
  const proj: Project = { ...p, updated: Date.now(), isTemplate: opts.asTemplate ?? p.isTemplate };
  for (const m of proj.media) {
    const b = getBlob(m.id);
    if (b && !(await get(`blob:${m.id}`, store))) await set(`blob:${m.id}`, b, store);
  }
  await set(`proj:${proj.id}`, proj, store);
  const idx = (await listProjects()).filter((x) => x.id !== proj.id);
  const thumb = opts.thumb ?? proj.media.find((m) => m.thumb && (m.role === 'clip' || m.role === 'photo'))?.thumb;
  idx.unshift({ id: proj.id, name: proj.name, updated: proj.updated, isTemplate: proj.isTemplate, thumb, videoType: proj.videoType, aspect: proj.aspect });
  await set('index', idx, store);
  return proj;
}

export async function loadProject(id: string, onProgress?: (n: number, total: number) => void): Promise<Project | null> {
  const p = (await get(`proj:${id}`, store)) as Project | undefined;
  if (!p) return null;
  const media = [];
  let n = 0;
  for (const m of p.media) {
    const blob = (await get(`blob:${m.id}`, store)) as Blob | undefined;
    onProgress?.(++n, p.media.length);
    if (!blob) { media.push({ ...m, status: 'error' as const, error: 'File missing — please add it again' }); continue; }
    const fresh = await readMedia(blob, m.name, { id: m.id, role: m.role, placeholder: m.placeholder });
    media.push({ ...fresh, role: m.role });
  }
  return migrate({ ...p, media });
}

export async function deleteProject(id: string) {
  const p = (await get(`proj:${id}`, store)) as Project | undefined;
  await del(`proj:${id}`, store);
  const idx = (await listProjects()).filter((x) => x.id !== id);
  await set('index', idx, store);
  if (!p) return;
  // remove blobs not used by any other project
  const others = await Promise.all(idx.map((x) => get(`proj:${x.id}`, store) as Promise<Project | undefined>));
  const keep = new Set(others.flatMap((o) => o?.media.map((m) => m.id) ?? []));
  const brand = await getBrand();
  if (brand?.logoId) keep.add(brand.logoId);
  for (const m of p.media) if (!keep.has(m.id)) await del(`blob:${m.id}`, store);
}

export async function getBrand(): Promise<BrandKit | null> { return ((await get('brand', store)) as BrandKit) ?? null; }
export async function saveBrand(b: BrandKit, logo?: Blob) {
  if (logo && b.logoId) await set(`blob:${b.logoId}`, logo, store);
  await set('brand', b, store);
}
export async function getStoredBlob(id: string) { return (await get(`blob:${id}`, store)) as Blob | undefined; }

// ------------------------------------------------------------ portable file
const safeName = (s: string) => s.replace(/[^\w\-.]+/g, '_').slice(0, 60) || 'file';

export async function projectFile(p: Project): Promise<Blob> {
  const files: Record<string, Uint8Array> = { 'project.json': strToU8(JSON.stringify(p, null, 1)) };
  for (const m of p.media) {
    const b = getBlob(m.id);
    if (b) files[`media/${m.id}__${safeName(m.name)}`] = new Uint8Array(await b.arrayBuffer());
  }
  const data = await new Promise<Uint8Array>((res, rej) => zip(files, { level: 0 }, (e, d) => (e ? rej(e) : res(d))));
  return new Blob([data as BlobPart], { type: "application/zip" });
}

export async function saveProjectFile(p: Project) {
  const blob = await projectFile(p);
  const name = `${safeName(p.name)}.storycut`;
  const picker = (window as any).showSaveFilePicker;
  if (picker) {
    try {
      const handle = await picker({ suggestedName: name, types: [{ description: 'StoryCut project', accept: { 'application/zip': ['.storycut'] } }] });
      const w = await handle.createWritable();
      await w.write(blob);
      await w.close();
      return;
    } catch (e: any) {
      if (e?.name === 'AbortError') return;
    }
  }
  download(blob, name);
}

export async function openProjectFile(file: Blob): Promise<Project> {
  const buf = new Uint8Array(await file.arrayBuffer());
  const files = await new Promise<Record<string, Uint8Array>>((res, rej) => unzip(buf, (e, d) => (e ? rej(e) : res(d))));
  if (!files['project.json']) throw new Error('This is not a StoryCut project file');
  const p = JSON.parse(strFromU8(files['project.json'])) as Project;
  const media = [];
  for (const m of p.media) {
    const key = Object.keys(files).find((k) => k.startsWith(`media/${m.id}__`));
    if (!key) { media.push({ ...m, status: 'error' as const, error: 'Missing from project file' }); continue; }
    const fresh = await readMedia(new Blob([files[key] as BlobPart], { type: m.mime }), m.name, { id: m.id, role: m.role, placeholder: m.placeholder });
    media.push({ ...fresh, role: m.role });
  }
  return migrate({ ...p, media });
}
