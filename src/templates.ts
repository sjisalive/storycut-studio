// Eight ready-made demo projects (one per video type). Placeholder photos and
// the music bed are generated on the spot, so the demos work fully offline and
// each one exports a 30-second sample.
import type { AspectKey, ContentRow, LangCode, MediaItem, Project, VideoTypeId } from './types';
import { assemble, defaultProject, newRow } from './assemble';
import { readMedia } from './media';
import { stylePack, videoType } from './presets';
import { synthMusic } from './audio/synth';
import { detectBeats, loopBeats } from './audio/beats';
import { getAudioBuffer } from './media';
import { seeded, uid } from './util';

interface TemplateDef {
  id: string; name: string; type: VideoTypeId; style: string; aspect: AspectKey; lang: LangCode; lang2?: LangCode;
  palette: [string, string, string]; hook: string[]; headline: string;
  rows: Partial<ContentRow>[]; extraPhotos: number;
  cta: Partial<Project['cta']>;
}

export const TEMPLATES: TemplateDef[] = [
  {
    id: 't-promo', name: 'Café promo', type: 'promo', style: 'festive', aspect: '16:9', lang: 'en', palette: ['#ff9f43', '#ee5253', '#feca57'],
    hook: ['Fresh from the *oven*', 'every single day'], headline: 'Baked with love.\nServed with a smile.', extraPhotos: 5,
    rows: [
      { title: 'Butter Croissant', subtitle: 'Flaky, golden, baked every morning', highlight: '₹99', badge: 'New' },
      { title: 'Masala Chai', subtitle: 'Our classic, brewed just right', highlight: '₹40' },
      { title: 'Celebration Cake', subtitle: 'Order 24 hours ahead', highlight: '₹499', badge: 'Bestseller' },
    ],
    cta: { title: 'Visit us *today*', subtitle: 'Open 7 am – 10 pm', website: 'freshbake.example.com', contact: '+91 90000 00000', social: '@freshbake', qr: 'https://example.com/freshbake' },
  },
  {
    id: 't-highlights', name: 'Sports day highlights', type: 'highlights', style: 'neon', aspect: '9:16', lang: 'en', palette: ['#00d2d3', '#5f27cd', '#ff9ff3'],
    hook: ['Sports Day *2026*', 'the highlights'], headline: 'Moments we will remember', extraPhotos: 6,
    rows: [
      { title: '100 m sprint', subtitle: 'A new school record', highlight: '11.2 s', badge: 'Record' },
      { title: 'Tug of war', subtitle: 'Blue House takes the trophy', highlight: '3–1' },
      { title: 'Medals awarded', subtitle: 'Every participant cheered on', highlight: '120' },
    ],
    cta: { title: 'See you next *year*!', subtitle: 'Thank you, parents & teachers', social: '@ourschool' },
  },
  {
    id: 't-showcase', name: 'Our projects (Top 3)', type: 'showcase', style: 'corporate', aspect: '16:9', lang: 'en', palette: ['#0abde3', '#10ac84', '#222f3e'],
    hook: ['Our *Top 3*', 'projects this year'], headline: 'Built for people.\nDelivered on time.', extraPhotos: 2,
    rows: [
      { title: 'Riverside Road', subtitle: '4-lane road, completed ahead of schedule', highlight: '20 km', badge: 'Representative image' },
      { title: 'Rooftop Solar', subtitle: 'Clean power on public buildings', highlight: '5 MW', badge: 'Representative image' },
      { title: 'Smart Meters', subtitle: 'Faster, accurate monthly bills', highlight: '2,50,000+', badge: 'Representative image' },
    ],
    cta: { title: 'Building a *better* tomorrow', subtitle: 'Example Infra Ltd.', website: 'example.org', qr: 'https://example.org' },
  },
  {
    id: 't-story', name: 'NGO impact story', type: 'story', style: 'pastel', aspect: '1:1', lang: 'en', palette: ['#48dbfb', '#1dd1a1', '#feca57'],
    hook: ['Clean water', 'changes *everything*'], headline: 'This is the story of\n1,200 villages', extraPhotos: 5,
    rows: [
      { title: 'Villages reached', subtitle: 'Across 12 districts', highlight: '1,200+' },
      { title: 'People served', subtitle: 'Safe drinking water every day', highlight: '3,50,000' },
      { title: 'Schools covered', subtitle: 'Children drink clean water', highlight: '98%' },
    ],
    cta: { title: 'Be part of the *change*', subtitle: 'Volunteer or donate', website: 'cleanwater.example.org', qr: 'https://example.org/donate' },
  },
  {
    id: 't-invite', name: 'उद्घाटन निमंत्रण (Hindi invite)', type: 'announcement', style: 'tricolour', aspect: '4:5', lang: 'hi', lang2: 'en', palette: ['#ff9933', '#138808', '#0b2a5b'],
    hook: ['आप *सादर आमंत्रित* हैं'], headline: 'नए सामुदायिक भवन का\nउद्घाटन समारोह', extraPhotos: 2,
    rows: [
      { title: 'उद्घाटन समारोह', subtitle: 'मुख्य अतिथि द्वारा फीता काटना', highlight: '15 दिसंबर', second: 'Inauguration ceremony' },
      { title: 'सांस्कृतिक कार्यक्रम', subtitle: 'स्थानीय कलाकारों की प्रस्तुति', highlight: 'शाम 5 बजे', second: 'Cultural programme' },
      { title: 'सामूहिक भोज', subtitle: 'सभी के लिए', highlight: 'शाम 7 बजे', second: 'Community dinner' },
    ],
    cta: { title: 'तारीख *याद* रखें', subtitle: 'आपकी प्रतीक्षा रहेगी', dateVenue: '15 दिसंबर 2026 · सामुदायिक भवन, पटना', contact: '+91 90000 00000' },
  },
  {
    id: 't-tutorial', name: 'How to pay a bill online', type: 'tutorial', style: 'minimal', aspect: '16:9', lang: 'en', palette: ['#54a0ff', '#2e86de', '#c8d6e5'],
    hook: ['Pay your bill', 'in *4 simple* steps'], headline: 'Pay your bill online', extraPhotos: 0,
    rows: [
      { title: 'Open the app', subtitle: 'Or visit the website on any phone' },
      { title: 'Enter consumer number', subtitle: 'It is printed on your bill' },
      { title: 'Check the amount', subtitle: 'Choose UPI, card or net banking' },
      { title: 'Pay & save receipt', subtitle: 'Download or share the receipt' },
    ],
    cta: { title: 'Now you *try*!', subtitle: 'Share this with your family', website: 'example.com/pay', qr: 'https://example.com/pay' },
  },
  {
    id: 't-slideshow', name: 'Memories slideshow', type: 'slideshow', style: 'gold', aspect: '9:16', lang: 'en', lang2: 'hi', palette: ['#f6e58d', '#e17055', '#6c5ce7'],
    hook: ['Our *memories*', '2016 – 2026'], headline: 'Moments together', extraPhotos: 2,
    rows: [
      { title: 'Where it all began', subtitle: 'Delhi, 2016', second: 'जहाँ सब शुरू हुआ' },
      { title: 'Our first home', subtitle: 'Pune, 2019', second: 'हमारा पहला घर' },
      { title: 'Little one arrives', subtitle: '2022', second: 'नन्हा मेहमान' },
      { title: 'Ten years together', subtitle: '2026', second: 'साथ के दस साल' },
    ],
    cta: { title: 'Here’s to *forever*', subtitle: 'With love' },
  },
  {
    id: 't-realestate', name: 'Real estate listing', type: 'custom', style: 'corporate', aspect: '16:9', lang: 'en', palette: ['#c8d6e5', '#576574', '#feca57'],
    hook: ['Your *dream home*', 'is ready'], headline: 'Green Meadows, Phase 2', extraPhotos: 1,
    rows: [
      { title: '3 BHK Apartment', subtitle: 'East-facing, corner unit', highlight: '₹85 lakh', badge: 'Few left' },
      { title: 'Built-up area', subtitle: 'Two balconies, modular kitchen', highlight: '1,450 sq ft' },
      { title: 'Clubhouse & park', subtitle: 'Pool, gym, kids play area', highlight: '2 acres' },
      { title: 'Ready to move', subtitle: 'Approved by major banks', highlight: 'Dec 2026', badge: 'Representative image' },
    ],
    cta: { title: 'Book a *site visit*', subtitle: 'Green Meadows Realty', contact: '+91 90000 00000', website: 'greenmeadows.example', qr: 'https://example.com/visit' },
  },
];

/** A pleasant, clearly-placeholder photo: gradient sky, hills, sun and a label. */
async function placeholderPhoto(seed: string, palette: [string, string, string], label: string, w = 1600, h = 1000): Promise<Blob> {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  const g = c.getContext('2d')!;
  const r = seeded(seed);
  const [a, b, d] = palette;
  const sky = g.createLinearGradient(0, 0, w * r(), h);
  sky.addColorStop(0, a); sky.addColorStop(1, b);
  g.fillStyle = sky; g.fillRect(0, 0, w, h);
  g.globalAlpha = 0.85;
  g.fillStyle = d;
  g.beginPath(); g.arc(w * (0.2 + 0.6 * r()), h * (0.2 + 0.25 * r()), h * (0.08 + 0.08 * r()), 0, Math.PI * 2); g.fill();
  for (let layer = 0; layer < 3; layer++) {
    g.globalAlpha = 0.35 + layer * 0.2;
    g.fillStyle = layer === 2 ? '#1e272e' : layer === 1 ? b : a;
    g.beginPath();
    const base = h * (0.55 + layer * 0.13);
    g.moveTo(0, h);
    for (let x = 0; x <= w; x += w / 8) g.lineTo(x, base - r() * h * 0.18);
    g.lineTo(w, h); g.closePath(); g.fill();
  }
  // simple "building / object" silhouette for variety
  g.globalAlpha = 0.55; g.fillStyle = '#1e272e';
  const bx = w * (0.1 + 0.6 * r());
  for (let i = 0; i < 4; i++) { const bw = w * 0.05, bh = h * (0.12 + r() * 0.25); g.fillRect(bx + i * bw * 1.15, h * 0.82 - bh, bw, bh); }
  g.globalAlpha = 1;
  g.font = `600 ${Math.round(h * 0.035)}px Inter, sans-serif`;
  g.fillStyle = 'rgba(255,255,255,0.85)';
  g.textAlign = 'right';
  g.fillText(`${label} · replace with your photo`, w - h * 0.04, h - h * 0.04);
  return new Promise((res) => c.toBlob((bl) => res(bl!), 'image/jpeg', 0.86));
}

export async function buildTemplate(id: string, onStatus?: (s: string) => void): Promise<Project> {
  const def = TEMPLATES.find((t) => t.id === id)!;
  const p = defaultProject();
  p.id = uid('p');
  p.name = def.name;
  p.videoType = def.type;
  p.style = structuredClone(stylePack(def.style));
  p.aspect = def.aspect;
  p.lang = def.lang;
  p.lang2 = def.lang2 ?? '';
  p.targetLength = 30;
  p.pace = videoType(def.type).pace;
  p.hookLines = def.hook;
  p.headline = def.headline;
  p.cta = { ...p.cta, title: '', subtitle: '', website: '', contact: '', dateVenue: '', social: '', qr: '', ...def.cta };
  onStatus?.('Making placeholder photos…');
  const media: MediaItem[] = [];
  const portrait = def.aspect === '9:16' || def.aspect === '4:5';
  const total = def.rows.length + def.extraPhotos;
  for (let i = 0; i < total; i++) {
    const blob = await placeholderPhoto(`${def.id}-${i}`, def.palette, `Photo ${i + 1}`, portrait ? 1000 : 1600, portrait ? 1500 : 1000);
    media.push(await readMedia(blob, `placeholder-${i + 1}.jpg`, { role: 'photo', placeholder: true }));
  }
  p.rows = def.rows.map((r, i) => newRow({ ...r, mediaId: media[i]?.id }));
  onStatus?.('Making a music bed…');
  const music = await synthMusic(p.style.mood, 34, def.id);
  const mm = await readMedia(music, `music-${p.style.mood}.wav`, { role: 'music', placeholder: true });
  media.push(mm);
  p.media = media;
  p.musicId = mm.id;
  const buf = await getAudioBuffer(mm.id);
  if (buf) { const det = detectBeats(buf); p.beats = loopBeats(det.beats, buf.duration, 200); }
  p.scenes = assemble(p);
  return p;
}
