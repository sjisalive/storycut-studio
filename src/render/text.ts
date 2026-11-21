// Canvas text layout. Canvas 2D uses the browser's text shaper, so Devanagari,
// Bengali, Tamil etc. render with correct conjuncts and matras.
import { fontStack } from '../presets';

export interface RichWord { w: string; c: 0 | 1 | 2 } // 0 text, 1 accent, 2 accent2
export interface PlacedWord extends RichWord { x: number; width: number; index: number }
export interface FitRow { words: PlacedWord[]; width: number }
export interface FitResult { size: number; rows: FitRow[]; lineH: number; height: number; width: number; overflow: boolean; font: string }

/** "*word*" → accent colour, "_word_" → second accent. Markers may span several words. */
export function parseRich(line: string): RichWord[] {
  const out: RichWord[] = [];
  let mode: 0 | 1 | 2 = 0;
  const tokens = line.split(/(\*|_)/);
  let glue = false; // previous text ended mid-word (e.g. "*year*!")
  for (const tok of tokens) {
    if (tok === '*') { mode = mode === 1 ? 0 : 1; continue; }
    if (tok === '_') { mode = mode === 2 ? 0 : 2; continue; }
    if (!tok) continue;
    const parts = tok.split(/\s+/);
    parts.forEach((w, i) => {
      if (!w) return;
      if (i === 0 && glue && out.length) out[out.length - 1] = { ...out[out.length - 1], w: out[out.length - 1].w + w };
      else out.push({ w, c: mode });
    });
    glue = !/\s$/.test(tok);
  }
  return out;
}
export const stripRich = (s: string) => s.replace(/[*_]/g, '');

export const fontString = (family: string, weight: number, size: number) => `${weight} ${Math.round(size)}px ${fontStack(family)}`;

const widthCache = new Map<string, number>();
function measure(ctx: CanvasRenderingContext2D, font: string, s: string) {
  const k = font + '|' + s;
  let w = widthCache.get(k);
  if (w === undefined) {
    ctx.font = font;
    w = ctx.measureText(s).width;
    if (widthCache.size > 20000) widthCache.clear();
    widthCache.set(k, w);
  }
  return w;
}
export const clearTextCache = () => { widthCache.clear(); fitCache.clear(); };

const fitCache = new Map<string, FitResult>();

/**
 * Fit paragraphs into a box, shrinking the font until it fits.
 * Each input line starts a new row; long lines wrap at spaces.
 */
export function fitRich(
  ctx: CanvasRenderingContext2D, lines: string[], family: string, weight: number,
  maxW: number, maxH: number, maxSize: number, minSize: number, lineHeight = 1.18, maxRows = 6,
): FitResult {
  const key = [lines.join('\n'), family, weight, Math.round(maxW), Math.round(maxH), Math.round(maxSize), Math.round(minSize), lineHeight, maxRows].join('|');
  const hit = fitCache.get(key);
  if (hit) return hit;
  const paras = lines.map(parseRich).filter((p) => p.length);
  let size = maxSize;
  let res: FitResult | null = null;
  for (let iter = 0; iter < 40; iter++) {
    const font = fontString(family, weight, size);
    const space = measure(ctx, font, ' ');
    const rows: FitRow[] = [];
    let tooWide = false;
    let index = 0;
    for (const p of paras) {
      let cur: PlacedWord[] = [];
      let x = 0;
      for (const rw of p) {
        const ww = measure(ctx, font, rw.w);
        if (ww > maxW) tooWide = true;
        if (cur.length && x + space + ww > maxW) {
          rows.push({ words: cur, width: x });
          cur = []; x = 0;
        }
        if (cur.length) x += space;
        cur.push({ ...rw, x, width: ww, index: index++ });
        x += ww;
      }
      if (cur.length) rows.push({ words: cur, width: x });
    }
    const lineH = size * lineHeight;
    const height = rows.length * lineH;
    const width = rows.reduce((m, r) => Math.max(m, r.width), 0);
    const fits = !tooWide && height <= maxH && rows.length <= maxRows;
    res = { size, rows, lineH, height, width, overflow: !fits, font };
    if (fits || size <= minSize) break;
    size = Math.max(minSize, size * 0.92);
  }
  fitCache.set(key, res!);
  if (fitCache.size > 4000) fitCache.clear();
  return res!;
}

export interface WordAnim { alpha: number; scale: number; dx: number; dy: number }

/** Draw a fitted block. (x, y) is the anchor: top-left / top-centre / top-right by align. */
export function drawFit(
  ctx: CanvasRenderingContext2D, fit: FitResult, x: number, y: number, align: 'left' | 'center' | 'right',
  colors: [string, string, string], anim?: (i: number, total: number) => WordAnim, shadow?: string,
) {
  const total = fit.rows.reduce((n, r) => n + r.words.length, 0);
  ctx.save();
  ctx.font = fit.font;
  ctx.textBaseline = 'alphabetic';
  ctx.textAlign = 'left';
  if (shadow) { ctx.shadowColor = shadow; ctx.shadowBlur = fit.size * 0.25; ctx.shadowOffsetY = fit.size * 0.04; }
  fit.rows.forEach((row, ri) => {
    const rx = align === 'left' ? x : align === 'center' ? x - row.width / 2 : x - row.width;
    const by = y + ri * fit.lineH + fit.size * 0.95;
    for (const w of row.words) {
      const a = anim ? anim(w.index, total) : { alpha: 1, scale: 1, dx: 0, dy: 0 };
      if (a.alpha <= 0.001) continue;
      ctx.globalAlpha = Math.min(1, a.alpha);
      ctx.fillStyle = colors[w.c];
      if (a.scale !== 1 || a.dx || a.dy) {
        const cx = rx + w.x + w.width / 2, cy = by - fit.size * 0.35;
        ctx.save();
        ctx.translate(cx + a.dx, cy + a.dy);
        ctx.scale(a.scale, a.scale);
        ctx.fillText(w.w, -w.width / 2, fit.size * 0.35);
        ctx.restore();
      } else {
        ctx.fillText(w.w, rx + w.x, by);
      }
    }
  });
  ctx.restore();
}

/** Single line of plain text, shrunk to fit width. Returns the size used. */
export function drawLine(
  ctx: CanvasRenderingContext2D, text: string, family: string, weight: number, size: number,
  x: number, y: number, maxW: number, color: string, align: CanvasTextAlign = 'left', minSize = 10,
): { size: number; overflow: boolean; width: number } {
  let s = size;
  let w = measure(ctx, fontString(family, weight, s), text);
  while (w > maxW && s > minSize) { s *= 0.92; w = measure(ctx, fontString(family, weight, s), text); }
  ctx.font = fontString(family, weight, s);
  ctx.fillStyle = color;
  ctx.textAlign = align;
  ctx.textBaseline = 'alphabetic';
  ctx.fillText(text, x, y + s * 0.95);
  return { size: s, overflow: w > maxW + 1, width: Math.min(w, maxW) };
}

/** Parse "₹1,25,000+" → prefix ₹, value 125000, suffix +, keeping decimals and grouping. */
export function parseNumber(s: string) {
  const m = /^(\D*?)(\d[\d,]*(?:\.\d+)?)(.*)$/.exec(s.trim());
  if (!m) return null;
  const raw = m[2];
  const value = parseFloat(raw.replace(/,/g, ''));
  if (!Number.isFinite(value)) return null;
  const decimals = raw.includes('.') ? raw.split('.')[1].length : 0;
  const indian = /\d,\d\d,\d{3}/.test(raw) || (raw.includes(',') && /,\d\d,/.test(raw));
  const grouped = raw.includes(',');
  return { prefix: m[1], value, suffix: m[3], decimals, grouped, indian };
}
export function formatCount(n: ReturnType<typeof parseNumber>, k: number) {
  if (!n) return '';
  const v = n.value * k;
  let s: string;
  if (n.grouped) s = v.toLocaleString(n.indian ? 'en-IN' : 'en-US', { minimumFractionDigits: n.decimals, maximumFractionDigits: n.decimals });
  else s = v.toFixed(n.decimals);
  return n.prefix + s + n.suffix;
}
