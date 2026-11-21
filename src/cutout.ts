// Person cut-out (background removal) in the browser. The model downloads once
// from Hugging Face; the photo itself is processed locally.
import { loadTransformers } from './audio/captions';
import { getVisual, seekVideo } from './media';

let segmenter: any = null;

export async function makeCutout(mediaId: string, atTime: number | undefined, onStatus: (s: string) => void): Promise<Blob> {
  if (atTime !== undefined) await seekVideo(mediaId, atTime);
  const vis = getVisual(mediaId);
  if (!vis) throw new Error('Media not ready');
  const c = document.createElement('canvas');
  const scale = Math.min(1, 1024 / Math.max(vis.w, vis.h));
  c.width = Math.round(vis.w * scale); c.height = Math.round(vis.h * scale);
  c.getContext('2d')!.drawImage(vis.src, 0, 0, c.width, c.height);
  const T = await loadTransformers();
  if (!segmenter) {
    onStatus('Loading cut-out model (first time only)…');
    segmenter = await T.pipeline('background-removal', 'Xenova/modnet', { dtype: 'fp32' });
  }
  onStatus('Cutting out…');
  const input = T.RawImage.fromCanvas ? T.RawImage.fromCanvas(c) : await T.RawImage.fromURL(c.toDataURL('image/png'));
  const [out] = await segmenter(input);
  const oc = document.createElement('canvas');
  oc.width = out.width; oc.height = out.height;
  const data = out.channels === 4 ? out.data : out.rgba().data;
  oc.getContext('2d')!.putImageData(new ImageData(new Uint8ClampedArray(data), out.width, out.height), 0, 0);
  // trim transparent edges
  const trimmed = trim(oc);
  return await new Promise<Blob>((res, rej) => trimmed.toBlob((b) => (b ? res(b) : rej(new Error('Could not save cut-out'))), 'image/png'));
}

function trim(c: HTMLCanvasElement) {
  const ctx = c.getContext('2d')!;
  const { data, width, height } = ctx.getImageData(0, 0, c.width, c.height);
  let x0 = width, y0 = height, x1 = 0, y1 = 0;
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
    if (data[(y * width + x) * 4 + 3] > 20) { if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; }
  }
  if (x1 <= x0 || y1 <= y0) return c;
  const o = document.createElement('canvas');
  o.width = x1 - x0 + 1; o.height = y1 - y0 + 1;
  o.getContext('2d')!.drawImage(c, x0, y0, o.width, o.height, 0, 0, o.width, o.height);
  return o;
}
