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
  | 'steps' | 'stat' | 'moment' | 'cta' | 'grid';

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
  // ---- editing (clip) settings
  speed?: number; // 0.25 … 4 (1 = normal)
  volume?: number; // clip sound level 0 … 2 (1 = normal)
  muted?: boolean; // clip sound off
  duck?: boolean; // dip music while this clip's sound plays
  fadeIn?: number; // seconds, from black
  fadeOut?: number; // seconds, to black
  fit?: 'fill' | 'fit'; // fill = crop to frame, fit = whole picture on blurred background
  rotate?: 0 | 90 | 180 | 270;
  flip?: boolean;
  look?: ClipLook;
  crop?: { l: number; r: number; t: number; b: number }; // fractions of the source frame cut from each side
  marks?: MarkBox[]; // watermark / logo areas to remove or blur
  // ---- split-screen (kind 'grid'): several videos playing at once, one per frame
  layout?: GridLayout;
  cells?: GridCell[];
  gap?: number; // space between frames, % of the short side
  radius?: number; // rounded corners, % of the short side
  border?: string; // frame border colour ('' = none)
  frame?: FrameDesign;
}

export type FrameDesign = 'clean' | 'rounded' | 'polaroid' | 'neon' | 'diagonal' | 'circle' | 'tilted' | 'film';

export type GridLayout = '2h' | '2v' | '3l' | '3c' | '3r' | '4' | '6' | 'pip' | 'pip2';
export interface GridCell { mediaId: string; clipIn: number; sound?: boolean; volume?: number; fit?: 'fill' | 'fit'; zoom?: number }

/** An area of the source frame (fractions 0..1) to hide: smooth fill from the surroundings, or blur. */
export interface MarkBox { id: string; x: number; y: number; w: number; h: number; mode: 'fill' | 'blur' }

export interface ClipLook { brightness: number; contrast: number; saturation: number; preset: LookPreset }
export type LookPreset = 'none' | 'vivid' | 'warm' | 'cool' | 'bw' | 'vintage' | 'fade';

/** Text or picture laid over the video on its own track (runs in parallel with scenes). */
export interface Overlay {
  id: string;
  kind: 'text' | 'image';
  at: number;
  dur: number;
  text: string;
  mediaId?: string;
  preset: 'title' | 'lower' | 'caption' | 'tag' | 'plain';
  x: number; // 0..1 centre
  y: number; // 0..1 centre
  size: number; // text: % of short side; image: % of width
  color: string; // '' = style text colour
  bg: string; // '' = none / style panel
  anim: 'fade' | 'pop' | 'slide' | 'type' | 'none';
  opacity: number;
  rotate?: number; // degrees, -180 … 180 (90 / -90 = vertical text)
  font?: string; // '' = style font
  bold?: boolean;
  italic?: boolean;
  align?: 'left' | 'center' | 'right';
  outline?: number; // outline thickness, % of text size
  outlineColor?: string;
  shadow?: boolean;
  upper?: boolean; // ALL CAPS
  spacing?: number; // line spacing multiplier
}

/** A sound on the music or voice track. */
export interface AudioItem {
  id: string;
  mediaId: string;
  role: 'music' | 'voice' | 'sfx';
  at: number; // start on the timeline
  offset: number; // start inside the file
  dur: number; // length on the timeline
  toEnd?: boolean; // music: stretch to the end of the video
  loop?: boolean;
  volume: number; // 0 … 2
  fadeIn: number;
  fadeOut: number;
  duck?: boolean; // music: dip under speech
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
  musicId?: string; // (old projects) — converted to an AudioItem on load
  musicVolume: number; // 0..1 (old projects)
  duckLevel: number; // 0.15..0.2 = music level under speech
  beats: number[];
  snapToBeats: boolean;
  captions: Caption[];
  captionStyle: CaptionStyle;
  overlays: Overlay[];
  audio: AudioItem[];
  rangeIn?: number; // selected part (I / O)
  rangeOut?: number;
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
