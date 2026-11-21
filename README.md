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

## 3. How to use it

| Step | What you do |
|---|---|
| 1 Type | Pick a video type (Promo, Highlights, Showcase/List, Story/Impact, Announcement/Invite, Tutorial/Steps, Slideshow/Memories, Custom), **or open one of the 8 ready examples**. |
| 2 Format | Choose the shape (16:9, 9:16, 1:1, 4:5), length (15 s to 3 min), language plus an optional second-language line, a style pack and the pace (Calm to Energetic). Save or apply **My brand** (logo, colours, fonts). |
| 3 Media | Drop videos, photos, logos, music and voice clips. Each row shows a thumbnail, duration and a Ready/Reading/Error tag. No music? Use **Make a simple music bed**. |
| 4 Content | Fill the table. Each row becomes one scene. Columns: Title, Subtitle, Highlight (`₹499`, `20 km`, `4.8★`, `Step 2`), Media, Badge. Paste from Excel/Sheets with **Ctrl+V** or import a CSV. Also edit the opening lines, main message and end card (website, phone, date & venue, social handles, QR code, logo, person cut-out). |
| 5 Speakers | Optional. Mark in/out points on a talking-head clip and type 2–4 key words. They fly in beside the speaker, and the music dips under the voice. |
| 6 Preview | Real-time preview with sound. Click a scene to edit it, drag scenes to reorder, and drag a scene's right edge to change its length. Use **Shuffle style** for a new look, record voiceovers per scene, and add captions. |
| 7 Export | Choose 1080p High, 720p Balanced or Small file (for WhatsApp/email). You can also tick extra shapes, such as a 9:16 version of a 16:9 project. Text repositions automatically. Extras: thumbnail PNG, `.srt` captions and a 6-second GIF. |

**Text colours:** in any heading, `*word*` uses the accent colour and `_word_` the second accent.
**Shortcuts (Preview):** Space play/pause · ← → 1 s (Shift = 5 s) · `[` `]` previous/next scene · Ctrl+D duplicate · Del delete · Ctrl+Z / Ctrl+Shift+Z undo/redo.

### CSV / Excel columns
The header row is optional. If you include one, these names are recognised:
`Title, Subtitle, Highlight, Badge, Media, Second`. "Media" is a file name you already added in step 3. Without a header, the column order is the same as listed.

### Saving projects
- Projects **autosave in this browser** (IndexedDB) and are listed under 📁 Projects.
- **Save project file** writes a single `.storycut` file with your media included. It uses the File System Access API where available and a normal download otherwise. Open it on any other computer with **Open project file**.
- **Save as template** keeps the look and scene plan, so the next video only needs a new list and new clips.

## 4. The 8 demo projects

They are on step 1 under "Or start from a ready example". Placeholder photos and music are generated in the browser, so they work offline. Each one exports a 30-second sample:

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
  components/             UI for each step, player, timeline, scene editor
```

### Technical notes
- **Text** is drawn with Canvas 2D, which uses the browser's text shaper, so Devanagari, Bengali, Tamil, Telugu and Gujarati conjuncts are correct. ffmpeg drawtext is not used. Fonts are bundled (Inter, Poppins, Montserrat, Noto Sans + Devanagari/Bengali/Tamil/Telugu/Gujarati, Mukta, Hind, Playfair Display). Text auto-shrinks to the safe zone, and the timeline flags scenes with ⚠ when text had to shrink a lot.
- **Export** renders frame by frame, seeks each video to the exact frame and encodes with WebCodecs. Audio is AAC where the browser has an AAC encoder (Chrome/Edge on Windows and macOS). Elsewhere it falls back to Opus in MP4, and the app shows a note.
- **Fallback encoder:** if WebCodecs is missing, the app records in real time with `MediaRecorder`. That gives MP4 in Safari and recent Chrome, and WebM elsewhere. ffmpeg.wasm was left out on purpose. Its multithreaded build needs special server headers (COOP/COEP) that GitHub Pages can't send, and its 30 MB download would slow down every visit.
- **Auto captions and person cut-out** load transformers.js and the model from a CDN the first time you use them, so that one time needs internet. Your audio and photos are processed locally and never uploaded. Everything else works fully offline once the page is loaded.

## 6. Troubleshooting
- **"Error" tag on a file:** the browser can't decode it. Convert to MP4 (H.264/AAC), JPG/PNG or MP3/WAV.
- **iPhone .MOV/HEVC clips** play in Safari but not in Chrome on Windows. Export them from the Photos app as "Most Compatible" first.
- **Export is slow:** close other heavy tabs, choose 720p, or use Chrome/Edge.
- **Microphone recording** needs the site to be on `https://`, which GitHub Pages is, or `localhost`.
