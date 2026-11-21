// Shaped panels and decorative background motion for each style's shape set.
import type { StylePack } from '../types';
import { easeOutCubic, seeded } from '../util';

export function hexA(hex: string, a: number) {
  const h = hex.replace('#', '');
  const n = parseInt(h.length === 3 ? h.split('').map((c) => c + c).join('') : h, 16);
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`;
}
export function isLight(hex: string) {
  const h = hex.replace('#', '');
  const n = parseInt(h.length === 3 ? h.split('').map((c) => c + c).join('') : h, 16);
  const r = (n >> 16) & 255, g = (n >> 8) & 255, b = n & 255;
  return (r * 299 + g * 587 + b * 114) / 1000 > 150;
}

export function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  r = Math.max(0, Math.min(r, w / 2, h / 2));
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

/** Path of a shaped panel in the style's shape language. */
export function panelPath(ctx: CanvasRenderingContext2D, style: StylePack, x: number, y: number, w: number, h: number, u: number) {
  ctx.beginPath();
  switch (style.shape) {
    case 'geometric': {
      const cut = Math.min(h * 0.35, 6 * u);
      ctx.moveTo(x, y); ctx.lineTo(x + w - cut, y); ctx.lineTo(x + w, y + cut);
      ctx.lineTo(x + w, y + h); ctx.lineTo(x + cut, y + h); ctx.lineTo(x, y + h - cut); ctx.closePath();
      break;
    }
    case 'swoosh': {
      const b = Math.min(h * 0.22, 4 * u);
      ctx.moveTo(x, y + b);
      ctx.bezierCurveTo(x + w * 0.35, y - b * 0.6, x + w * 0.65, y + b * 1.4, x + w, y);
      ctx.lineTo(x + w, y + h - b * 0.4);
      ctx.bezierCurveTo(x + w * 0.6, y + h + b * 0.5, x + w * 0.3, y + h - b, x, y + h);
      ctx.closePath();
      break;
    }
    case 'glass':
      roundRect(ctx, x, y, w, h, 2.4 * u);
      break;
    default:
      ctx.rect(x, y, w, h);
  }
}

/** Draw a panel that wipes in (progress 0..1) from the given side. */
export function drawPanel(
  ctx: CanvasRenderingContext2D, style: StylePack, x: number, y: number, w: number, h: number, u: number,
  progress: number, from: 'left' | 'right' | 'bottom' = 'left', fill?: string,
) {
  const k = easeOutCubic(progress);
  if (k <= 0) return;
  ctx.save();
  ctx.beginPath();
  if (from === 'left') ctx.rect(x - 2 * u, y - 4 * u, (w + 4 * u) * k, h + 8 * u);
  else if (from === 'right') ctx.rect(x + w + 2 * u - (w + 4 * u) * k, y - 4 * u, (w + 4 * u) * k, h + 8 * u);
  else ctx.rect(x - 4 * u, y + h + 4 * u - (h + 8 * u) * k, w + 8 * u, (h + 8 * u) * k);
  ctx.clip();
  const c = style.colors;
  // Accent echo behind the panel
  if (style.shape !== 'lines') {
    ctx.save();
    ctx.translate(u * 1.1, u * 1.1);
    panelPath(ctx, style, x, y, w, h, u);
    ctx.fillStyle = style.shape === 'glass' ? hexA(c.accent2, 0.35) : c.accent;
    ctx.fill();
    ctx.restore();
  }
  panelPath(ctx, style, x, y, w, h, u);
  if (style.shape === 'glass') {
    ctx.fillStyle = hexA(fill ?? c.panel, 0.78);
    ctx.fill();
    ctx.strokeStyle = hexA(c.accent, 0.9);
    ctx.lineWidth = Math.max(1, u * 0.25);
    ctx.shadowColor = c.accent; ctx.shadowBlur = u * 2;
    ctx.stroke();
  } else if (style.shape === 'lines') {
    ctx.fillStyle = hexA(fill ?? c.panel, 0.94);
    ctx.fill();
    ctx.fillStyle = c.accent;
    ctx.fillRect(x, y, Math.max(2, u * 0.5), h);
  } else {
    ctx.fillStyle = fill ?? c.panel;
    ctx.fill();
  }
  ctx.restore();
}

/** Full-frame style background with slow-moving decorative shapes. */
export function drawBackdrop(ctx: CanvasRenderingContext2D, style: StylePack, W: number, H: number, t: number, seed: string, intensity = 1) {
  const c = style.colors;
  const g = ctx.createLinearGradient(0, 0, W, H);
  g.addColorStop(0, c.bg); g.addColorStop(1, c.bg2);
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, W, H);
  drawDecor(ctx, style, W, H, t, seed, intensity);
}

export function drawDecor(ctx: CanvasRenderingContext2D, style: StylePack, W: number, H: number, t: number, seed: string, intensity = 1) {
  const c = style.colors;
  const u = Math.min(W, H) / 100;
  const rnd = seeded(seed);
  const m = style.motion;
  ctx.save();
  switch (style.shape) {
    case 'geometric':
      for (let i = 0; i < 6; i++) {
        const cx = rnd() * W, cy = rnd() * H, s = (6 + rnd() * 16) * u, sp = (rnd() - 0.5) * 0.4 * m;
        ctx.save();
        ctx.translate(cx + Math.sin(t * 0.3 + i) * 3 * u, cy + t * sp * 8 * u);
        ctx.rotate(t * sp + i);
        ctx.globalAlpha = 0.16 * intensity;
        ctx.fillStyle = i % 2 ? c.accent : c.accent2;
        ctx.beginPath();
        if (i % 3 === 0) { ctx.moveTo(0, -s); ctx.lineTo(s * 0.87, s * 0.5); ctx.lineTo(-s * 0.87, s * 0.5); ctx.closePath(); ctx.fill(); }
        else if (i % 3 === 1) { ctx.fillRect(-s / 2, -s / 2, s, s); }
        else { ctx.lineWidth = u * 0.8; ctx.strokeStyle = c.accent; ctx.arc(0, 0, s * 0.6, 0, Math.PI * 2); ctx.stroke(); }
        ctx.restore();
      }
      break;
    case 'swoosh':
      for (let i = 0; i < 3; i++) {
        const y0 = H * (0.25 + i * 0.28) + Math.sin(t * 0.5 * m + i) * 3 * u;
        ctx.globalAlpha = 0.22 * intensity;
        ctx.fillStyle = [c.accent, c.accent2, c.panel][i];
        ctx.beginPath();
        ctx.moveTo(-10, y0);
        ctx.bezierCurveTo(W * 0.3, y0 - 14 * u, W * 0.6, y0 + 14 * u + Math.sin(t * m) * 4 * u, W + 10, y0 - 6 * u);
        ctx.lineTo(W + 10, y0 + 5 * u);
        ctx.bezierCurveTo(W * 0.6, y0 + 20 * u, W * 0.3, y0 - 6 * u, -10, y0 + 7 * u);
        ctx.closePath();
        ctx.fill();
      }
      break;
    case 'lines': {
      ctx.globalAlpha = 0.14 * intensity;
      ctx.strokeStyle = c.accent;
      ctx.lineWidth = Math.max(1, u * 0.15);
      const step = 9 * u;
      const off = (t * 2 * u * m) % step;
      for (let x = -step + off; x < W + step; x += step) { ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, H); ctx.stroke(); }
      ctx.globalAlpha = 0.5 * intensity;
      ctx.fillStyle = c.accent;
      ctx.fillRect(W * 0.06, H * 0.9, W * 0.12 * (0.6 + 0.4 * Math.sin(t)), Math.max(2, u * 0.4));
      break;
    }
    case 'glass':
      for (let i = 0; i < 3; i++) {
        const cx = W * (0.2 + 0.3 * i) + Math.sin(t * 0.4 * m + i * 2) * 8 * u;
        const cy = H * (0.3 + 0.2 * (i % 2)) + Math.cos(t * 0.35 * m + i) * 8 * u;
        const r = (28 + rnd() * 20) * u;
        const gr = ctx.createRadialGradient(cx, cy, 0, cx, cy, r);
        gr.addColorStop(0, hexA(i % 2 ? c.accent2 : c.accent, 0.35 * intensity));
        gr.addColorStop(1, hexA(i % 2 ? c.accent2 : c.accent, 0));
        ctx.fillStyle = gr;
        ctx.fillRect(cx - r, cy - r, r * 2, r * 2);
      }
      break;
  }
  ctx.restore();
}

/** Light streaks used behind flying words. */
export function drawStreaks(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, t: number, color: string, u: number, seed: string) {
  const rnd = seeded(seed);
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  for (let i = 0; i < 7; i++) {
    const yy = y + rnd() * h;
    const len = (10 + rnd() * 30) * u;
    const speed = (40 + rnd() * 60) * u;
    const xx = x + w - ((t * speed + rnd() * w) % (w + len));
    const g = ctx.createLinearGradient(xx, 0, xx + len, 0);
    g.addColorStop(0, hexA(color, 0));
    g.addColorStop(1, hexA(color, 0.55));
    ctx.fillStyle = g;
    ctx.fillRect(xx, yy, len, Math.max(1, u * 0.25));
  }
  ctx.restore();
}
