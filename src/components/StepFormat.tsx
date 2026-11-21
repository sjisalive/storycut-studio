import { useEffect, useState } from 'react';
import type { Store } from '../store';
import type { BrandKit, ShapeSet, StyleColors } from '../types';
import { ASPECTS, FONTS, LANGS, LENGTHS, STYLE_PACKS } from '../presets';
import { getBrand, getStoredBlob, saveBrand } from '../projects';
import { readMedia, getBlob } from '../media';
import { uid } from '../util';
import { More, Note, PageHead } from './common';

const COLOR_LABELS: [keyof StyleColors, string][] = [
  ['bg', 'Background'], ['bg2', 'Background 2'], ['text', 'Text'], ['accent', 'Accent'], ['accent2', 'Accent 2'], ['panel', 'Panel'], ['panelText', 'Panel text'],
];

export function StepFormat({ store }: { store: Store }) {
  const { project: p, update } = store;
  const [brand, setBrand] = useState<BrandKit | null>(null);
  const [msg, setMsg] = useState('');
  useEffect(() => { getBrand().then(setBrand); }, []);

  const applyBrand = async () => {
    const b = brand ?? (await getBrand());
    if (!b) return;
    let media = p.media;
    let logoId = p.cta.logoId;
    if (b.logoId) {
      if (!media.some((m) => m.id === b.logoId)) {
        const blob = getBlob(b.logoId) ?? (await getStoredBlob(b.logoId));
        if (blob) media = [...media, await readMedia(blob, 'brand-logo.png', { id: b.logoId, role: 'logo' })];
      }
      logoId = b.logoId;
    }
    update({
      media,
      style: { ...p.style, colors: { ...p.style.colors, ...(b.colors ?? {}) }, fontHead: b.fontHead || p.style.fontHead, fontBody: b.fontBody || p.style.fontBody },
      cta: { ...p.cta, logoId },
    });
    setMsg('Your brand is applied.');
  };

  const saveMyBrand = async () => {
    const logo = p.media.find((m) => m.id === p.cta.logoId) ?? p.media.find((m) => m.role === 'logo');
    const b: BrandKit = {
      name: p.name, colors: { ...p.style.colors }, fontHead: p.style.fontHead, fontBody: p.style.fontBody,
      logoId: logo ? logo.id : undefined, logoDataUrl: logo?.thumb,
    };
    await saveBrand(b, logo ? getBlob(logo.id) : undefined);
    setBrand(b);
    setMsg('Saved. Use "Apply my brand" on any project.');
  };

  const setColor = (k: keyof StyleColors, v: string) => update({ style: { ...p.style, colors: { ...p.style.colors, [k]: v } } }, 'color-' + k);

  return (
    <>
      <PageHead title="How should it look?" sub="Choose the shape of the video, how long it runs, the language and a style." />
      <div className="card">
        <h3>Shape</h3>
        <div className="grid g4">
          {ASPECTS.map((a) => (
            <button key={a.key} className={`choice ${p.aspect === a.key ? 'on' : ''}`} onClick={() => update({ aspect: a.key })}>
              <div style={{ height: 44, display: 'flex', alignItems: 'center' }}>
                <div style={{ width: (a.w / Math.max(a.w, a.h)) * 44, height: (a.h / Math.max(a.w, a.h)) * 44, border: '2px solid var(--check)', borderRadius: 4 }} />
              </div>
              <b>{a.label}</b><span>{a.hint}</span>
            </button>
          ))}
        </div>
      </div>
      <div className="grid g2">
        <div className="card">
          <h3>Length</h3>
          <div className="row">
            {LENGTHS.map((l) => (
              <button key={l} className={`btn ${p.targetLength === l ? 'primary' : ''}`} onClick={() => update({ targetLength: l })}>{l < 60 ? `${l} s` : `${l / 60} min`}</button>
            ))}
          </div>
          <label className="field" style={{ marginTop: 14 }}>Pace: {p.pace < 0.34 ? 'Calm' : p.pace < 0.67 ? 'Steady' : 'Energetic'}
            <input type="range" min={0} max={1} step={0.05} value={p.pace} onChange={(e) => update({ pace: +e.target.value }, 'pace')} />
          </label>
          <div className="row small muted" style={{ justifyContent: 'space-between' }}><span>Calm</span><span>Energetic</span></div>
        </div>
        <div className="card">
          <h3>Language</h3>
          <div className="grid g2">
            <label className="field">Main language
              <select value={p.lang} onChange={(e) => update({ lang: e.target.value as any })}>
                {LANGS.map((l) => <option key={l.code} value={l.code}>{l.label} · {l.native}</option>)}
              </select>
            </label>
            <label className="field">Second-language subtitle line
              <select value={p.lang2} onChange={(e) => update({ lang2: e.target.value as any })}>
                <option value="">None</option>
                {LANGS.filter((l) => l.code !== p.lang).map((l) => <option key={l.code} value={l.code}>{l.label} · {l.native}</option>)}
              </select>
            </label>
          </div>
          <p className="small muted">Indian scripts are drawn with proper joining (Noto Sans Devanagari, Bengali, Tamil, Telugu, Gujarati, Mukta, Hind are built in).</p>
        </div>
      </div>
      <div className="card">
        <div className="row" style={{ justifyContent: 'space-between' }}>
          <h3>Style</h3>
          <div className="row">
            <button className="btn small" disabled={!brand} onClick={applyBrand} title={brand ? '' : 'Save a brand first'}>Apply my brand</button>
            <button className="btn small" onClick={saveMyBrand}>Save this look as my brand</button>
          </div>
        </div>
        {msg && <Note>{msg}</Note>}
        <div className="grid g4">
          {STYLE_PACKS.map((s) => (
            <button key={s.id} className={`choice style-card ${p.style.id === s.id ? 'on' : ''}`} onClick={() => update({ style: structuredClone(s) })}>
              <div className="bar">{[s.colors.bg, s.colors.bg2, s.colors.accent, s.colors.accent2, s.colors.panel].map((c, i) => <i key={i} style={{ background: c }} />)}</div>
              <b style={{ fontFamily: s.fontHead }}>{s.name}</b>
              <span>{s.fontHead} · {s.shape}</span>
            </button>
          ))}
        </div>
        <More label="Fine-tune colours and fonts">
          <div className="grid g4">
            {COLOR_LABELS.map(([k, label]) => (
              <label key={k} className="field">{label}
                <input type="color" value={p.style.colors[k]} onChange={(e) => setColor(k, e.target.value)} style={{ width: '100%', height: 34, border: '1px solid var(--line)', borderRadius: 8 }} />
              </label>
            ))}
          </div>
          <div className="grid g4" style={{ marginTop: 10 }}>
            <label className="field">Heading font
              <select value={p.style.fontHead} onChange={(e) => update({ style: { ...p.style, fontHead: e.target.value } })}>{FONTS.map((f) => <option key={f}>{f}</option>)}</select>
            </label>
            <label className="field">Body font
              <select value={p.style.fontBody} onChange={(e) => update({ style: { ...p.style, fontBody: e.target.value } })}>{FONTS.map((f) => <option key={f}>{f}</option>)}</select>
            </label>
            <label className="field">Shapes
              <select value={p.style.shape} onChange={(e) => update({ style: { ...p.style, shape: e.target.value as ShapeSet } })}>
                <option value="geometric">Geometric</option><option value="swoosh">Swoosh</option><option value="lines">Minimal lines</option><option value="glass">Glass</option>
              </select>
            </label>
            <label className="field">Motion speed
              <input type="range" min={0.6} max={1.5} step={0.05} value={p.style.motion} onChange={(e) => update({ style: { ...p.style, motion: +e.target.value } }, 'motion')} />
            </label>
          </div>
          {brand && <p className="small muted">Saved brand: {brand.name}{brand.logoDataUrl && <img src={brand.logoDataUrl} alt="" style={{ height: 20, verticalAlign: 'middle', marginLeft: 8 }} />}</p>}
        </More>
      </div>
    </>
  );
}

export const newBrandId = () => uid('brandlogo');
