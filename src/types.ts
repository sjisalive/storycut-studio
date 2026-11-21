// Core data model for StoryCut Studio. Everything here is plain JSON so a
// project can be saved, undone/redone, and exported as a file.

export type AspectKey = '16:9' | '9:16' | '1:1' | '4:5';
export type VideoTypeId =
  | 'promo' | 'highlights' | 'showcase' | 'story'
  | 'announcement' | 'tutorial' | 'slideshow' | 'custom';
export type LangCode = 'en' | 'hi' | 'mr' | 'bn' | 'ta' | 'te' | 'gu';

export type MediaKind = 'video' | 'image' | 'audio';
export type MediaRole = 'clip' | 'photo' | 'logo' | 'music' | 'voice' | 'cutout';

export interface MediaItem {
  id: string;
  name: string;
  kind: MediaKind;
  role: MediaRole;
  mime: string;
  size: number;
  duration: number; // seconds (0 for images)
  width: number;
  height: number;
  hasAudio?: boolean;
  status: 'reading' | 'ready' | 'error';
  error?: string;
  thumb?: string; // small data URL
  placeholder?: boolean;
}

export interface ContentRow {
  id: string;
  title: string;
  subtitle: string;
  highlight: string; // "₹499", "20 km", "4.8★", "Step 2"
  mediaId?: string;
  badge: string; // "New", "Sold out", "Representative image"
  second?: string; // optional second-language line
}

export interface Bite {
  id: string;
  mediaId: string;
  inT: number;
  outT: number;
  words: string; // 2–4 highlight words, comma or space separated
  name: string;
  role: string;
}

export type SceneKind =
  | 'hook' | 'montage' | 'speaker' | 'headline' | 'item'
  | 'steps' | 'stat' | 'moment' | 'cta';

export type TransitionKind = 'cut' | 'dissolve' | 'wipe' | 'zoom' | 'slide' | 'flash';

export interface SceneTexts {
  lines?: string[]; // hook / headline lines (use *word* or _word_ for colours)
  title?: string;
  subtitle?: string;
  highlight?: string;
  badge?: string;
  caption?: string;
  second?: string; // second-language line
  words?: string; // speaker kinetic words
  name?: string;
  role?: string;
}

export interface ListEntry { label: string; value: string; mediaId?: string }

export interface Scene {
  id: string;
  kind: SceneKind;
  duration: number;
  transition: TransitionKind; // transition INTO the next scene
  texts: SceneTexts;
  mediaIds: string[];
  clipIn?: number; // start point inside the first video
  entries?: ListEntry[]; // steps / stats
  mode?: 'steps' | 'compare';
  voiceId?: string; // voiceover media for this scene
  useClipAudio?: boolean; // speaker bites
  biteId?: string;
  rowId?: string;
}

export interface StyleColors {
  bg: string; bg2: string; panel: string; panelText: string;
  text: string; accent: string; accent2: string;
}

export type ShapeSet = 'geometric' | 'swoosh' | 'lines' | 'glass';

export interface StylePack {
  id: string;
  name: string;
  colors: StyleColors;
  fontHead: string;
  fontBody: string;
  headWeight: number;
  shape: ShapeSet;
  transitions: TransitionKind[];
  motion: number; // 0.7 slow … 1.3 snappy
  mood: MusicMood;
}

export type MusicMood = 'festive' | 'corporate' | 'calm' | 'energetic' | 'warm' | 'patriotic' | 'elegant';

export interface CtaInfo {
  title: string;
  subtitle: string;
  website: string;
  contact: string;
  dateVenue: string;
  social: string;
  qr: string; // text/URL for QR code ('' = none)
  logoId?: string;
  cutoutId?: string;
}

export interface CaptionWord { t0: number; t1: number; w: string }
export interface Caption { id: string; start: number; end: number; text: string; words?: CaptionWord[] }
export type CaptionStyle = 'off' | 'line' | 'word' | 'box';

export interface Project {
  version: 1;
  id: string;
  name: string;
  videoType: VideoTypeId;
  aspect: AspectKey;
  targetLength: number;
  lang: LangCode;
  lang2: LangCode | '';
  style: StylePack;
  pace: number; // 0 calm … 1 energetic
  media: MediaItem[];
  rows: ContentRow[];
  bites: Bite[];
  scenes: Scene[];
  hookLines: string[];
  headline: string;
  cta: CtaInfo;
  musicId?: string;
  musicVolume: number; // 0..1
  duckLevel: number; // 0.15..0.2 = music level under speech
  beats: number[];
  snapToBeats: boolean;
  captions: Caption[];
  captionStyle: CaptionStyle;
  updated: number;
  isTemplate?: boolean;
}

export interface BrandKit {
  name: string;
  logoId?: string; // stored in IndexedDB media store
  logoDataUrl?: string;
  colors?: Partial<StyleColors>;
  fontHead?: string;
  fontBody?: string;
}
