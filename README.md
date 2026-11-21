# StoryCut Studio

A browser-only video maker that turns clips, photos and a simple content list into fast-paced showcase videos. You can use it for promos, event highlights, project reports, real estate, schools, NGO impact stories, invitations, tutorials and memories. It works in English, Hindi and other Indian languages.

**There is no server.** Your files never leave your computer. All decoding, drawing, mixing and MP4 encoding happens inside the browser tab.

---

## 1. Put it online with GitHub Pages (one-time, about 5 minutes)

After this, you can open it from any computer at `https://<your-username>.github.io/storycut-studio/`.

1. On GitHub, create a new **empty** repository named `storycut-studio`. It can be public or private. Private Pages needs a paid GitHub plan.
2. Upload this folder to the repository. Either:
   - drag all the files (including the hidden `.github` folder) into **Add file → Upload files** on the repo page, or
   - from a terminal:
     ```bash
     cd storycut-studio
     git init && git add . && git commit -m "StoryCut Studio"
     git branch -M main
     git remote add origin https://github.com/<your-username>/storycut-studio.git
     git push -u origin main
     ```
3. In the repository, open **Settings → Pages**. Under **Build and deployment → Source**, choose **GitHub Actions**.
4. Open the **Actions** tab and wait for "Deploy to GitHub Pages" to turn green (about 1 minute). The site address is shown in the run summary and in Settings → Pages.

Every later push to `main` redeploys automatically. The app uses relative paths (`base: './'`), so any repository name or custom domain works.

> **Tip:** Chrome and Edge give the fastest export. They encode H.264 with WebCodecs, so a 30-second 1080p video takes well under a minute. Safari and Firefox use a slower real-time recorder.

## 2. Run it on your own computer (optional)

Requires Node.js 18 or newer.

```bash
npm install
npm run dev        # http://localhost:5173
npm run build      # production build in dist/
npm run preview    # serve the production build
```

## 3. How to use

Everything is on **one screen**, like a desktop video editor. Nothing is step by step.

```
┌ Media / Text / Audio / Style ┐┌──────── Preview ────────┐┌ Settings for what you selected ┐
│ drop files, ＋ to timeline    ││ ▶ play · scrub           ││ clip / text / sound options     │
│ merge, beat montage, compress ││ ✂ Split  🗑 Delete  ⇤ ⇥  ││ speed, volume, fades, crop,     │
│ text presets, captions        ││ Cut part  Keep part  📷  ││ watermark remover, colour look  │
└───────────────────────────────┘└──────────────────────────┘└─────────────────────────────────┘
┌ Timeline — tracks run in parallel ─────────────────────────────────────────────────────────┐
│ 🎬 Video   clips & designed scenes (drag to reorder, drag edges to trim)                     │
│ 🔤 Text    titles, lower thirds, subtitles, tags, logos (drag to move / resize)             │
│ 🎵 Music   background music with fades and auto-ducking; green ticks = detected beats       │
│ 🎙 Voice   voiceovers, sound effects, detached clip sound                                   │
└────────────────────────────────────────────────────────────────────────────────────────────┘
```

### Editing tools
| Tool | How |
|---|---|
| **Merge** clips | Media → tick clips → *Merge onto timeline*, or ＋ on each, or drag a file onto the timeline |
| **Cut / split** | Put the playhead inside a clip → **✂ Split** or `S` |
| **Select a part & delete** | `I` (start) and `O` (end), or **Shift + drag** on the time ruler → **Cut part** (`Shift+Del`). This removes the part from all tracks and closes the gap. **Keep part** does the opposite. |
| **Trim** | Drag either edge of a clip, text or sound |
| **Delete / duplicate** | Select it → `Del` / `Ctrl+D` |
| **Add music** | Media → ＋ on a music file (or Audio → Background music). There is also *Make a music bed* if you have no music. |
| **Fade music** | Audio tab → Fade in / Fade out, or select the music block. Fades show as shading on the block. |
| **Auto-ducking** | Music dips under voiceovers, speaker clips and any clip with *Dip music under it* |
| **Cut on the beat** | Audio → *Cut on the beat* (selected clip or all clips, every 1/2/4/8 beats). Media → tick clips → **Beat montage** builds a whole edit on the beat. Snap also catches beats. |
| **Compress** | Export → *Compress to a file size* (e.g. 16 MB for WhatsApp, 25 MB for email), or Media → ⋯ → *Compress this video* for a single file |
| **Crop** | Select clip → *Crop / Remove watermark* → Left / Right / Top / Bottom, or *Crop to 16:9 / 9:16 shape* |
| **Watermark / logo remover** | Same window → drag a box over the logo → *Remove (fill from surroundings)* or *Blur*. *Apply to all clips from this file* copies the boxes. |
| **Speed** | 0.25× slow motion up to 4× fast |
| **Clip sound** | On/off, volume 0–200 %, *Detach sound* (moves it to the Voice track to trim/fade separately) |
| **Fade in / out (video)** | From and to black, per clip |
| **Fit / fill, rotate, mirror** | Fit shows the whole picture on a blurred background, which is useful for vertical clips in a wide video |
| **Colour look** | Vivid, Warm, Cool, B&W, Vintage, Soft fade, plus brightness, contrast and saturation |
| **Text & logos** | Text tab or `T`: big title, lower third, subtitle box, tag, plain text. Drag on the preview to move, or drag the green corner to resize. Also a 9-point position grid. Every text has: **size**, **rotation** (straight, vertical ↑/↓, tilt, any angle), **font**, bold, italic, ALL CAPS, left/centre/right alignment, line spacing, text colour, box colour, **outline** (thickness and colour), shadow, opacity and animation (fade/pop/slide/word-by-word). Media → ⋯ → *Put on top as logo* for a logo, which you can also move, resize and rotate. |
| **Captions** | Text tab → *From speech* (Whisper in the browser) or *From scene text*. Four caption styles, `.srt` export. |
| **Voiceover** | Audio → *Record at playhead* |
| **Frame grab** | 📷 saves the current frame as a PNG |
| **Save sound** | Media → ⋯ → *Save its sound (WAV)*, or Export → *Sound only* |
| **Remove background** | Media → ⋯ → *Remove background (cut-out)* |
| **Undo / redo** | `Ctrl+Z` / `Ctrl+Shift+Z`, with unlimited steps for the session |

**Shortcuts:** `Space` play/pause · `S` split · `I`/`O` mark part · `Shift+Del` cut part · `Del` delete · `Ctrl+D` duplicate · `T` add title · `←`/`→` one frame (`Shift` = 1 s) · `+`/`−` or `Ctrl+wheel` zoom timeline · `Esc` clear selection.

### ✨ Auto video
Opens one page with the video type, ready examples, shape/length/language/style/brand, the content list (paste from Excel or import a CSV), opening and ending text and speaker bites. **Make my video** builds the video track from all of that. Your text, music and voice tracks stay, and you can then edit everything with the tools above.

**Text colours:** in any heading, `*word*` uses the accent colour and `_word_` the second accent.

### Export
1080p / 720p / Small file presets, or **compress to a target size**. Options: *only the marked part*, and extra versions in other shapes (16:9, 9:16, 1:1, 4:5) with text repositioned. Extras: thumbnail PNG, `.srt`, 6-second GIF, sound-only WAV.

### Saving projects
- Projects **autosave in this browser** (IndexedDB) and are listed under 📁 Projects.
- **Save project file** writes one `.storycut` file with your media included. Open it on any other computer with **Open project file**.
- **Save as template** keeps the look and scene plan for the next video.

## 4. The 8 demo projects

Open them from **✨ Auto video**. Placeholder photos and music are generated in the browser, so they work offline. Each one exports a 30-second sample:

| Example | Type | Shape | Style |
|---|---|---|---|
| Café promo | Promo | 16:9 | Bold Festive |
| Sports day highlights | Highlights | 9:16 | Dark Neon |
| Our projects (Top 3) | Showcase / List | 16:9 | Corporate Clean |
| NGO impact story | Story / Impact | 1:1 | Pastel Soft |
| उद्घाटन निमंत्रण (Hindi invite, English subtitle line) | Announcement / Invite | 4:5 | Tricolour |
| How to pay a bill online | Tutorial / Steps | 16:9 | Minimal White |
| Memories slideshow (Hindi subtitle line) | Slideshow / Memories | 9:16 | Luxury Gold |
| Real estate listing | Custom | 16:9 | Corporate Clean |

## 5. What's inside

```
src/
  App.tsx                 stepper, media import, autosave, shortcuts
  assemble.ts             "Make my video": scene plan, fit-to-length, beat snapping
  edit.ts                 split, ripple delete of a part, trim, join, cut on beats, beat montage, detach sound
  presets.ts              video types, style packs, languages, fonts
  render/engine.ts        canvas renderer: all scene blocks, transitions, captions
  render/text.ts          text fitting & Indic-safe drawing, number count-up
  render/shapes.ts        shaped panels (geometric / swoosh / lines / glass), backgrounds
  audio/mix.ts            music + voiceover + speaker audio, auto-ducking, offline mix
  audio/loudness.ts       BS.1770 integrated loudness → −14 LUFS with peak limiter
  audio/beats.ts          beat detection for cut snapping
  audio/synth.ts          music-bed generator
  audio/captions.ts       Whisper captions (transformers.js), on-screen-text captions, .srt
  cutout.ts               in-browser background removal (MODNet)
  export/exporter.ts      WebCodecs H.264 + AAC → MP4 (mp4-muxer), fallback, PNG, GIF
  projects.ts             IndexedDB save/load, .storycut files, brand kit
  templates.ts            the 8 demo projects
  components/             editor workspace: media bin, multi-track timeline, inspector, crop & watermark picker, export
```

### Technical notes
- **Text** is drawn with Canvas 2D, which uses the browser's text shaper, so Devanagari, Bengali, Tamil, Telugu and Gujarati conjuncts are correct. ffmpeg drawtext is not used. Fonts are bundled (Inter, Poppins, Montserrat, Noto Sans + Devanagari/Bengali/Tamil/Telugu/Gujarati, Mukta, Hind, Playfair Display). Text auto-shrinks to the safe zone, and the timeline flags scenes with ⚠ when text had to shrink a lot.
- **Export** renders frame by frame and encodes with WebCodecs. MP4/MOV clips are read with mp4box.js and decoded forward with the WebCodecs `VideoDecoder`, which is frame-exact and about 10–15× faster than seeking. Other formats (WebM, rotated phone clips) fall back to precise seeking. Audio is AAC where the browser has an AAC encoder (Chrome/Edge on Windows and macOS). Elsewhere it falls back to Opus in MP4, and the app shows a note.
- **Fallback encoder:** if WebCodecs is missing, the app records in real time with `MediaRecorder`. That gives MP4 in Safari and recent Chrome, and WebM elsewhere. ffmpeg.wasm was left out on purpose. Its multithreaded build needs special server headers (COOP/COEP) that GitHub Pages can't send, and its 30 MB download would slow down every visit.
- **Auto captions and person cut-out** load transformers.js and the model from a CDN the first time you use them, so that one time needs internet. Your audio and photos are processed locally and never uploaded. Everything else works fully offline once the page is loaded.

## 6. Troubleshooting
- **"Error" tag on a file:** the browser can't decode it. Convert to MP4 (H.264/AAC), JPG/PNG or MP3/WAV.
- **iPhone .MOV/HEVC clips** play in Safari but not in Chrome on Windows. Export them from the Photos app as "Most Compatible" first.
- **Export is slow:** close other heavy tabs, choose 720p, or use Chrome/Edge.
- **Microphone recording** needs the site to be on `https://`, which GitHub Pages is, or `localhost`.
