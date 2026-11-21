import type {
  AspectKey, LangCode, MusicMood, SceneKind, StylePack, TransitionKind, VideoTypeId,
} from './types';

export const ASPECTS: { key: AspectKey; label: string; hint: string; w: number; h: number }[] = [
  { key: '16:9', label: 'Wide 16:9', hint: 'YouTube, TV, laptop', w: 1920, h: 1080 },
  { key: '9:16', label: 'Tall 9:16', hint: 'Reels, Shorts, Status', w: 1080, h: 1920 },
  { key: '1:1', label: 'Square 1:1', hint: 'Feed posts', w: 1080, h: 1080 },
  { key: '4:5', label: 'Portrait 4:5', hint: 'Instagram feed', w: 1080, h: 1350 },
];

export const LENGTHS = [15, 30, 60, 90, 180];

export const LANGS: { code: LangCode; label: string; native: string }[] = [
  { code: 'en', label: 'English', native: 'English' },
  { code: 'hi', label: 'Hindi', native: 'हिन्दी' },
  { code: 'mr', label: 'Marathi', native: 'मराठी' },
  { code: 'bn', label: 'Bengali', native: 'বাংলা' },
  { code: 'ta', label: 'Tamil', native: 'தமிழ்' },
  { code: 'te', label: 'Telugu', native: 'తెలుగు' },
  { code: 'gu', label: 'Gujarati', native: 'ગુજરાતી' },
];

export const FONTS = [
  'Poppins', 'Montserrat', 'Inter', 'Noto Sans', 'Mukta', 'Hind', 'Playfair Display',
  'Noto Sans Devanagari', 'Noto Sans Bengali', 'Noto Sans Tamil', 'Noto Sans Telugu', 'Noto Sans Gujarati',
];

/** Fallback chain so any Indic script in a line still shapes correctly. */
export function fontStack(primary: string) {
  return `"${primary}", "Noto Sans Devanagari", "Noto Sans Bengali", "Noto Sans Tamil", "Noto Sans Telugu", "Noto Sans Gujarati", "Noto Sans", sans-serif`;
}

export interface VideoTypePreset {
  id: VideoTypeId;
  label: string;
  emoji: string;
  hint: string;
  flow: SceneKind[]; // order; 'item' expands to one per content row
  pace: number;
  mood: MusicMood;
  interleaveBites: boolean;
  text: Record<'en' | 'hi', { hook: string[]; headline: string; cta: string; ctaSub: string }>;
}

export const VIDEO_TYPES: VideoTypePreset[] = [
  {
    id: 'promo', label: 'Promo', emoji: '📣', hint: 'Sell a product, service or offer',
    flow: ['hook', 'montage', 'headline', 'item', 'stat', 'cta'], pace: 0.75, mood: 'energetic', interleaveBites: true,
    text: {
      en: { hook: ['Something *new*', 'is here'], headline: 'Made for you.\nBuilt to last.', cta: 'Get yours today', ctaSub: 'Limited period offer' },
      hi: { hook: ['कुछ *नया*', 'आपके लिए'], headline: 'आपके लिए बना,\nभरोसे के साथ', cta: 'आज ही पाएं', ctaSub: 'सीमित समय का ऑफ़र' },
    },
  },
  {
    id: 'highlights', label: 'Highlights', emoji: '✨', hint: 'Event, festival or match recap',
    flow: ['hook', 'montage', 'item', 'moment', 'stat', 'cta'], pace: 0.85, mood: 'festive', interleaveBites: true,
    text: {
      en: { hook: ['What a *day*!', 'The highlights'], headline: 'Moments we will remember', cta: 'See you next time', ctaSub: 'Thank you for being part of it' },
      hi: { hook: ['क्या *दिन* था!', 'मुख्य झलकियाँ'], headline: 'यादगार पल', cta: 'फिर मिलेंगे', ctaSub: 'साथ देने के लिए धन्यवाद' },
    },
  },
  {
    id: 'showcase', label: 'Showcase / List', emoji: '🏆', hint: '"Top 5", our projects, our products',
    flow: ['hook', 'headline', 'item', 'cta'], pace: 0.6, mood: 'corporate', interleaveBites: true,
    text: {
      en: { hook: ['Our *Top* picks'], headline: 'Here is what we built', cta: 'Want to know more?', ctaSub: 'Get in touch' },
      hi: { hook: ['हमारी *खास* पेशकश'], headline: 'हमारे काम की झलक', cta: 'और जानना चाहते हैं?', ctaSub: 'संपर्क करें' },
    },
  },
  {
    id: 'story', label: 'Story / Impact', emoji: '🌱', hint: 'NGO impact, progress report, journey',
    flow: ['hook', 'montage', 'headline', 'stat', 'item', 'moment', 'cta'], pace: 0.4, mood: 'warm', interleaveBites: true,
    text: {
      en: { hook: ['Every *change*', 'starts small'], headline: 'This is our story', cta: 'Be part of the change', ctaSub: 'Join us' },
      hi: { hook: ['हर *बदलाव*', 'छोटे कदम से'], headline: 'यह हमारी कहानी है', cta: 'बदलाव का हिस्सा बनें', ctaSub: 'हमसे जुड़ें' },
    },
  },
  {
    id: 'announcement', label: 'Announcement / Invite', emoji: '💌', hint: 'Launch, opening, wedding, event invite',
    flow: ['hook', 'headline', 'item', 'cta'], pace: 0.5, mood: 'elegant', interleaveBites: false,
    text: {
      en: { hook: ['You are *invited*'], headline: 'Join us for a\nspecial occasion', cta: 'Save the date', ctaSub: 'We look forward to seeing you' },
      hi: { hook: ['आप *सादर आमंत्रित* हैं'], headline: 'एक खास अवसर पर\nहमारे साथ जुड़ें', cta: 'तारीख याद रखें', ctaSub: 'आपकी प्रतीक्षा रहेगी' },
    },
  },
  {
    id: 'tutorial', label: 'Tutorial / Steps', emoji: '🧭', hint: 'How-to in clear numbered steps',
    flow: ['hook', 'steps', 'item', 'cta'], pace: 0.45, mood: 'calm', interleaveBites: true,
    text: {
      en: { hook: ['How to do it', 'in *simple* steps'], headline: 'Follow along', cta: 'Now you try!', ctaSub: 'Share it with a friend' },
      hi: { hook: ['कैसे करें', '*आसान* चरणों में'], headline: 'साथ-साथ करें', cta: 'अब आप करके देखें!', ctaSub: 'दोस्तों के साथ साझा करें' },
    },
  },
  {
    id: 'slideshow', label: 'Slideshow / Memories', emoji: '📷', hint: 'Photos with music, gently animated',
    flow: ['hook', 'item', 'moment', 'cta'], pace: 0.3, mood: 'warm', interleaveBites: false,
    text: {
      en: { hook: ['Our *memories*'], headline: 'Moments together', cta: 'Thank you', ctaSub: 'With love' },
      hi: { hook: ['हमारी *यादें*'], headline: 'साथ बिताए पल', cta: 'धन्यवाद', ctaSub: 'प्यार सहित' },
    },
  },
  {
    id: 'custom', label: 'Custom', emoji: '🛠️', hint: 'Start simple, arrange scenes yourself',
    flow: ['hook', 'item', 'cta'], pace: 0.5, mood: 'corporate', interleaveBites: true,
    text: {
      en: { hook: ['Your *headline* here'], headline: 'Your main message', cta: 'Thank you', ctaSub: '' },
      hi: { hook: ['आपकी *मुख्य* बात'], headline: 'आपका मुख्य संदेश', cta: 'धन्यवाद', ctaSub: '' },
    },
  },
];

export const videoType = (id: VideoTypeId) => VIDEO_TYPES.find((v) => v.id === id) ?? VIDEO_TYPES[0];

const T = (...t: TransitionKind[]) => t;

export const STYLE_PACKS: StylePack[] = [
  {
    id: 'festive', name: 'Bold Festive', fontHead: 'Poppins', fontBody: 'Poppins', headWeight: 800, shape: 'swoosh',
    colors: { bg: '#2b0a3d', bg2: '#5a0f5e', panel: '#ff6b00', panelText: '#ffffff', text: '#ffffff', accent: '#ffd400', accent2: '#ff2e88' },
    transitions: T('flash', 'zoom', 'slide', 'wipe'), motion: 1.2, mood: 'festive',
  },
  {
    id: 'corporate', name: 'Corporate Clean', fontHead: 'Montserrat', fontBody: 'Inter', headWeight: 800, shape: 'geometric',
    colors: { bg: '#0f2a44', bg2: '#173e63', panel: '#ffffff', panelText: '#0f2a44', text: '#ffffff', accent: '#2bb3a3', accent2: '#f5b400' },
    transitions: T('dissolve', 'slide', 'wipe'), motion: 0.95, mood: 'corporate',
  },
  {
    id: 'minimal', name: 'Minimal White', fontHead: 'Inter', fontBody: 'Inter', headWeight: 700, shape: 'lines',
    colors: { bg: '#ffffff', bg2: '#f1f2f4', panel: '#ffffff', panelText: '#111111', text: '#111111', accent: '#111111', accent2: '#e63946' },
    transitions: T('dissolve', 'slide'), motion: 0.8, mood: 'calm',
  },
  {
    id: 'neon', name: 'Dark Neon', fontHead: 'Montserrat', fontBody: 'Inter', headWeight: 800, shape: 'glass',
    colors: { bg: '#07070f', bg2: '#151530', panel: '#141428', panelText: '#ffffff', text: '#ffffff', accent: '#00f0ff', accent2: '#ff00d4' },
    transitions: T('zoom', 'flash', 'wipe'), motion: 1.3, mood: 'energetic',
  },
  {
    id: 'pastel', name: 'Pastel Soft', fontHead: 'Poppins', fontBody: 'Hind', headWeight: 700, shape: 'swoosh',
    colors: { bg: '#fdf1ec', bg2: '#f7dde4', panel: '#ffffff', panelText: '#4a3b52', text: '#4a3b52', accent: '#e07a9a', accent2: '#5fb3ab' },
    transitions: T('dissolve', 'wipe'), motion: 0.85, mood: 'warm',
  },
  {
    id: 'tricolour', name: 'Tricolour', fontHead: 'Mukta', fontBody: 'Hind', headWeight: 800, shape: 'swoosh',
    colors: { bg: '#ffffff', bg2: '#fff4e6', panel: '#0b2a5b', panelText: '#ffffff', text: '#0b2a5b', accent: '#138808', accent2: '#ff9933' },
    transitions: T('wipe', 'slide', 'dissolve'), motion: 1.0, mood: 'patriotic',
  },
  {
    id: 'gold', name: 'Luxury Gold', fontHead: 'Playfair Display', fontBody: 'Montserrat', headWeight: 700, shape: 'lines',
    colors: { bg: '#0d0d0d', bg2: '#1c1a14', panel: '#151515', panelText: '#f3e6c4', text: '#f3e6c4', accent: '#d4af37', accent2: '#ffffff' },
    transitions: T('dissolve', 'zoom'), motion: 0.75, mood: 'elegant',
  },
];

export const stylePack = (id: string) => STYLE_PACKS.find((s) => s.id === id) ?? STYLE_PACKS[1];

export const SCENE_LABELS: Record<SceneKind, string> = {
  hook: 'Opening hook', montage: 'Quick montage', speaker: 'Speaker bite', headline: 'Headline card',
  item: 'Item', steps: 'Steps / compare', stat: 'Big numbers', moment: 'Clip', cta: 'End card', grid: 'Split screen',
};

export const TRANSITION_LABELS: Record<TransitionKind, string> = {
  cut: 'Straight cut', dissolve: 'Soft fade', wipe: 'Shape wipe', zoom: 'Zoom blur', slide: 'Slide', flash: 'Flash cut',
};

export const MOOD_TEMPO: Record<MusicMood, number> = {
  festive: 124, corporate: 112, calm: 84, energetic: 128, warm: 92, patriotic: 104, elegant: 76,
};
