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
│ 🎵 Music   waveform of the music with its beats marked (dark line = start of each bar)       │
│ 🎙 Voice   waveforms of voiceovers, sound effects and clip sound                             │
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
| **See the sound** | Every sound on the timeline shows its waveform: music, voice, sound effects, and a strip along the bottom of video clips that have sound. Music also shows the detected beats, with every 4th beat (the start of a bar) drawn darker, so you can line cuts up by eye. The waveform follows trims, speed, looping and volume. |
| **🔀 Beat shuffle** | Toolbar **🔀 Beat shuffle** (or Audio → Beat shuffle, or Media → tick clips → 🔀). It cuts the clips into beat-long pieces and mixes them in a random order, with every cut on a beat and the same clip never twice in a row. Options: cut every 1, 2 or 4 beats or *Mixed*; length *same as now*, *whole song*, 15, 30 or 60 s; keep the opening title and end card in place (they are also nudged onto a beat). Don't like it? Press **🔀 Shuffle again** for a new mix from your original clips, and `Ctrl+Z` brings back earlier mixes. *Start from current track* makes the current edit the new starting point. |
| **Cut on the beat** | Audio → *Cut on the beat* (selected clip or all clips, every 1/2/4/8 beats). Media → tick clips → **Beat montage** builds a whole edit on the beat. Snap also catches beats. |
| **Compress** | Export → *Compress to a file size* (e.g. 16 MB for WhatsApp, 25 MB for email), or Media → ⋯ → *Compress this video* for a single file |
| **Crop** | Select clip → *Crop / Remove watermark* → Left / Right / Top / Bottom, or *Crop to 16:9 / 9:16 shape* |
| **Watermark / logo remover** | Same window → drag a box over the logo → *Remove (fill from surroundings)* or *Blur*. *Apply to all clips from this file* copies the boxes. |
| **Speed** | 0.25× slow motion up to 4× fast |
| **Speed of just one part** | Mark the part (`I` / `O` or Shift + drag on the ruler) → **⏩ Speed part** → 0.25×–4×. Only that part changes, and text, music and voice after it move along so they stay in sync. Clip sound in a part slower than 0.7× or faster than 1.6× is muted. |
| **Split screen** | **▦ Split screen** on the toolbar → choose a layout (side by side, top/bottom, big + 2, 2 + big, three, 2×2, six, picture-in-picture, main + 2 small), a **frame design** (clean lines, rounded cards, polaroid, neon glow, diagonal cut, circles, tilted collage, film strip) and a video for each frame. With a part marked, that part becomes the split screen and the clip already there goes in frame 1; otherwise it is inserted after the clip at the playhead. Select it to change each frame's video, start point, sound, volume, fill/fit and zoom, plus the gap, corners and border colour. All frames play at the same time. |
| **Angled & custom split screens** | **Tilt the dividers** of side by side, top/bottom, three, 2×2 or six (−40° to 40°). Or pick an **angled design**: slash ╱, backslash ╲, corner to corner, X (four triangles), three slanted, tilted 2×2, slanted top/bottom, opposite slants. Or **Edit lines myself**: add upright, flat or slanted divider lines (up to 6) and set each line's angle and position. Frames are created wherever the lines cross, and new frames fill with your other clips automatically. Gap and line colour come from the frame design (neon glows, diagonal uses the accent colour). |
| **Clip sound** | On/off, volume 0–200 %, *Detach sound* (moves it to the Voice track to trim/fade separately) |
| **Fade in / out (video)** | From and to black, per clip |
| **Fit / fill, rotate, mirror** | Fit shows the whole picture on a blurred background, which is useful for vertical clips in a wide video |
| **Colour look** | Vivid, Warm, Cool, B&W, Vintage, Soft fade, plus brightness, contrast and saturation |
| **Text & logos** | Text tab or `T`: big title, lower third, subtitle box, tag, plain text. Drag on the preview to move, or drag the green corner to resize. Also a 9-point position grid. Every text has: **size**, **rotation** (straight, vertical ↑/↓, tilt, any angle), **font**, bold, italic, ALL CAPS, left/centre/right alignment, line spacing, text colour, box colour, **outline** (thickness and colour), shadow, opacity and animation (fade/pop/slide/word-by-word). Media → ⋯ → *Put on top as logo* for a logo, which you can also move, resize and rotate. |
| **Captions** | Text tab → *From speech* (Whisper in the browser) or *From scene text*. Four caption styles, `.srt` export. |
| **Voiceover** | Audio → *Record at playhead* |
| **Frame grab** | 📷 saves the current frame as a PNG |
| **🎙 Separate voice** | Select a clip → *🎙 Separate voice* (or Media → ⋯ → *Separate voice / remove voice*). This splits the sound into **Voice only** and **Background (voice removed)**. You can listen to each, save it as MP3 or WAV, or press *Use on timeline* to put it on the Voice track in line with the clip and mute the clip's own sound. Strength: Gentle / Normal / Strong, plus optional noise and hum reduction. It runs on your computer with no AI download: it keeps what is in the centre of a stereo mix, keeps speech frequencies, cleans steady noise and quietens gaps between phrases. In testing, music in the voice dropped by about 10 dB. It is best for speech over moderate music or noise, and is not as clean as studio AI separators on loud songs. Mono recordings only get the noise clean-up. |
| **Audio only export** | Export → *Audio only*: **everything as you hear it**, **voices and clip sound without music**, or **music only**, as **MP3 (192 or 320 kbps) or WAV**. You can also save only the marked part. Media → ⋯ → *Save its sound (WAV)* saves a single file's sound. |
| **Remove background** | Media → ⋯ → *Remove background (cut-out)* |
| **Undo / redo** | `Ctrl+Z` / `Ctrl+Shift+Z`, with unlimited steps for the session |

**Shortcuts:** `Space` play/pause · `S` split · `I`/`O` mark part · `Shift+Del` cut part · `Del` delete · `Ctrl+D` duplicate · `T` add title · `←`/`→` one frame (`Shift` = 1 s) · `+`/`−` or `Ctrl+wheel` zoom timeline · `Esc` clear selection.

### ✨ Auto video
Opens one page with the video type, ready examples, shape/length/language/style/brand, the content list (paste from Excel or import a CSV), opening and ending text and speaker bites. **Make my video** builds the video track from all of that. Your text, music and voice tracks stay, and you can then edit everything with the tools above.

**Text colours:** in any heading, `*word*` uses the accent colour and `_word_` the second accent.

### Export
1080p / 720p / Small file presets, or **compress to a target size**. Options: *only the marked part*, and extra versions in other shapes (16:9, 9:16, 1:1, 4:5) with text repositioned. Extras: thumbnail PNG, `.srt`, 6-second GIF, sound-only WAV.

### 🗣 Voice-over tab (text → speech)
Type or paste a script in Hindi, English, Malayalam or Nepali and press **Make voice-over**.
- **✨ Natural HD voices** (Kokoro): the most human-sounding — natural rhythm and intonation. Hindi **Omega** (male, deep), **Psi** (male), **Alpha** and **Beta** (female); English **Onyx** (deep US male), **Michael**, **George** (deep UK male), **Fable**, **Heart**, **Bella**, **Emma**. One shared download of ≈90 MB.
- **Light voices** (Piper): Hindi Pratham / Priyamvada and more; smaller and faster, but more robotic.
- **Voice tone:** Natural, **Deep** or **Extra deep** — lowers the pitch while keeping the voice's own character (formant-preserving PSOLA), with added warmth.
- **Clean script:** time codes (00:05–00:39), [directions], headings and English notes inside a Hindi script are left out automatically — the tab lists what will not be read.
- **HD quality:** Best (full model, clearest, ≈310 MB once) or Fast (≈90 MB, slightly hissy).
- **Studio finish:** warm EQ, even level and −16 LUFS loudness, on by default.
- Sliders for **speed** and **pause between sentences** (and **expression** for light voices). A full stop or `।` gives a short pause and a new line a longer one; numbers read best written as words.
Then **Save** (MP3 192/320 kbps or WAV), **＋ Add to video** (goes on the Voice track at the playhead and the music dips under it), or **Edit sound** to open it in Sound Studio.
The voices are open-source models (Kokoro-82M, Apache-2.0; Piper, MIT) that run on your computer — nothing is uploaded and no account is needed. They download once from Hugging Face and then work offline. HD voices take roughly 1–2× the length of the speech to generate; the page stays usable while they work.

### 🎚 Sound Studio tab
Open any MP3/WAV/video (or a file already in the project, or a voice-over you just made) and change:
- **Tone:** bass, middle, presence, treble, low cut (rumble removal)
- **Voice:** speed *without changing pitch*, pitch *without changing speed* (±12 semitones, keeps the voice natural), intonation (flatter ↔ livelier), volume
- **Level:** compression, loudness target (−14 LUFS for YouTube/Instagram/WhatsApp, −16 voice-over, −18, −23 TV), peak limit
- **Space:** echo, reverb
- **Clean & edit:** noise/hum reduction, shorten long pauses, trim start/end, fade in/out, telephone sound, save as mono

**🎯 Sound like a sample voice:** pick any video or MP3 with a voice you like (music in it is removed first). The studio measures its pitch, intonation, pace and tone and sets the sliders to match your voice-over to it; the Voice-over tab then offers **🎯 Like my sample** for every new voice-over. (This matches how the voice sounds, not the person's identity.)

Quick looks: Clear voice-over, Deep voice, Radio announcer, Warm podcast, Bright & crisp, Telephone, Big hall, Echo, Faster, Slower & calm, Chipmunk, Giant. Before/after waveforms with click-to-listen, and loudness/peak shown for both.

### 🎵 Extract audio tab
Drop one or many videos and get **MP3 (192/320 kbps) or WAV** for each in one go. Choose **Full sound**, **Voice only** (music and noise removed) or **Background only** (voice removed). Each result can be played, saved again, sent to Sound Studio or added to the video.

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
  audio/tts.ts            text → speech: Kokoro HD + Piper voices via onnxruntime-web + espeak-ng phonemizer (WASM)
  audio/studio.ts         Sound Studio chain: EQ, compression, echo, reverb, pitch, loudness
  audio/stretch.worker.ts speed change without pitch change (WSOLA), natural pitch shift (TD-PSOLA), pause shortening
  audio/separate*.ts      voice / background separation, MP3 encoding
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
- **Text to speech** uses Piper VITS voices (MIT) run with onnxruntime-web in single-thread WASM mode, so it works on GitHub Pages without special headers. The engine files (~30 MB) are copied into `public/tts` by `npm run build` (`scripts/copy-tts-assets.mjs`) and only load when the Voice-over tab is used. Voices are cached with the Cache Storage API.
- **Auto captions and person cut-out** load transformers.js and the model from a CDN the first time you use them, so that one time needs internet. Your audio and photos are processed locally and never uploaded. Everything else works fully offline once the page is loaded.

## 6. Troubleshooting
- **"Error" tag on a file:** the browser can't decode it. Convert to MP4 (H.264/AAC), JPG/PNG or MP3/WAV.
- **iPhone .MOV/HEVC clips** play in Safari but not in Chrome on Windows. Export them from the Photos app as "Most Compatible" first.
- **Export is slow:** close other heavy tabs, choose 720p, or use Chrome/Edge.
- **Microphone recording** needs the site to be on `https://`, which GitHub Pages is, or `localhost`.
