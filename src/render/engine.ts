// The renderer: draws any moment of a project onto a canvas. The same code is
// used for the live preview and for frame-exact export, at any size/aspect.
import QRCode from 'qrcode';
import type { Caption, MediaItem, Overlay, Project, Scene, StylePack } from '../types';
import type { Visual } from '../media';
import { clamp, easeInOutCubic, easeOutBack, easeOutCubic, graphemes, seeded } from '../util';
import { drawFit, drawLine, fitRich, fontString, formatCount, parseNumber, stripRich } from './text';
import { drawBackdrop, drawDecor, drawPanel, drawStreaks, hexA, isLight, roundRect } from './shapes';

export interface Runtime {
  /** Return a drawable for a media id. For videos, `time` is the wanted position in the clip. */
  visual(id: string | undefined, time?: number): Visual | null;
  overflow: Set<string>;
  layers: HTMLCanvasElement[];
}

export interface Safe { x: number; y: number; w: number; h: number; portrait: boolean; wide: boolean }
export function safeArea(W: number, H: number): Safe {
  const portrait = H > W * 1.15;
  const wide = W > H * 1.3;
  const mx = W * (portrait ? 0.07 : 0.06);
  const top = H * (portrait ? 0.1 : 0.08);
  const bottom = H * (portrait ? 0.16 : 0.09);
  return { x: mx, y: top, w: W - 2 * mx, h: H - top - bottom, portrait, wide };
}

export function timeline(p: Project) {
  const starts: number[] = [];
  let acc = 0;
  for (const s of p.scenes) { starts.push(acc); acc += s.duration; }
  return { starts, total: acc };
}
export const transitionDur = (style: StylePack) => clamp(0.5 / style.motion, 0.28, 0.7);

interface E {
  ctx: CanvasRenderingContext2D; W: number; H: number; u: number; S: Safe; style: StylePack;
  p: Project; rt: Runtime; scene: Scene; lt: number; dur: number; idx: number; start: number;
  media: Map<string, MediaItem>;
}

// ---------------------------------------------------------------- helpers
function contrastPick(bg: string, options: string[]) {
  const lum = (hex: string) => {
    const n = parseInt(hex.replace('#', '').padEnd(6, '0').slice(0, 6), 16);
    const c = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); });
    return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
  };
  const lb = lum(bg);
  for (const o of options) {
    const lo = lum(o);
    const ratio = (Math.max(lb, lo) + 0.05) / (Math.min(lb, lo) + 0.05);
    if (ratio >= 2.6) return o;
  }
  return isLight(bg) ? '#111111' : '#ffffff';
}

/** Where a scene starts inside its video when no start point was chosen. */
export const defaultIn = (m: MediaItem | undefined) => (m && m.duration > 6 ? m.duration * 0.2 : 0);

function mediaTime(e: E, id: string | undefined, local: number, clipIn?: number) {
  if (!id) return undefined;
  const m = e.media.get(id);
  if (!m || m.kind !== 'video') return undefined;
  const base = clipIn ?? defaultIn(m);
  let t = base + Math.max(0, local) * (e.scene.speed ?? 1);
  if (m.duration > 0.2 && t > m.duration - 0.05) t = (t % m.duration);
  return t;
}

function cover(e: E, id: string | undefined, x: number, y: number, w: number, h: number, time: number | undefined, zoom = 1, pan = 0, seed = '') {
  const { ctx } = e;
  const vis = e.rt.visual(id, time);
  if (!vis || !vis.w) {
    ctx.save();
    ctx.fillStyle = e.style.colors.bg2;
    ctx.fillRect(x, y, w, h);
    drawDecor(ctx, e.style, w, h, e.lt, seed || 'empty', 0.8);
    ctx.restore();
    return false;
  }
  const sc = e.scene;
  const rot = sc.rotate ?? 0;
  const swap = rot === 90 || rot === 270;
  const cr = sc.crop;
  const cx0 = cr ? cr.l * vis.w : 0, cy0 = cr ? cr.t * vis.h : 0;
  const cw = Math.max(2, vis.w * (1 - (cr?.l ?? 0) - (cr?.r ?? 0))), ch = Math.max(2, vis.h * (1 - (cr?.t ?? 0) - (cr?.b ?? 0)));
  const vw = swap ? ch : cw, vh = swap ? cw : ch;
  const look = lookFilter(sc);
  const draw = (scale: number, ox: number, oy: number, filter: string) => {
    ctx.save();
    ctx.beginPath(); ctx.rect(x, y, w, h); ctx.clip();
    if (filter !== 'none') ctx.filter = filter;
    ctx.translate(x + w / 2 + ox, y + h / 2 + oy);
    if (rot) ctx.rotate((rot * Math.PI) / 180);
    if (sc.flip) ctx.scale(-1, 1);
    const left = (-cw * scale) / 2, top = (-ch * scale) / 2;
    ctx.drawImage(vis.src, cx0, cy0, cw, ch, left, top, cw * scale, ch * scale);
    if (sc.marks?.length) {
      ctx.filter = 'none';
      for (const m of sc.marks) hideBox(ctx, vis.src, vis.w, vis.h, m, cx0, cy0, left, top, scale);
    }
    ctx.restore();
  };
  const coverScale = Math.max(w / vw, h / vh);
  if (sc.fit === 'fit') {
    // whole picture, with a soft blurred copy filling the empty bands
    const blur = `blur(${Math.round(Math.min(w, h) / 40)}px) brightness(0.65)${look === 'none' ? '' : ' ' + look}`;
    draw(coverScale * 1.1, 0, 0, blur);
    draw(Math.min(w / vw, h / vh) * (1 + (zoom - 1) * 0.3), 0, 0, look);
    return true;
  }
  const s = coverScale * zoom;
  const dw = vw * s, dh = vh * s;
  const r = seeded(seed || String(id));
  const dir = r() > 0.5 ? 1 : -1;
  const dx = (dw - w) / 2 * pan * dir;
  const dy = (dh - h) / 2 * pan * (r() > 0.5 ? 1 : -1) * 0.6;
  draw(s, dx, dy, look);
  return true;
}

/** Remove (smooth fill from the box edges, like ffmpeg delogo) or blur one area of the source frame. */
function hideBox(ctx: CanvasRenderingContext2D, src: CanvasImageSource, sw: number, sh: number, m: { x: number; y: number; w: number; h: number; mode: 'fill' | 'blur' }, cx0: number, cy0: number, left: number, top: number, scale: number) {
  const bx = clamp(m.x, 0, 1) * sw, by = clamp(m.y, 0, 1) * sh;
  const bw = Math.max(2, Math.min(sw - bx, m.w * sw)), bh = Math.max(2, Math.min(sh - by, m.h * sh));
  const dx = left + (bx - cx0) * scale, dy = top + (by - cy0) * scale, dw = bw * scale, dh = bh * scale;
  const pad = Math.max(1, Math.min(bw, bh) * 0.06);
  ctx.save();
  ctx.beginPath(); ctx.rect(dx, dy, dw, dh); ctx.clip();
  if (m.mode === 'blur') {
    ctx.filter = `blur(${Math.max(4, Math.round(Math.min(dw, dh) / 5))}px)`;
    const ex = Math.min(bw, bh) * 0.4;
    const sx = Math.max(0, bx - ex), sy = Math.max(0, by - ex);
    const sx2 = Math.min(sw, bx + bw + ex), sy2 = Math.min(sh, by + bh + ex);
    ctx.drawImage(src, sx, sy, sx2 - sx, sy2 - sy, left + (sx - cx0) * scale, top + (sy - cy0) * scale, (sx2 - sx) * scale, (sy2 - sy) * scale);
  } else {
    // Stretch the thin strips just outside each edge across the box, then soften.
    ctx.filter = `blur(${Math.max(2, Math.round(Math.min(dw, dh) / 8))}px)`;
    const strips: [number, number, number, number, number][] = [];
    if (bx - pad >= 0) strips.push([bx - pad, by, pad, bh, 1]);
    if (bx + bw + pad <= sw) strips.push([bx + bw, by, pad, bh, 0.5]);
    if (by - pad >= 0) strips.push([bx, by - pad, bw, pad, 0.5]);
    if (by + bh + pad <= sh) strips.push([bx, by + bh, bw, pad, 0.33]);
    if (!strips.length) strips.push([bx, by, bw, bh, 1]);
    strips.forEach(([sx, sy, w2, h2, a], i) => {
      ctx.globalAlpha = i === 0 ? 1 : a;
      ctx.drawImage(src, sx, sy, w2, h2, dx - dw * 0.1, dy - dh * 0.1, dw * 1.2, dh * 1.2);
    });
  }
  ctx.restore();
}

const LOOK_PRESETS: Record<string, string> = {
  vivid: 'saturate(1.35) contrast(1.08)', warm: 'sepia(0.22) saturate(1.2) brightness(1.03)', cool: 'hue-rotate(-10deg) saturate(1.05) brightness(1.03)',
  bw: 'grayscale(1) contrast(1.12)', vintage: 'sepia(0.45) contrast(0.95) brightness(1.05)', fade: 'contrast(0.85) brightness(1.08) saturate(0.8)',
};
export function lookFilter(s: Scene) {
  const l = s.look;
  if (!l) return 'none';
  const parts: string[] = [];
  if (l.preset && l.preset !== 'none') parts.push(LOOK_PRESETS[l.preset]);
  if (l.brightness !== 1) parts.push(`brightness(${l.brightness})`);
  if (l.contrast !== 1) parts.push(`contrast(${l.contrast})`);
  if (l.saturation !== 1) parts.push(`saturate(${l.saturation})`);
  return parts.length ? parts.join(' ') : 'none';
}

function contain(e: E, id: string | undefined, x: number, y: number, w: number, h: number, alignBottom = false) {
  const vis = e.rt.visual(id);
  if (!vis || !vis.w) return null;
  const s = Math.min(w / vis.w, h / vis.h);
  const dw = vis.w * s, dh = vis.h * s;
  const dx = x + (w - dw) / 2, dy = alignBottom ? y + h - dh : y + (h - dh) / 2;
  e.ctx.drawImage(vis.src, dx, dy, dw, dh);
  return { x: dx, y: dy, w: dw, h: dh };
}

function kenBurns(e: E, id: string | undefined, time?: number) {
  const k = e.lt / Math.max(0.5, e.dur);
  const zoom = 1.03 + 0.12 * k * e.style.motion;
  cover(e, id, 0, 0, e.W, e.H, time, zoom, k * 0.6, e.scene.id);
}

function overlay(e: E, a = 0.5) {
  const { ctx, W, H } = e;
  const g = ctx.createLinearGradient(0, 0, 0, H);
  g.addColorStop(0, hexA(e.style.colors.bg, a * 0.55));
  g.addColorStop(1, hexA(e.style.colors.bg, Math.min(0.92, a * 1.35)));
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, W, H);
}

const shadowFor = (e: E) => (isLight(e.style.colors.text) ? 'rgba(0,0,0,0.45)' : 'rgba(255,255,255,0.35)');
function pill(e: E, text: string, x: number, y: number, size: number, bg: string, align: 'left' | 'right' | 'center' = 'left', alpha = 1) {
  const { ctx, style } = e;
  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.font = fontString(style.fontBody, 700, size);
  const w = ctx.measureText(text).width + size * 1.4;
  const h = size * 1.75;
  const x0 = align === 'left' ? x : align === 'right' ? x - w : x - w / 2;
  roundRect(ctx, x0, y, w, h, h / 2);
  ctx.fillStyle = bg;
  ctx.fill();
  ctx.fillStyle = isLight(bg) ? '#111111' : '#ffffff';
  ctx.textBaseline = 'middle';
  ctx.textAlign = 'left';
  ctx.fillText(text, x0 + size * 0.7, y + h / 2 + size * 0.04);
  ctx.restore();
  return { w, h };
}

function fadeUp(e: E, at: number, dur = 0.45) {
  const k = clamp((e.lt - at) / (dur / e.style.motion), 0, 1);
  return { a: easeOutCubic(k), dy: (1 - easeOutCubic(k)) * e.u * 2.5 };
}

function popAnim(e: E, startAt: number, stagger: number) {
  const m = e.style.motion;
  return (i: number) => {
    const k = (e.lt - startAt - (i * stagger) / m) / (0.42 / m);
    if (k <= 0) return { alpha: 0, scale: 0.5, dx: 0, dy: 0 };
    return { alpha: Math.min(1, k * 2.2), scale: 0.45 + 0.55 * easeOutBack(k), dx: 0, dy: (1 - easeOutCubic(k)) * e.u * 3 };
  };
}

function second(e: E, text: string | undefined, x: number, y: number, maxW: number, size: number, color: string, align: CanvasTextAlign = 'left', alpha = 1) {
  if (!text) return 0;
  e.ctx.save();
  e.ctx.globalAlpha = alpha * 0.92;
  const r = drawLine(e.ctx, text, e.style.fontBody, 500, size, x, y, maxW, color, align, size * 0.5);
  if (r.overflow) e.rt.overflow.add(e.scene.id);
  e.ctx.restore();
  return r.size * 1.4;
}

// ---------------------------------------------------------------- scenes
function sceneHook(e: E) {
  const { ctx, S, style, u, scene } = e;
  const c = style.colors;
  if (scene.mediaIds[0]) {
    const k = e.lt / e.dur;
    cover(e, scene.mediaIds[0], 0, 0, e.W, e.H, mediaTime(e, scene.mediaIds[0], e.lt, scene.clipIn), 1.0 + 0.15 * k * style.motion, 0.3 * k, scene.id);
    overlay(e, 0.6);
    drawDecor(ctx, style, e.W, e.H, e.lt, scene.id, 0.6);
  } else drawBackdrop(ctx, style, e.W, e.H, e.lt, scene.id);
  const lines = scene.texts.lines?.length ? scene.texts.lines : ['Your headline'];
  const maxSize = (S.portrait ? 13 : 12) * u;
  const fit = fitRich(ctx, lines, style.fontHead, style.headWeight, S.w * 0.92, S.h * 0.62, maxSize, 3.2 * u, 1.1, 5);
  if (fit.overflow) e.rt.overflow.add(scene.id);
  const sec = scene.texts.second ? 5 * u : 0;
  const y = S.y + (S.h - fit.height - sec) / 2;
  drawFit(ctx, fit, e.W / 2, y, 'center', [c.text, c.accent, c.accent2], popAnim(e, 0.15, 0.11), shadowFor(e));
  const f = fadeUp(e, 0.6 + 0.11 * fit.rows.length);
  second(e, scene.texts.second, e.W / 2, y + fit.height + u, S.w, 3.6 * u, c.text, 'center', f.a);
}

export function montageCuts(scene: Scene, start: number, p: Project): number[] {
  const n = Math.max(1, scene.mediaIds.length);
  const d = scene.duration;
  const cuts = [0];
  for (let i = 1; i < n; i++) {
    let target = (i * d) / n;
    if (p.snapToBeats && p.beats.length) {
      let best = target, bestDist = 0.45;
      for (const b of p.beats) {
        const rel = b - start;
        const dist = Math.abs(rel - target);
        if (dist < bestDist && rel > cuts[cuts.length - 1] + 0.45 && rel < d - 0.45) { best = rel; bestDist = dist; }
      }
      target = best;
    }
    cuts.push(target);
  }
  cuts.push(d);
  return cuts;
}

function sceneMontage(e: E) {
  const { ctx, scene, u, S, style } = e;
  const cuts = montageCuts(scene, e.start, e.p);
  let i = 0;
  while (i < cuts.length - 2 && e.lt >= cuts[i + 1]) i++;
  const segT = e.lt - cuts[i];
  const segD = cuts[i + 1] - cuts[i];
  const id = scene.mediaIds[i];
  const punch = 1.12 - 0.1 * easeOutCubic(segT / Math.max(0.2, segD));
  cover(e, id, 0, 0, e.W, e.H, mediaTime(e, id, segT), punch, 0.2, scene.id + i);
  if (i > 0 && segT < 0.12) {
    ctx.fillStyle = `rgba(255,255,255,${0.4 * (1 - segT / 0.12)})`;
    ctx.fillRect(0, 0, e.W, e.H);
  }
  if (scene.texts.caption) {
    const f = fadeUp(e, 0.2);
    ctx.save();
    ctx.font = fontString(style.fontHead, style.headWeight, 5 * u);
    pill(e, stripRich(scene.texts.caption), S.x, S.y + S.h - 9 * u + f.dy, 4.2 * u, style.colors.accent, 'left', f.a);
    ctx.restore();
  }
}

function sceneSpeaker(e: E) {
  const { ctx, S, style, u, scene } = e;
  const c = style.colors;
  drawBackdrop(ctx, style, e.W, e.H, e.lt, scene.id, 0.9);
  const portrait = S.portrait || (!S.wide && e.H >= e.W);
  const fx = S.x, fy = S.y;
  const fw = portrait ? S.w : S.w * 0.46;
  const fh = portrait ? S.h * 0.56 : S.h;
  const intro = easeOutCubic(clamp(e.lt / (0.5 / style.motion), 0, 1));
  const cut = scene.mediaIds.find((id) => e.media.get(id)?.role === 'cutout');
  const clip = scene.mediaIds.find((id) => id !== cut);
  ctx.save();
  ctx.globalAlpha = intro;
  ctx.translate(-(1 - intro) * 8 * u, 0);
  if (cut) {
    contain(e, cut, fx, fy, fw, fh, true);
  } else {
    ctx.save();
    roundRect(ctx, fx, fy, fw, fh, 2.4 * u);
    ctx.clip();
    cover(e, clip, fx, fy, fw, fh, mediaTime(e, clip, e.lt, scene.clipIn), 1.02 + 0.04 * (e.lt / e.dur), 0, scene.id);
    ctx.restore();
    roundRect(ctx, fx, fy, fw, fh, 2.4 * u);
    ctx.strokeStyle = c.accent;
    ctx.lineWidth = u * 0.55;
    ctx.stroke();
  }
  ctx.restore();
  if (scene.texts.name) {
    const f = fadeUp(e, 0.5);
    const r = pill(e, scene.texts.name, fx + 2 * u, fy + fh - 9.5 * u + f.dy, 3.2 * u, c.panel, 'left', f.a);
    if (scene.texts.role) {
      ctx.save(); ctx.globalAlpha = f.a;
      drawLine(ctx, scene.texts.role, style.fontBody, 500, 2.6 * u, fx + 2.6 * u, fy + fh - 9.5 * u + r.h + 0.6 * u, fw - 4 * u, '#ffffff', 'left');
      ctx.restore();
    }
  }
  // Kinetic words
  const raw = scene.texts.words ?? '';
  const words = (raw.includes(',') ? raw.split(',') : raw.split(/\s+/)).map((w) => w.trim()).filter(Boolean).slice(0, 4);
  const ax = portrait ? S.x : S.x + fw + 4 * u;
  const ay = portrait ? S.y + fh + 3 * u : S.y;
  const aw = portrait ? S.w : S.w - fw - 4 * u;
  const ah = portrait ? S.h - fh - 3 * u : S.h;
  drawStreaks(ctx, ax - 4 * u, ay, aw + 8 * u, ah, e.lt, c.accent, u, scene.id);
  if (!words.length) return;
  const gap = Math.min(1.1, Math.max(0.35, (e.dur - 1) / words.length));
  const each = Math.min(ah / words.length, 16 * u);
  const colors = [c.text, c.accent, c.text, c.accent2];
  const blockH = each * words.length;
  let y = ay + (ah - blockH) / 2;
  words.forEach((w, i) => {
    const fit = fitRich(ctx, [w], style.fontHead, style.headWeight, aw, each * 0.92, 13 * u, 3 * u, 1.05, 1);
    if (fit.overflow) e.rt.overflow.add(scene.id);
    const k = clamp((e.lt - 0.35 - i * gap) / (0.45 / style.motion), 0, 1);
    if (k > 0) {
      const ek = easeOutBack(k);
      ctx.save();
      ctx.globalAlpha = Math.min(1, k * 2);
      ctx.translate((1 - ek) * 25 * u, 0);
      drawFit(ctx, fit, portrait ? e.W / 2 : ax, y + (each - fit.height) / 2, portrait ? 'center' : 'left', [colors[i % 4], c.accent, c.accent2], undefined, shadowFor(e));
      ctx.restore();
    }
    y += each;
  });
}

function sceneHeadline(e: E) {
  const { ctx, S, style, u, scene, W, H } = e;
  const c = style.colors;
  const ids = scene.mediaIds.slice(0, 4);
  if (ids.length) {
    const n = ids.length;
    const cols = n === 1 ? 1 : 2, rows = n <= 2 ? 1 : 2;
    const g = u * 0.8;
    const cw = (W - g * (cols + 1)) / cols, ch = (H - g * (rows + 1)) / rows;
    ctx.fillStyle = c.bg; ctx.fillRect(0, 0, W, H);
    ids.forEach((id, i) => {
      const cx = g + (i % cols) * (cw + g), cy = g + Math.floor(i / cols) * (ch + g);
      const drift = (i % 2 ? 1 : -1) * e.lt * u * 0.8 * style.motion;
      const h = n === 3 && i === 2 ? ch : ch;
      const w = n === 3 && i === 2 ? W - 2 * g : cw;
      cover(e, id, cx, cy + (i < 2 ? 0 : 0), w, h, mediaTime(e, id, e.lt), 1.1, 0.3, scene.id + i);
      void drift;
    });
    overlay(e, 0.35);
  } else drawBackdrop(ctx, style, W, H, e.lt, scene.id);
  const msg = (scene.texts.lines?.length ? scene.texts.lines : ['Your main message']).map(stripRich);
  const pw = S.portrait ? S.w : Math.min(S.w * 0.66, S.w);
  const pad = 3.2 * u;
  const fit = fitRich(ctx, msg, style.fontHead, style.headWeight, pw - 2 * pad, S.h * 0.55, (S.portrait ? 9 : 8) * u, 3 * u, 1.15, 6);
  if (fit.overflow) e.rt.overflow.add(scene.id);
  const sec = scene.texts.second ? 5 * u : 0;
  const ph = fit.height + 2 * pad + sec;
  const px = S.x, py = S.y + (S.h - ph) / 2;
  drawPanel(ctx, style, px, py, pw, ph, u, clamp(e.lt / (0.55 / style.motion), 0, 1), 'left');
  // typewriter by grapheme (keeps Indic clusters intact)
  const allWords = fit.rows.flatMap((r) => r.words);
  const totalG = allWords.reduce((n, w) => n + graphemes(w.w).length + 1, 0);
  const cps = 26 * style.motion;
  let budget = Math.floor(Math.max(0, e.lt - 0.45) * cps);
  if (e.lt > e.dur - 0.4) budget = totalG;
  const tc = contrastPick(c.panel, [c.panelText, c.text]);
  ctx.save();
  ctx.font = fit.font;
  ctx.fillStyle = tc;
  ctx.textBaseline = 'alphabetic';
  ctx.textAlign = 'left';
  fit.rows.forEach((row, ri) => {
    const by = py + pad + ri * fit.lineH + fit.size * 0.95;
    for (const w of row.words) {
      if (budget <= 0) break;
      const gs = graphemes(w.w);
      const part = budget >= gs.length ? w.w : gs.slice(0, budget).join('');
      budget -= gs.length + 1;
      ctx.fillText(part, px + pad + w.x, by);
    }
  });
  ctx.restore();
  const f = fadeUp(e, 1.0);
  second(e, scene.texts.second, px + pad, py + pad + fit.height + 0.8 * u, pw - 2 * pad, 3.2 * u, tc, 'left', f.a);
  // accent cursor bar
  ctx.fillStyle = c.accent;
  ctx.fillRect(px + pad, py + ph - pad * 0.55, Math.min(pw * 0.25, 14 * u) * easeOutCubic(clamp((e.lt - 0.6) / 0.6, 0, 1)), Math.max(2, u * 0.5));
}

function sceneItem(e: E) {
  const { ctx, S, style, u, scene } = e;
  const c = style.colors;
  const id = scene.mediaIds[0];
  if (id) kenBurns(e, id, mediaTime(e, id, e.lt, scene.clipIn));
  else drawBackdrop(ctx, style, e.W, e.H, e.lt, scene.id);
  // bottom gradient so the panel never floats on a busy photo
  const g = ctx.createLinearGradient(0, e.H * 0.55, 0, e.H);
  g.addColorStop(0, 'rgba(0,0,0,0)'); g.addColorStop(1, 'rgba(0,0,0,0.38)');
  ctx.fillStyle = g; ctx.fillRect(0, e.H * 0.55, e.W, e.H * 0.45);

  const t = scene.texts;
  const pw = S.wide ? Math.min(S.w * 0.56, 120 * u) : S.w;
  const pad = 2.6 * u;
  const iw = pw - 2 * pad;
  const tc = contrastPick(c.panel, [c.panelText, c.text]);
  const hc = contrastPick(c.panel, [c.accent, c.accent2, c.panelText]);
  const num = t.highlight ? parseNumber(t.highlight) : null;
  const hlSize = (S.wide ? 7.5 : 8.5) * u;
  const hlH = t.highlight ? hlSize * 1.2 : 0;
  const titleFit = t.title ? fitRich(ctx, [t.title], style.fontHead, style.headWeight, iw, 20 * u, (S.wide ? 6 : 6.8) * u, 3.4 * u, 1.12, 3) : null;
  const subFit = t.subtitle ? fitRich(ctx, [stripRich(t.subtitle)], style.fontBody, 500, iw, 9 * u, 3.4 * u, 2 * u, 1.25, 2) : null;
  if (titleFit?.overflow || subFit?.overflow) e.rt.overflow.add(scene.id);
  const secH = t.second ? 4.4 * u : 0;
  const ph = pad + hlH + (titleFit?.height ?? 0) + (subFit ? subFit.height + 0.8 * u : 0) + secH + pad;
  if (ph <= 2 * pad + 1) return badge(e);
  const px = S.x, py = S.y + S.h - ph;
  const pIn = clamp((e.lt - 0.15) / (0.5 / style.motion), 0, 1);
  drawPanel(ctx, style, px, py, pw, ph, u, pIn, 'left');
  let y = py + pad;
  if (t.highlight) {
    const f = fadeUp(e, 0.35);
    const k = easeOutCubic(clamp((e.lt - 0.35) / 1.1, 0, 1));
    ctx.save(); ctx.globalAlpha = f.a;
    const r = drawLine(ctx, num ? formatCount(num, k) : t.highlight, style.fontHead, style.headWeight, hlSize, px + pad, y + f.dy - hlSize * 0.08, iw, hc, 'left', 2 * u);
    if (r.overflow) e.rt.overflow.add(scene.id);
    ctx.restore();
    y += hlH;
  }
  if (titleFit) {
    const f = fadeUp(e, 0.45);
    ctx.save(); ctx.globalAlpha = f.a;
    drawFit(ctx, titleFit, px + pad, y + f.dy, 'left', [tc, hc, c.accent2]);
    ctx.restore();
    y += titleFit.height;
  }
  if (subFit) {
    const f = fadeUp(e, 0.6);
    ctx.save(); ctx.globalAlpha = f.a * 0.88;
    drawFit(ctx, subFit, px + pad, y + 0.8 * u + f.dy, 'left', [tc, hc, tc]);
    ctx.restore();
    y += subFit.height + 0.8 * u;
  }
  if (t.second) second(e, t.second, px + pad, y + 0.6 * u, iw, 3 * u, tc, 'left', fadeUp(e, 0.75).a);
  badge(e);
}

function badge(e: E) {
  const t = e.scene.texts;
  if (!t.badge) return;
  const k = clamp((e.lt - 0.55) / 0.35, 0, 1);
  if (k <= 0) return;
  const { ctx, S, u } = e;
  const small = /representative|illustrative|indicative|प्रतीकात्मक|सांकेतिक/i.test(t.badge);
  ctx.save();
  const s = easeOutBack(k);
  const x = S.x + S.w, y = S.y;
  ctx.translate(x, y); ctx.scale(s, s); ctx.translate(-x, -y);
  pill(e, t.badge, x, y, (small ? 2.4 : 3.4) * u, small ? 'rgba(0,0,0,0.55)' : e.style.colors.accent2, 'right');
  ctx.restore();
}

function sceneSteps(e: E) {
  const { ctx, S, style, u, scene } = e;
  const c = style.colors;
  const entries = scene.entries ?? [];
  if (scene.mode === 'compare') {
    const [a, b] = scene.mediaIds;
    const portrait = S.portrait;
    const k = easeInOutCubic(clamp((e.lt - 0.4) / (Math.min(2.2, e.dur * 0.5)), 0, 1));
    const split = 1 - 0.5 * k; // reveal "after" from 100% to 50%
    cover(e, b, 0, 0, e.W, e.H, mediaTime(e, b, e.lt), 1.05, 0, scene.id + 'b');
    ctx.save();
    ctx.beginPath();
    if (portrait) ctx.rect(0, 0, e.W, e.H * split); else ctx.rect(0, 0, e.W * split, e.H);
    ctx.clip();
    cover(e, a, 0, 0, e.W, e.H, mediaTime(e, a, e.lt), 1.05, 0, scene.id + 'a');
    ctx.restore();
    ctx.fillStyle = c.accent;
    if (portrait) ctx.fillRect(0, e.H * split - u * 0.4, e.W, u * 0.8); else ctx.fillRect(e.W * split - u * 0.4, 0, u * 0.8, e.H);
    const la = entries[0]?.label || 'Before', lb = entries[1]?.label || 'After';
    pill(e, la, S.x, S.y, 3.4 * u, c.panel);
    const f = fadeUp(e, 0.8);
    if (portrait) pill(e, lb, S.x, e.H * 0.5 + 2 * u, 3.4 * u, c.accent, 'left', f.a);
    else pill(e, lb, S.x + S.w, S.y, 3.4 * u, c.accent, 'right', f.a);
    if (scene.texts.title) {
      const tf = fitRich(ctx, [scene.texts.title], style.fontHead, style.headWeight, S.w, 12 * u, 6 * u, 2.5 * u, 1.1, 2);
      drawFit(ctx, tf, e.W / 2, S.y + S.h - tf.height, 'center', ['#ffffff', c.accent, c.accent2], undefined, 'rgba(0,0,0,0.6)');
    }
    return;
  }
  const bgId = scene.mediaIds[0];
  if (bgId) { kenBurns(e, bgId, mediaTime(e, bgId, e.lt)); overlay(e, 0.85); } else drawBackdrop(ctx, style, e.W, e.H, e.lt, scene.id, 0.7);
  let y = S.y;
  if (scene.texts.title) {
    const f = fadeUp(e, 0.1);
    const tf = fitRich(ctx, [scene.texts.title], style.fontHead, style.headWeight, S.w, 14 * u, 7 * u, 3 * u, 1.1, 2);
    if (tf.overflow) e.rt.overflow.add(scene.id);
    ctx.save(); ctx.globalAlpha = f.a;
    drawFit(ctx, tf, S.x, y + f.dy, 'left', [c.text, c.accent, c.accent2]);
    ctx.restore();
    y += tf.height + 3 * u;
  }
  const list = entries.slice(0, 6);
  if (!list.length) return;
  const rowH = Math.min((S.y + S.h - y) / list.length, 15 * u);
  const per = Math.max(0.35, (e.dur * 0.7) / list.length);
  const active = Math.min(list.length - 1, Math.floor(Math.max(0, e.lt - 0.3) / per));
  list.forEach((en, i) => {
    const k = clamp((e.lt - 0.3 - i * per) / (0.4 / style.motion), 0, 1);
    if (k <= 0) return;
    const ry = y + i * rowH;
    const r = rowH * 0.34;
    ctx.save();
    ctx.globalAlpha = easeOutCubic(k) * (i === active ? 1 : 0.72);
    ctx.translate((1 - easeOutCubic(k)) * -6 * u, 0);
    ctx.beginPath(); ctx.arc(S.x + r, ry + rowH / 2, r, 0, Math.PI * 2);
    ctx.fillStyle = i === active ? c.accent : hexA(c.accent, 0.5); ctx.fill();
    ctx.font = fontString(style.fontHead, 800, r * 1.1);
    ctx.fillStyle = isLight(c.accent) ? '#111' : '#fff';
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText(String(i + 1), S.x + r, ry + rowH / 2 + r * 0.05);
    const lx = S.x + r * 2 + 2.4 * u;
    const lw = S.w - (lx - S.x);
    const lab = fitRich(ctx, [en.label], style.fontHead, 700, lw, rowH * (en.value ? 0.55 : 0.8), rowH * 0.36, 2.2 * u, 1.1, 2);
    if (lab.overflow) e.rt.overflow.add(scene.id);
    const total = lab.height + (en.value ? rowH * 0.28 : 0);
    const ty = ry + (rowH - total) / 2;
    drawFit(ctx, lab, lx, ty, 'left', [c.text, c.accent, c.accent2]);
    if (en.value) drawLine(ctx, en.value, style.fontBody, 500, rowH * 0.2, lx, ty + lab.height + 0.2 * u, lw, hexA(c.text, 0.8), 'left', 1.6 * u);
    ctx.restore();
  });
}

function sceneStat(e: E) {
  const { ctx, S, style, u, scene } = e;
  const c = style.colors;
  const bgId = scene.mediaIds[0];
  if (bgId) { kenBurns(e, bgId, mediaTime(e, bgId, e.lt)); overlay(e, 0.9); } else drawBackdrop(ctx, style, e.W, e.H, e.lt, scene.id);
  let top = S.y;
  if (scene.texts.title) {
    const tf = fitRich(ctx, [scene.texts.title], style.fontHead, style.headWeight, S.w, 12 * u, 6 * u, 2.5 * u, 1.1, 2);
    if (tf.overflow) e.rt.overflow.add(scene.id);
    const f = fadeUp(e, 0.05);
    ctx.save(); ctx.globalAlpha = f.a;
    drawFit(ctx, tf, e.W / 2, top + f.dy, 'center', [c.text, c.accent, c.accent2]);
    ctx.restore();
    top += tf.height + 3 * u;
  }
  const list = (scene.entries ?? []).slice(0, 3);
  if (!list.length) return;
  const n = list.length;
  const vertical = S.portrait || (n === 3 && !S.wide);
  const cellW = vertical ? S.w : S.w / n;
  const cellH = vertical ? (S.y + S.h - top) / n : S.y + S.h - top;
  list.forEach((en, i) => {
    const cx = vertical ? e.W / 2 : S.x + cellW * (i + 0.5);
    const cy = vertical ? top + cellH * (i + 0.5) : top + cellH / 2;
    const st = 0.25 + i * 0.3 / style.motion;
    const k = clamp((e.lt - st) / 1.3, 0, 1);
    const ek = easeOutCubic(k);
    if (k <= 0) return;
    const ring = Math.min(cellW, cellH) * (vertical ? 0.16 : 0.13);
    const ny = vertical ? cy - cellH * 0.1 : cy;
    ctx.save();
    ctx.globalAlpha = Math.min(1, k * 3);
    // icon ring
    const rx = vertical ? S.x + ring : cx, ry = vertical ? cy : cy - cellH * 0.26;
    ctx.lineWidth = ring * 0.18;
    ctx.strokeStyle = hexA(c.accent, 0.25);
    ctx.beginPath(); ctx.arc(rx, ry, ring * 0.8, 0, Math.PI * 2); ctx.stroke();
    ctx.strokeStyle = i % 2 ? c.accent2 : c.accent;
    ctx.beginPath(); ctx.arc(rx, ry, ring * 0.8, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * ek); ctx.stroke();
    ctx.fillStyle = i % 2 ? c.accent2 : c.accent;
    ctx.beginPath(); ctx.arc(rx, ry, ring * 0.28 * easeOutBack(k), 0, Math.PI * 2); ctx.fill();
    const num = parseNumber(en.value);
    const txt = num ? formatCount(num, ek) : en.value;
    const tx = vertical ? S.x + ring * 2.4 : cx;
    const tw = vertical ? S.w - ring * 2.4 : cellW * 0.92;
    const align: CanvasTextAlign = vertical ? 'left' : 'center';
    const vs = Math.min(cellH * (vertical ? 0.42 : 0.24), 14 * u);
    const r1 = drawLine(ctx, txt, style.fontHead, style.headWeight, vs, tx, vertical ? ny - vs * 0.55 : cy - vs * 0.35, tw, c.text, align, 2 * u);
    const r2 = drawLine(ctx, en.label, style.fontBody, 600, Math.max(2.2 * u, vs * 0.3), tx, (vertical ? ny - vs * 0.55 : cy - vs * 0.35) + r1.size * 1.15, tw, hexA(c.text, 0.85), align, 1.6 * u);
    if (r1.overflow || r2.overflow) e.rt.overflow.add(scene.id);
    ctx.restore();
  });
}

function sceneMoment(e: E) {
  const { scene, u, S, style } = e;
  const id = scene.mediaIds[0];
  const k = e.lt / Math.max(0.5, e.dur);
  cover(e, id, 0, 0, e.W, e.H, mediaTime(e, id, e.lt, scene.clipIn), 1.02 + 0.05 * k, 0.15 * k, scene.id);
  if (scene.texts.caption) {
    const f = fadeUp(e, 0.4);
    const ctx = e.ctx;
    const fit = fitRich(ctx, [scene.texts.caption], style.fontBody, 600, S.w * 0.8, 10 * u, 3.6 * u, 2 * u, 1.2, 2);
    if (fit.overflow) e.rt.overflow.add(scene.id);
    const bw = fit.width + 4 * u, bh = fit.height + 2.4 * u;
    ctx.save(); ctx.globalAlpha = f.a;
    roundRect(ctx, (e.W - bw) / 2, S.y + S.h - bh + f.dy, bw, bh, 1.5 * u);
    ctx.fillStyle = 'rgba(0,0,0,0.5)'; ctx.fill();
    drawFit(ctx, fit, e.W / 2, S.y + S.h - bh + 1.2 * u + f.dy, 'center', ['#ffffff', style.colors.accent, style.colors.accent2]);
    ctx.restore();
  }
}

const qrCache = new Map<string, HTMLCanvasElement>();
function qrCanvas(text: string) {
  let cv = qrCache.get(text);
  if (cv) return cv;
  try {
    const qr = QRCode.create(text, { errorCorrectionLevel: 'M' });
    const n = qr.modules.size;
    const px = 8;
    cv = document.createElement('canvas');
    cv.width = cv.height = (n + 2) * px;
    const g = cv.getContext('2d')!;
    g.fillStyle = '#fff'; g.fillRect(0, 0, cv.width, cv.height);
    g.fillStyle = '#000';
    for (let r = 0; r < n; r++) for (let c = 0; c < n; c++) if (qr.modules.get(r, c)) g.fillRect((c + 1) * px, (r + 1) * px, px, px);
    qrCache.set(text, cv);
    return cv;
  } catch { return null; }
}

function sceneCta(e: E) {
  const { ctx, S, style, u, scene, p } = e;
  const c = style.colors;
  const bgId = scene.mediaIds.find((id) => e.media.get(id)?.role !== 'logo' && e.media.get(id)?.role !== 'cutout');
  if (bgId) { kenBurns(e, bgId, mediaTime(e, bgId, e.lt)); overlay(e, 0.95); drawDecor(ctx, style, e.W, e.H, e.lt, scene.id, 0.8); }
  else drawBackdrop(ctx, style, e.W, e.H, e.lt, scene.id);
  const cta = p.cta;
  const qr = cta.qr ? qrCanvas(cta.qr) : null;
  const cut = cta.cutoutId;
  const side = S.wide && (qr || cut);
  const colW = side ? S.w * 0.6 : S.w;
  const align: 'left' | 'center' = side ? 'left' : 'center';
  const ax = side ? S.x : e.W / 2;
  // measure blocks
  const logoH = cta.logoId ? (S.portrait ? 12 : 14) * u : 0;
  const title = scene.texts.title || cta.title;
  const tf = title ? fitRich(ctx, [title], style.fontHead, style.headWeight, colW, S.h * 0.3, (S.portrait ? 10 : 9) * u, 3 * u, 1.1, 3) : null;
  if (tf?.overflow) e.rt.overflow.add(scene.id);
  const sub = scene.texts.subtitle ?? cta.subtitle;
  const info = [cta.website, cta.contact, cta.dateVenue, cta.social].filter(Boolean);
  const infoSize = (S.portrait ? 3.6 : 3.4) * u;
  const qrS = qr ? Math.min(S.portrait ? 26 * u : 24 * u, S.h * 0.32) : 0;
  const stackH = logoH + (logoH ? 3 * u : 0) + (tf?.height ?? 0) + (sub ? 6 * u : 0) + (info.length ? 2 * u + info.length * infoSize * 1.55 : 0) + (!side && qr ? qrS + 3 * u : 0) + (scene.texts.second ? 5 * u : 0);
  let y = S.y + Math.max(0, (S.h - stackH) / 2);
  let step = 0;
  const nextFade = () => fadeUp(e, 0.15 + 0.12 * step++);
  if (cta.logoId) {
    const f = nextFade();
    ctx.save(); ctx.globalAlpha = f.a;
    const lw = colW * 0.5;
    contain(e, cta.logoId, align === 'center' ? ax - lw / 2 : ax, y + f.dy, lw, logoH);
    ctx.restore();
    y += logoH + 3 * u;
  }
  if (tf) {
    drawFit(ctx, tf, ax, y, align, [c.text, c.accent, c.accent2], popAnim(e, 0.25, 0.08), shadowFor(e));
    y += tf.height;
    step++;
  }
  if (sub) {
    const f = nextFade();
    ctx.save(); ctx.globalAlpha = f.a;
    const r = drawLine(ctx, sub, style.fontBody, 500, 3.8 * u, ax, y + 1.5 * u + f.dy, colW, hexA(c.text, 0.88), align, 2 * u);
    if (r.overflow) e.rt.overflow.add(scene.id);
    ctx.restore();
    y += 6 * u;
  }
  if (scene.texts.second) { y += second(e, scene.texts.second, ax, y, colW, 3.2 * u, c.text, align, nextFade().a); }
  if (info.length) {
    y += 2 * u;
    for (const line of info) {
      const f = nextFade();
      ctx.save(); ctx.globalAlpha = f.a;
      ctx.font = fontString(style.fontBody, 600, infoSize);
      const w = Math.min(ctx.measureText(line).width, colW - 3 * u);
      const lx = align === 'center' ? ax - w / 2 + 1.2 * u : ax + 2.4 * u;
      ctx.fillStyle = c.accent;
      ctx.beginPath(); ctx.arc(lx - 1.6 * u, y + f.dy + infoSize * 0.62, infoSize * 0.22, 0, Math.PI * 2); ctx.fill();
      const r = drawLine(ctx, line, style.fontBody, 600, infoSize, lx, y + f.dy, colW - 3 * u, c.text, 'left', 1.8 * u);
      if (r.overflow) e.rt.overflow.add(scene.id);
      ctx.restore();
      y += infoSize * 1.55;
    }
  }
  const drawQr = (x: number, yy: number) => {
    if (!qr) return;
    const f = nextFade();
    const k = easeOutBack(clamp((e.lt - 0.6) / 0.4, 0, 1));
    ctx.save(); ctx.globalAlpha = f.a;
    ctx.translate(x + qrS / 2, yy + qrS / 2); ctx.scale(k, k); ctx.translate(-(x + qrS / 2), -(yy + qrS / 2));
    roundRect(ctx, x - u, yy - u, qrS + 2 * u, qrS + 2 * u, 1.5 * u);
    ctx.fillStyle = '#fff'; ctx.fill();
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(qr, x, yy, qrS, qrS);
    ctx.restore();
  };
  if (side) {
    const rx = S.x + colW + 4 * u, rw = S.w - colW - 4 * u;
    if (cut) {
      const f = fadeUp(e, 0.2, 0.6);
      ctx.save(); ctx.globalAlpha = f.a;
      contain(e, cut, rx, e.H * 0.12 + f.dy, rw, e.H * 0.88, true);
      ctx.restore();
      if (qr) drawQr(S.x + S.w - qrS, S.y);
    } else drawQr(rx + (rw - qrS) / 2, S.y + (S.h - qrS) / 2);
  } else {
    if (cut && !qr) {
      // portrait: cut-out at the bottom, behind nothing
      ctx.save(); ctx.globalAlpha = 0.95;
      contain(e, cut, S.x, y + 2 * u, S.w, e.H - y - 2 * u, true);
      ctx.restore();
    }
    if (qr) drawQr(e.W / 2 - qrS / 2, y + 2 * u);
  }
}

const SCENE_FN: Record<Scene['kind'], (e: E) => void> = {
  hook: sceneHook, montage: sceneMontage, speaker: sceneSpeaker, headline: sceneHeadline, item: sceneItem,
  steps: sceneSteps, stat: sceneStat, moment: sceneMoment, cta: sceneCta,
};

function drawScene(ctx: CanvasRenderingContext2D, p: Project, idx: number, lt: number, W: number, H: number, rt: Runtime, start: number, media: Map<string, MediaItem>) {
  const scene = p.scenes[idx];
  const e: E = {
    ctx, W, H, u: Math.min(W, H) / 100, S: safeArea(W, H), style: p.style, p, rt, scene,
    lt: clamp(lt, 0, scene.duration), dur: scene.duration, idx, start, media,
  };
  ctx.save();
  ctx.fillStyle = p.style.colors.bg;
  ctx.fillRect(0, 0, W, H);
  try { SCENE_FN[scene.kind](e); } catch (err) { console.error('scene draw failed', scene.kind, err); }
  // fade from / to black
  const fi = scene.fadeIn ?? 0, fo = scene.fadeOut ?? 0;
  let a = 0;
  if (fi > 0 && e.lt < fi) a = Math.max(a, 1 - e.lt / fi);
  if (fo > 0 && e.dur - e.lt < fo) a = Math.max(a, 1 - (e.dur - e.lt) / fo);
  if (a > 0) { ctx.fillStyle = `rgba(0,0,0,${Math.min(1, a)})`; ctx.fillRect(0, 0, W, H); }
  ctx.restore();
}

function layer(rt: Runtime, i: number, W: number, H: number) {
  let c = rt.layers[i];
  if (!c) { c = document.createElement('canvas'); rt.layers[i] = c; }
  if (c.width !== W || c.height !== H) { c.width = W; c.height = H; }
  return c.getContext('2d')!;
}

/** Draw the frame at time t. */
export function renderFrame(ctx: CanvasRenderingContext2D, p: Project, t: number, W: number, H: number, rt: Runtime) {
  const media = new Map(p.media.map((m) => [m.id, m]));
  const { starts, total } = timeline(p);
  ctx.save();
  ctx.fillStyle = p.style.colors.bg;
  ctx.fillRect(0, 0, W, H);
  if (!p.scenes.length) { ctx.restore(); return; }
  t = clamp(t, 0, Math.max(0, total - 1e-4));
  let i = 0;
  while (i < p.scenes.length - 1 && t >= starts[i] + p.scenes[i].duration) i++;
  const td = transitionDur(p.style);
  let a = -1, b = -1, k = 0;
  const endI = starts[i] + p.scenes[i].duration;
  if (i < p.scenes.length - 1 && t > endI - td / 2 && p.scenes[i].transition !== 'cut') { a = i; b = i + 1; k = (t - (endI - td / 2)) / td; }
  else if (i > 0 && t < starts[i] + td / 2 && p.scenes[i - 1].transition !== 'cut') { a = i - 1; b = i; k = (t - (starts[i] - td / 2)) / td; }
  if (a < 0) {
    drawScene(ctx, p, i, t - starts[i], W, H, rt, starts[i], media);
  } else {
    const kind = p.scenes[a].transition;
    k = clamp(k, 0, 1);
    const ek = easeInOutCubic(k);
    const la = layer(rt, 0, W, H), lb = layer(rt, 1, W, H);
    drawScene(la, p, a, t - starts[a], W, H, rt, starts[a], media);
    drawScene(lb, p, b, t - starts[b], W, H, rt, starts[b], media);
    const A = la.canvas, B = lb.canvas;
    const u = Math.min(W, H) / 100;
    switch (kind) {
      case 'slide':
        ctx.drawImage(A, -ek * W, 0);
        ctx.drawImage(B, (1 - ek) * W, 0);
        ctx.fillStyle = p.style.colors.accent;
        ctx.fillRect((1 - ek) * W - u * 0.8, 0, u * 0.8, H);
        break;
      case 'zoom': {
        const blur = Math.round(Math.sin(k * Math.PI) * u * 1.2);
        ctx.save();
        if (blur > 0) ctx.filter = `blur(${blur}px)`;
        const sa = 1 + ek * 0.35;
        ctx.globalAlpha = 1;
        ctx.drawImage(A, (W - W * sa) / 2, (H - H * sa) / 2, W * sa, H * sa);
        const sb = 1.35 - 0.35 * ek;
        ctx.globalAlpha = ek;
        ctx.drawImage(B, (W - W * sb) / 2, (H - H * sb) / 2, W * sb, H * sb);
        ctx.restore();
        break;
      }
      case 'wipe': {
        ctx.drawImage(A, 0, 0);
        ctx.save();
        ctx.beginPath();
        if (p.style.shape === 'glass' || p.style.shape === 'swoosh') {
          ctx.arc(W / 2, H / 2, Math.hypot(W, H) * 0.55 * ek, 0, Math.PI * 2);
        } else {
          const x = (W + H) * ek;
          ctx.moveTo(0, 0); ctx.lineTo(x, 0); ctx.lineTo(x - H, H); ctx.lineTo(0, H); ctx.closePath();
        }
        ctx.clip();
        ctx.drawImage(B, 0, 0);
        ctx.restore();
        if (p.style.shape !== 'glass' && p.style.shape !== 'swoosh' && k > 0 && k < 1) {
          const x = (W + H) * ek;
          ctx.save();
          ctx.strokeStyle = p.style.colors.accent;
          ctx.lineWidth = u * 1.4;
          ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x - H, H); ctx.stroke();
          ctx.restore();
        }
        break;
      }
      case 'flash':
        ctx.drawImage(k < 0.5 ? A : B, 0, 0);
        ctx.fillStyle = `rgba(255,255,255,${(1 - Math.abs(k - 0.5) * 2) * 0.95})`;
        ctx.fillRect(0, 0, W, H);
        break;
      default: // dissolve
        ctx.drawImage(A, 0, 0);
        ctx.globalAlpha = ek;
        ctx.drawImage(B, 0, 0);
        ctx.globalAlpha = 1;
    }
  }
  drawOverlays(ctx, p, t, W, H, rt);
  drawCaptions(ctx, p, t, W, H);
  // gentle fade at the very end
  const tail = total - t;
  if (tail < 0.45) { ctx.fillStyle = hexA(p.style.colors.bg, (0.45 - tail) / 0.45); ctx.fillRect(0, 0, W, H); }
  ctx.restore();
}

export function activeCaption(caps: Caption[], t: number) {
  return caps.find((c) => t >= c.start && t < c.end) ?? null;
}

function drawCaptions(ctx: CanvasRenderingContext2D, p: Project, t: number, W: number, H: number) {
  if (p.captionStyle === 'off' || !p.captions.length) return;
  const cap = activeCaption(p.captions, t);
  if (!cap) return;
  const S = safeArea(W, H);
  const u = Math.min(W, H) / 100;
  const style = p.style;
  const size = (S.portrait ? 4.6 : 4) * u;
  const words = cap.words?.length ? cap.words : cap.text.split(/\s+/).filter(Boolean).map((w, i, arr) => ({
    w, t0: cap.start + ((cap.end - cap.start) * i) / arr.length, t1: cap.start + ((cap.end - cap.start) * (i + 1)) / arr.length,
  }));
  const fit = fitRich(ctx, [words.map((w) => w.w).join(' ')], style.fontHead, 800, S.w * 0.9, size * 3, size, size * 0.5, 1.2, 2);
  const yBase = S.portrait ? H * 0.68 : S.y + S.h - fit.height - 1.5 * u;
  ctx.save();
  if (p.captionStyle === 'line') {
    roundRect(ctx, (W - fit.width) / 2 - 2 * u, yBase - 1 * u, fit.width + 4 * u, fit.height + 2 * u, 1.2 * u);
    ctx.fillStyle = 'rgba(0,0,0,0.55)';
    ctx.fill();
    drawFit(ctx, fit, W / 2, yBase, 'center', ['#ffffff', '#ffffff', '#ffffff']);
  } else {
    const activeIdx = words.findIndex((w) => t >= w.t0 && t < w.t1);
    ctx.font = fit.font;
    ctx.textBaseline = 'alphabetic';
    fit.rows.forEach((row, ri) => {
      const rx = W / 2 - row.width / 2;
      const by = yBase + ri * fit.lineH + fit.size * 0.95;
      for (const w of row.words) {
        const on = w.index === activeIdx;
        if (p.captionStyle === 'box' && on) {
          roundRect(ctx, rx + w.x - 0.6 * u, by - fit.size * 0.95, w.width + 1.2 * u, fit.size * 1.2, 0.8 * u);
          ctx.fillStyle = style.colors.accent; ctx.fill();
        }
        ctx.lineWidth = fit.size * 0.16;
        ctx.strokeStyle = 'rgba(0,0,0,0.85)';
        ctx.lineJoin = 'round';
        const past = w.index <= activeIdx;
        ctx.strokeText(w.w, rx + w.x, by);
        ctx.fillStyle = p.captionStyle === 'word' ? (on ? style.colors.accent : past ? '#ffffff' : 'rgba(255,255,255,0.75)') : on ? (isLight(style.colors.accent) ? '#111' : '#fff') : '#ffffff';
        ctx.fillText(w.w, rx + w.x, by);
      }
    });
  }
  ctx.restore();
}

/** All text in a project — used to pre-load the right font subsets. */
export function projectText(p: Project) {
  const parts: string[] = [p.cta.title, p.cta.subtitle, p.cta.website, p.cta.contact, p.cta.dateVenue, p.cta.social];
  for (const s of p.scenes) {
    const t = s.texts;
    parts.push(...(t.lines ?? []), t.title ?? '', t.subtitle ?? '', t.highlight ?? '', t.badge ?? '', t.caption ?? '', t.second ?? '', t.words ?? '', t.name ?? '', t.role ?? '');
    for (const en of s.entries ?? []) parts.push(en.label, en.value);
  }
  for (const c of p.captions) parts.push(c.text);
  for (const o of p.overlays ?? []) parts.push(o.text);
  return parts.join(' ');
}


// ---------------------------------------------------------------- overlays (text / picture track)
export const OVERLAY_SIZE: Record<Overlay['preset'], number> = { title: 9, lower: 4.2, caption: 3.8, tag: 3.4, plain: 6 };

function drawOverlays(ctx: CanvasRenderingContext2D, p: Project, t: number, W: number, H: number, rt: Runtime) {
  const list = p.overlays ?? [];
  if (!list.length) return;
  const u = Math.min(W, H) / 100;
  const S = safeArea(W, H);
  const style = p.style;
  for (const o of list) {
    if (t < o.at || t >= o.at + o.dur) continue;
    const lt = t - o.at;
    const inK = clamp(lt / 0.35, 0, 1);
    const outK = clamp((o.at + o.dur - t) / 0.3, 0, 1);
    let alpha = o.opacity * (o.anim === 'none' ? 1 : Math.min(inK, outK));
    let scale = 1, dx = 0;
    if (o.anim === 'pop') scale = 0.55 + 0.45 * easeOutBack(inK);
    if (o.anim === 'slide') dx = (1 - easeOutCubic(inK)) * -10 * u;
    if (o.anim === 'type') alpha = o.opacity * outK;
    const cx = o.x * W + dx, cy = o.y * H;
    ctx.save();
    ctx.globalAlpha = clamp(alpha, 0, 1);
    if (scale !== 1) { ctx.translate(cx, cy); ctx.scale(scale, scale); ctx.translate(-cx, -cy); }
    if (o.kind === 'image') {
      const vis = rt.visual(o.mediaId);
      if (vis && vis.w) {
        const w = (W * o.size) / 100, h = (w * vis.h) / vis.w;
        ctx.drawImage(vis.src, cx - w / 2, cy - h / 2, w, h);
      }
      ctx.restore();
      continue;
    }
    const size = o.size * u;
    const lines = (o.text || '').split('\n');
    const maxW = o.preset === 'lower' ? S.w * 0.7 : S.w * 0.95;
    const weight = o.preset === 'caption' || o.preset === 'tag' ? 700 : style.headWeight;
    const fam = o.preset === 'caption' ? style.fontBody : style.fontHead;
    const fit = fitRich(ctx, lines, fam, weight, maxW, H * 0.6, size, size * 0.4, 1.15, 6);
    if (fit.overflow) rt.overflow.add(o.id);
    const total = fit.rows.reduce((n, r) => n + r.words.length, 0);
    const shown = o.anim === 'type' ? Math.floor(clamp(lt / Math.max(0.4, Math.min(o.dur * 0.6, total * 0.18)), 0, 1) * total + 0.999) : total;
    const anim = (i: number) => ({ alpha: i < shown ? 1 : 0, scale: 1, dx: 0, dy: 0 });
    const col = o.color || (o.preset === 'lower' ? contrastPick(style.colors.panel, [style.colors.panelText, style.colors.text]) : '#ffffff');
    const colors: [string, string, string] = [col, style.colors.accent, style.colors.accent2];
    const pad = size * 0.55;
    if (o.preset === 'lower') {
      const bw = fit.width + pad * 2.4, bh = fit.height + pad * 1.6;
      const x0 = clamp(cx - bw / 2, 0, W - bw), y0 = cy - bh / 2;
      drawPanel(ctx, style, x0, y0, bw, bh, u, Math.min(1, lt / 0.45), 'left', o.bg || undefined);
      drawFit(ctx, fit, x0 + pad * 1.2, y0 + pad * 0.8, 'left', colors, anim);
    } else if (o.preset === 'caption' || o.preset === 'tag' || o.bg) {
      const bw = fit.width + pad * 2.2, bh = fit.height + pad * 1.4;
      roundRect(ctx, cx - bw / 2, cy - bh / 2, bw, bh, o.preset === 'tag' ? bh / 2 : pad);
      ctx.fillStyle = o.bg || (o.preset === 'tag' ? style.colors.accent : 'rgba(0,0,0,0.55)');
      ctx.fill();
      const tc = o.color || (o.preset === 'tag' ? (isLight(style.colors.accent) ? '#111111' : '#ffffff') : '#ffffff');
      drawFit(ctx, fit, cx, cy - bh / 2 + pad * 0.7, 'center', [tc, style.colors.accent2, style.colors.accent], anim);
    } else {
      drawFit(ctx, fit, cx, cy - fit.height / 2, 'center', colors, anim, o.preset === 'title' ? 'rgba(0,0,0,0.55)' : undefined);
    }
    ctx.restore();
  }
}
