// Bundled fonts (served from this site — no internet needed). Browsers only
// download the subsets (latin / devanagari / …) that the text actually uses.
import '@fontsource/inter/500.css';
import '@fontsource/inter/600.css';
import '@fontsource/inter/700.css';
import '@fontsource/inter/800.css';
import '@fontsource/poppins/500.css';
import '@fontsource/poppins/600.css';
import '@fontsource/poppins/700.css';
import '@fontsource/poppins/800.css';
import '@fontsource/montserrat/500.css';
import '@fontsource/montserrat/600.css';
import '@fontsource/montserrat/700.css';
import '@fontsource/montserrat/800.css';
import '@fontsource/noto-sans/500.css';
import '@fontsource/noto-sans/600.css';
import '@fontsource/noto-sans/700.css';
import '@fontsource/noto-sans/800.css';
import '@fontsource/noto-sans-devanagari/500.css';
import '@fontsource/noto-sans-devanagari/600.css';
import '@fontsource/noto-sans-devanagari/700.css';
import '@fontsource/noto-sans-devanagari/800.css';
import '@fontsource/noto-sans-bengali/500.css';
import '@fontsource/noto-sans-bengali/600.css';
import '@fontsource/noto-sans-bengali/700.css';
import '@fontsource/noto-sans-bengali/800.css';
import '@fontsource/noto-sans-tamil/500.css';
import '@fontsource/noto-sans-tamil/600.css';
import '@fontsource/noto-sans-tamil/700.css';
import '@fontsource/noto-sans-tamil/800.css';
import '@fontsource/noto-sans-telugu/500.css';
import '@fontsource/noto-sans-telugu/600.css';
import '@fontsource/noto-sans-telugu/700.css';
import '@fontsource/noto-sans-telugu/800.css';
import '@fontsource/noto-sans-gujarati/500.css';
import '@fontsource/noto-sans-gujarati/600.css';
import '@fontsource/noto-sans-gujarati/700.css';
import '@fontsource/noto-sans-gujarati/800.css';
import '@fontsource/mukta/500.css';
import '@fontsource/mukta/600.css';
import '@fontsource/mukta/700.css';
import '@fontsource/mukta/800.css';
import '@fontsource/hind/500.css';
import '@fontsource/hind/600.css';
import '@fontsource/hind/700.css';
import '@fontsource/playfair-display/500.css';
import '@fontsource/playfair-display/600.css';
import '@fontsource/playfair-display/700.css';
import '@fontsource/playfair-display/800.css';

import { fontStack } from './presets';

/** Make sure every glyph in `text` is loaded for the given families before drawing. */
export async function ensureFonts(families: string[], text: string) {
  if (!('fonts' in document)) return;
  const sample = Array.from(new Set(Array.from(text || 'Aa'))).join('').slice(0, 2000) || 'Aa';
  const jobs: Promise<unknown>[] = [];
  for (const fam of new Set(families)) {
    for (const w of [500, 600, 700, 800]) jobs.push(document.fonts.load(`${w} 40px ${fontStack(fam)}`, sample).catch(() => null));
  }
  await Promise.all(jobs);
  await document.fonts.ready;
}
