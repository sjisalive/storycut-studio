import { useState } from 'react';
import type { Store } from '../store';
import { VIDEO_TYPES, videoType } from '../presets';
import { TEMPLATES } from '../templates';
import { PageHead } from './common';

export function StepType({ store, onTemplate }: { store: Store; onTemplate: (id: string) => Promise<void> }) {
  const { project: p, update } = store;
  const [busy, setBusy] = useState('');
  const pick = (id: typeof p.videoType) => {
    const vt = videoType(id);
    const lang = p.lang === 'hi' || p.lang === 'mr' ? 'hi' : 'en';
    update({ videoType: id, pace: vt.pace, hookLines: vt.text[lang].hook, headline: vt.text[lang].headline, cta: { ...p.cta, title: vt.text[lang].cta, subtitle: vt.text[lang].ctaSub } });
  };
  return (
    <>
      <PageHead title="What are you making?" sub="Pick a video type. It sets the scene order, pace, music mood and starter text — you can change everything later." />
      <div className="grid g4">
        {VIDEO_TYPES.map((v) => (
          <button key={v.id} className={`choice ${p.videoType === v.id ? 'on' : ''}`} onClick={() => pick(v.id)}>
            <span className="big">{v.emoji}</span>
            <b>{v.label}</b>
            <span>{v.hint}</span>
          </button>
        ))}
      </div>
      <div className="card" style={{ marginTop: 20 }}>
        <h3>Or start from a ready example</h3>
        <p className="muted small" style={{ marginTop: -4 }}>Each one is a complete 30-second video with placeholder photos and music. Swap in your own content and clips.</p>
        <div className="grid g4">
          {TEMPLATES.map((t) => (
            <button key={t.id} className="choice" disabled={!!busy} onClick={async () => { setBusy(t.id); try { await onTemplate(t.id); } finally { setBusy(''); } }}>
              <span className="big">{videoType(t.type).emoji}</span>
              <b>{t.name}</b>
              <span>{busy === t.id ? 'Preparing…' : `${videoType(t.type).label} · ${t.aspect}`}</span>
            </button>
          ))}
        </div>
      </div>
    </>
  );
}
