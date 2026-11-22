import { useEffect, useState } from 'react';
import { isVoiceDownloaded, sentences, speak, VOICES } from '../audio/tts';
import { Note, Progress } from './common';
import { DEFAULT_STUDIO, processSound } from '../audio/studio';
import { BufWave, FmtSelect, saveBuffer, secs, useBufferPlayer, type AudioFmt } from './audioUi';

const LANGS: [string, string][] = [['hi', 'हिन्दी Hindi'], ['en', 'English'], ['ml', 'മലയാളം Malayalam'], ['ne', 'नेपाली Nepali']];
const SAMPLE: Record<string, string> = {
  hi: 'नमस्कार। बिहार में बिजली व्यवस्था लगातार बेहतर हो रही है।\nइस वर्ष दो हज़ार नए ट्रांसफॉर्मर लगाए गए हैं, जिससे लाखों परिवारों को चौबीस घंटे बिजली मिल रही है।',
  en: 'Welcome. Power supply across Bihar keeps getting better.\nThis year, two thousand new transformers were installed, bringing round-the-clock electricity to lakhs of families.',
  ml: 'നമസ്കാരം. ഈ പുതിയ പദ്ധതി എല്ലാവർക്കും പ്രയോജനപ്പെടും.',
  ne: 'नमस्ते। यो नयाँ परियोजना सबैका लागि उपयोगी हुनेछ।',
};

/** 🗣 Voice-over from text. */
export function VoiceTab({ onStudio, onTimeline }: {
  onStudio: (buf: AudioBuffer, name: string) => void;
  onTimeline: (buf: AudioBuffer, name: string) => Promise<void>;
}) {
  const [lang, setLang] = useState('hi');
  const [voice, setVoice] = useState('kokoro:hm_omega');
  const [tone, setTone] = useState<'natural' | 'deep' | 'deeper'>('deep');
  const [polish, setPolish] = useState(true);
  const [text, setText] = useState('');
  const [speed, setSpeed] = useState(1);
  const [variation, setVariation] = useState(0.5);
  const [pause, setPause] = useState(0.6);
  const [busy, setBusy] = useState('');
  const [pct, setPct] = useState(0);
  const [out, setOut] = useState<AudioBuffer | null>(null);
  const [err, setErr] = useState('');
  const [msg, setMsg] = useState('');
  const [fmt, setFmt] = useState<AudioFmt>('mp3');
  const [have, setHave] = useState<Record<string, boolean>>({});
  const pl = useBufferPlayer();

  useEffect(() => {
    Promise.all(VOICES.map(async (v) => [v.id, await isVoiceDownloaded(v.id).catch(() => false)] as const)).then((r) => setHave(Object.fromEntries(r)));
  }, [busy]);

  const voices = VOICES.filter((v) => v.lang === lang);
  const words = text.trim() ? text.trim().split(/\s+/).length : 0;
  const estimate = words / (2.4 * speed) + sentences(text).length * 0.5 * pause;
  const name = `voiceover-${VOICES.find((v) => v.id === voice)?.label.split(' ')[0].toLowerCase() ?? 'voice'}${tone !== 'natural' ? `-${tone}` : ''}`;

  const make = async () => {
    setErr(''); setMsg(''); pl.stop();
    setBusy('Starting…'); setPct(0);
    try {
      let b = await speak(text, voice, { speed, variation, pause }, (stage, p) => { setBusy(stage); setPct(p); });
      if (tone !== 'natural' || polish) {
        // deeper voice keeps its natural character (formant-preserving pitch shift) + warm, even studio finish
        b = await processSound(b, {
          ...DEFAULT_STUDIO,
          ...(tone === 'deep' ? { pitch: -1.5, bass: 2.5 } : tone === 'deeper' ? { pitch: -3, bass: 4 } : {}),
          ...(polish ? { lowCut: 60, presence: 1.5, treble: 1, compress: 0.4, loudness: -16 } : {}),
        }, (stage, p) => { setBusy(stage === 'Done' ? 'Finishing…' : stage); setPct(p); });
      }
      setOut(b);
    } catch (e: any) {
      setErr(/fetch|network|Failed/i.test(String(e?.message ?? e)) ? 'Could not download the voice. Check the internet connection and try again (it is needed only the first time for each voice).' : `Could not make the voice-over: ${e?.message ?? e}`);
    } finally { setBusy(''); }
  };

  return (
    <div className="tool-page">
      <div className="tool-main card">
        <h3 className="tool-title">🗣 Voice-over from text</h3>
        <div className="chips">
          {LANGS.map(([k, l]) => (
            <button key={k} className={`chip ${lang === k ? 'on' : ''}`} onClick={() => { setLang(k); setVoice(VOICES.find((v) => v.lang === k)!.id); }}>{l}</button>
          ))}
        </div>
        <textarea className="vo-text" lang={lang} value={text} onChange={(e) => setText(e.target.value)} rows={9}
          placeholder={lang === 'hi' ? 'यहाँ अपना वॉइस-ओवर लिखें या चिपकाएँ…' : 'Type or paste your voice-over script here…'} aria-label="Voice-over text" />
        <div className="row small muted" style={{ justifyContent: 'space-between' }}>
          <span>{words} words · about {secs(estimate)}</span>
          {!text && <button className="btn small" onClick={() => setText(SAMPLE[lang])}>Try an example</button>}
        </div>
        <div className="small muted" style={{ marginTop: 4 }}>Tip: each full stop or । gives a short pause, a new line a longer one. Write numbers in words for the most natural reading.</div>

        <div className="row" style={{ marginTop: 12, gap: 8 }}>
          <button className="btn primary" disabled={!text.trim() || !!busy} onClick={make}>{out ? '↻ Make again' : '🗣 Make voice-over'}</button>
          {busy && <span className="small muted">{busy}</span>}
        </div>
        {busy && <div style={{ marginTop: 8 }}><Progress value={pct} /></div>}
        {err && <Note kind="bad">{err}</Note>}

        {out && (
          <div className="card tight" style={{ marginTop: 14 }}>
            <div className="row" style={{ justifyContent: 'space-between' }}>
              <b className="small">Result · {secs(out.duration)}</b>
              <button className="btn small" onClick={() => pl.play('out', out)}>{pl.playing === 'out' ? '■ Stop' : '▶ Listen'}</button>
            </div>
            <BufWave buf={out} pos={pl.playing === 'out' ? pl.pos : undefined} onSeek={(t) => pl.play('seek', out, t)} />
            <div className="row" style={{ marginTop: 8, flexWrap: 'wrap', gap: 6 }}>
              <FmtSelect value={fmt} onChange={setFmt} />
              <button className="btn small" disabled={!!busy} onClick={async () => { setBusy('Saving…'); try { await saveBuffer(out, name, fmt, setPct); } finally { setBusy(''); } }}>⬇ Save</button>
              <button className="btn small" onClick={() => onStudio(out, name)}>🎚 Edit sound (bass, treble, speed…)</button>
              <button className="btn small primary" onClick={async () => { await onTimeline(out, name); setMsg('Added to the Voice track at the playhead. Music dips under it automatically.'); }}>＋ Add to video</button>
            </div>
            {msg && <Note>{msg}</Note>}
          </div>
        )}
      </div>

      <aside className="tool-side card">
        <b className="small">Voice</b>
        <div className="col" style={{ gap: 6, marginTop: 6 }}>
          {voices.map((v, i) => (<div key={v.id} className="col" style={{ gap: 6 }}>
            {(i === 0 || voices[i - 1].hd !== v.hd) && <div className="studio-group" style={{ marginTop: i ? 6 : 0, borderTop: i ? undefined : 0, paddingTop: i ? undefined : 0 }}>{v.hd ? '✨ Natural HD — most human' : 'Light — small download'}</div>}
            <label key={v.id} className={`voice-card ${voice === v.id ? 'on' : ''}`}>
              <input type="radio" name="voice" checked={voice === v.id} onChange={() => setVoice(v.id)} />
              <span className="grow">
                <b>{v.gender === 'male' ? '👨' : '👩'} {v.label}</b>
                <span className="small muted"> {v.gender}{v.note ? ` · ${v.note}` : ''}</span>
              </span>
              <span className="small muted">{have[v.id] ? '✓ ready' : v.hd ? '≈90 MB once' : '≈60 MB once'}</span>
            </label>
          </div>))}
        </div>
        <label className="field small" style={{ marginTop: 14 }}>Speed <b>{speed.toFixed(2)}×</b>
          <input type="range" min={0.6} max={1.6} step={0.05} value={speed} onChange={(e) => setSpeed(+e.target.value)} />
        </label>
        <div className="small" style={{ marginBottom: 4 }}>Voice tone</div>
        <div className="chips" style={{ marginBottom: 10 }}>
          {([['natural', 'Natural'], ['deep', '🎙 Deep'], ['deeper', '🎙 Extra deep']] as const).map(([k, l]) => (
            <button key={k} className={`chip ${tone === k ? 'on' : ''}`} onClick={() => setTone(k)}>{l}</button>
          ))}
        </div>
        <label className="row small" style={{ marginBottom: 10 }}><input type="checkbox" checked={polish} onChange={(e) => setPolish(e.target.checked)} /> Studio finish (warm, even level, −16 LUFS)</label>
        {!VOICES.find((v) => v.id === voice)?.hd && <label className="field small">Expression <b>{variation < 0.3 ? 'flat' : variation < 0.7 ? 'natural' : 'lively'}</b>
          <input type="range" min={0} max={1} step={0.05} value={variation} onChange={(e) => setVariation(+e.target.value)} />
        </label>}
        <label className="field small">Pause between sentences <b>{(pause).toFixed(1)} s</b>
          <input type="range" min={0} max={2} step={0.1} value={pause} onChange={(e) => setPause(+e.target.value)} />
        </label>
        <p className="small muted" style={{ marginTop: 12 }}>
          Voices run on this computer (no account, nothing uploaded). Natural HD voices share one download (about 90 MB), light voices about 60 MB each; after the first time they work offline. Deep tones lower the pitch while keeping the voice natural.
          For a deeper tone, more bass, treble or a different pace, press <b>Edit sound</b> after making the voice-over.
        </p>
      </aside>
    </div>
  );
}
