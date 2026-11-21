import { useRef, useState } from 'react';
import type { Store } from '../store';
import type { ContentRow, MediaItem, MediaRole } from '../types';
import { newRow } from '../assemble';
import { LANGS } from '../presets';
import { makeCutout } from '../cutout';
import { MediaPicker, More, Note, PageHead } from './common';

/** Parse CSV or TSV (handles quotes). */
export function parseTable(text: string): string[][] {
  const sep = text.includes('\t') ? '\t' : ',';
  const rows: string[][] = [];
  let cur: string[] = [], field = '', q = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (q) {
      if (c === '"' && text[i + 1] === '"') { field += '"'; i++; }
      else if (c === '"') q = false;
      else field += c;
    } else if (c === '"' && field === '') q = true;
    else if (c === sep) { cur.push(field); field = ''; }
    else if (c === '\n' || c === '\r') {
      if (c === '\r' && text[i + 1] === '\n') i++;
      cur.push(field); field = '';
      if (cur.some((x) => x.trim())) rows.push(cur);
      cur = [];
    } else field += c;
  }
  cur.push(field);
  if (cur.some((x) => x.trim())) rows.push(cur);
  return rows.map((r) => r.map((x) => x.trim()));
}

function rowsFromTable(table: string[][], media: MediaItem[]): ContentRow[] {
  if (!table.length) return [];
  const head = table[0].map((h) => h.toLowerCase());
  const has = (re: RegExp) => head.findIndex((h) => re.test(h));
  const isHeader = has(/title|name|heading|शीर्षक/) >= 0;
  const idx = isHeader
    ? { title: has(/title|name|heading|शीर्षक/), sub: has(/sub|line|desc|detail/), hl: has(/highlight|number|price|tag|stat|value/), badge: has(/badge|note|label/), media: has(/media|file|photo|image|clip|video/), second: has(/second|hindi|english|translation/) }
    : { title: 0, sub: 1, hl: 2, badge: 3, media: 4, second: 5 };
  const body = isHeader ? table.slice(1) : table;
  const get = (r: string[], i: number) => (i >= 0 ? r[i] ?? '' : '');
  return body.map((r) => {
    const mname = get(r, idx.media).toLowerCase();
    const m = mname ? media.find((x) => x.name.toLowerCase() === mname || x.name.toLowerCase().startsWith(mname)) : undefined;
    return newRow({ title: get(r, idx.title), subtitle: get(r, idx.sub), highlight: get(r, idx.hl), badge: get(r, idx.badge), mediaId: m?.id, second: get(r, idx.second) || undefined });
  });
}

export function StepContent({ store, addFiles }: { store: Store; addFiles: (f: { blob: Blob; name: string; role?: MediaRole }[]) => Promise<unknown> }) {
  const { project: p, update } = store;
  const csv = useRef<HTMLInputElement>(null);
  const [cutMsg, setCutMsg] = useState('');
  const [cutFrom, setCutFrom] = useState<string | undefined>();
  const setRow = (id: string, patch: Partial<ContentRow>, field?: string) =>
    update((cur) => ({ ...cur, rows: cur.rows.map((r) => (r.id === id ? { ...r, ...patch } : r)) }), field ? `row-${id}-${field}` : undefined);
  const move = (i: number, d: number) => update((cur) => {
    const rows = [...cur.rows];
    const j = i + d;
    if (j < 0 || j >= rows.length) return cur;
    [rows[i], rows[j]] = [rows[j], rows[i]];
    return { ...cur, rows };
  });

  const onPaste = (e: React.ClipboardEvent) => {
    const text = e.clipboardData.getData('text/plain');
    if (!text.includes('\t') && !text.trim().includes('\n')) return;
    e.preventDefault();
    const at = Number((e.target as HTMLElement).closest('tr')?.getAttribute('data-i') ?? p.rows.length);
    const incoming = rowsFromTable(parseTable(text), p.media);
    update((cur) => {
      const rows = [...cur.rows];
      incoming.forEach((r, k) => {
        const i = at + k;
        if (i < rows.length && !rows[i].title && !rows[i].subtitle) rows[i] = { ...r, mediaId: r.mediaId ?? rows[i].mediaId };
        else rows.splice(i, 0, r);
      });
      return { ...cur, rows };
    });
  };
  const importCsv = async (f: File) => {
    const rows = rowsFromTable(parseTable(await f.text()), p.media);
    update((cur) => ({ ...cur, rows: [...cur.rows.filter((r) => r.title || r.subtitle || r.highlight || r.mediaId), ...rows] }));
  };
  const autoFillMedia = () => update((cur) => {
    const used = new Set(cur.rows.map((r) => r.mediaId).filter(Boolean));
    const pool = cur.media.filter((m) => m.status === 'ready' && (m.role === 'photo' || m.role === 'clip') && !used.has(m.id));
    return { ...cur, rows: cur.rows.map((r) => (r.mediaId || !pool.length ? r : { ...r, mediaId: pool.shift()!.id })) };
  });

  const doCutout = async () => {
    if (!cutFrom) return;
    try {
      const blob = await makeCutout(cutFrom, undefined, setCutMsg);
      setCutMsg('');
      await addFiles([{ blob, name: 'person-cutout.png', role: 'cutout' }]);
    } catch (e: any) {
      setCutMsg(`Could not cut out: ${e?.message ?? e}. This needs an internet connection the first time (to download the model).`);
    }
  };

  const l2 = p.lang2 ? LANGS.find((l) => l.code === p.lang2)?.label : '';
  const cta = p.cta;
  const setCta = (patch: Partial<typeof cta>, key: string) => update({ cta: { ...cta, ...patch } }, 'cta-' + key);

  return (
    <>
      <PageHead title="What should the video say?" sub="One row = one scene. Paste straight from Excel or Google Sheets, or import a CSV." />
      <div className="card">
        <div className="row" style={{ justifyContent: 'space-between', marginBottom: 8 }}>
          <h3 style={{ margin: 0 }}>Content list <span className="tag">{p.rows.length}</span></h3>
          <div className="row">
            <button className="btn small" onClick={autoFillMedia}>Fill empty media</button>
            <button className="btn small" onClick={() => csv.current?.click()}>Import CSV</button>
            <input ref={csv} type="file" hidden accept=".csv,.tsv,.txt" onChange={(e) => { const f = e.target.files?.[0]; if (f) importCsv(f); e.target.value = ''; }} />
            <button className="btn small primary" onClick={() => update((c) => ({ ...c, rows: [...c.rows, newRow()] }))}>＋ Add row</button>
          </div>
        </div>
        <div className="table-wrap" onPaste={onPaste}>
          <table className="content">
            <thead>
              <tr>
                <th></th><th>Media</th><th>Title</th><th>Subtitle / one-liner</th><th>Highlight</th><th>Badge / note</th>
                {l2 && <th>{l2} line</th>}<th></th>
              </tr>
            </thead>
            <tbody>
              {p.rows.map((r, i) => (
                <tr key={r.id} data-i={i}>
                  <td className="n">{i + 1}</td>
                  <td style={{ width: 64 }}><MediaPicker media={p.media} value={r.mediaId} onChange={(id) => setRow(r.id, { mediaId: id })} filter={(m) => m.kind !== 'audio' && m.role !== 'logo'} /></td>
                  <td><input type="text" value={r.title} placeholder="e.g. Butter Croissant" onChange={(e) => setRow(r.id, { title: e.target.value }, 't')} /></td>
                  <td><input type="text" value={r.subtitle} placeholder="One short line" onChange={(e) => setRow(r.id, { subtitle: e.target.value }, 's')} /></td>
                  <td style={{ width: 120 }}><input type="text" value={r.highlight} placeholder="₹499 · 4.8★" onChange={(e) => setRow(r.id, { highlight: e.target.value }, 'h')} /></td>
                  <td style={{ width: 140 }}><input type="text" value={r.badge} placeholder="New" list="badges" onChange={(e) => setRow(r.id, { badge: e.target.value }, 'b')} /></td>
                  {l2 && <td><input type="text" value={r.second ?? ''} placeholder={`${l2} subtitle`} onChange={(e) => setRow(r.id, { second: e.target.value }, '2')} /></td>}
                  <td style={{ whiteSpace: 'nowrap', width: 90 }}>
                    <button className="icon-btn" title="Move up" onClick={() => move(i, -1)}>↑</button>
                    <button className="icon-btn" title="Move down" onClick={() => move(i, 1)}>↓</button>
                    <button className="icon-btn" title="Delete row" onClick={() => update((c) => ({ ...c, rows: c.rows.filter((x) => x.id !== r.id) }))}>×</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <datalist id="badges">
            {['New', 'Bestseller', 'Sold out', 'Limited', 'Few left', 'Representative image', 'Coming soon', 'नया'].map((b) => <option key={b} value={b} />)}
          </datalist>
        </div>
        <p className="small muted">Tip: copy cells in Excel (Title, Subtitle, Highlight, Badge, Media file name) and press Ctrl+V in any box. Numbers in Highlight count up on screen.</p>
      </div>

      <div className="grid g2">
        <div className="card">
          <h3>Opening</h3>
          <label className="field">Big opening lines (one per line)
            <textarea rows={3} value={p.hookLines.join('\n')} onChange={(e) => update({ hookLines: e.target.value.split('\n') }, 'hook')} />
          </label>
          <p className="small muted">Put a word between *stars* for the accent colour, or _underscores_ for the second colour.</p>
          <label className="field">Main message (headline card)
            <textarea rows={2} value={p.headline} onChange={(e) => update({ headline: e.target.value }, 'headline')} />
          </label>
        </div>
        <div className="card">
          <h3>Ending (call to action)</h3>
          <div className="grid g2">
            <label className="field">Title<input type="text" value={cta.title} onChange={(e) => setCta({ title: e.target.value }, 'title')} /></label>
            <label className="field">Subtitle<input type="text" value={cta.subtitle} onChange={(e) => setCta({ subtitle: e.target.value }, 'sub')} /></label>
            <label className="field">Website<input type="text" value={cta.website} onChange={(e) => setCta({ website: e.target.value }, 'web')} /></label>
            <label className="field">Phone / email<input type="text" value={cta.contact} onChange={(e) => setCta({ contact: e.target.value }, 'contact')} /></label>
            <label className="field">Date & venue<input type="text" value={cta.dateVenue} onChange={(e) => setCta({ dateVenue: e.target.value }, 'dv')} /></label>
            <label className="field">Social handles<input type="text" value={cta.social} onChange={(e) => setCta({ social: e.target.value }, 'social')} /></label>
          </div>
          <label className="field" style={{ marginTop: 8 }}>QR code link (leave empty for none)<input type="text" value={cta.qr} placeholder="https://…" onChange={(e) => setCta({ qr: e.target.value }, 'qr')} /></label>
          <div className="row" style={{ marginTop: 10 }}>
            <span className="small muted">Logo</span>
            <MediaPicker media={p.media} value={cta.logoId} onChange={(id) => setCta({ logoId: id }, 'logo')} filter={(m) => m.kind === 'image'} size={44} />
            <span className="small muted" style={{ marginLeft: 12 }}>Person cut-out</span>
            <MediaPicker media={p.media} value={cta.cutoutId} onChange={(id) => setCta({ cutoutId: id }, 'cut')} filter={(m) => m.kind === 'image'} size={44} />
          </div>
          <More label="Make a person cut-out (remove background)">
            <div className="row">
              <MediaPicker media={p.media} value={cutFrom} onChange={setCutFrom} filter={(m) => m.kind === 'image' || m.kind === 'video'} size={44} />
              <button className="btn small" disabled={!cutFrom} onClick={doCutout}>Remove background</button>
            </div>
            {cutMsg && <Note>{cutMsg}</Note>}
            <p className="small muted">Runs in this browser. The first time it downloads a small model (about 25 MB) from Hugging Face; your photo is not uploaded.</p>
          </More>
        </div>
      </div>
    </>
  );
}
