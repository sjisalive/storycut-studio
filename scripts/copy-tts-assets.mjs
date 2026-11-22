// Copies the speech engine files (ONNX runtime + Piper phonemizer) into public/tts
// so the site serves them itself. Voices are downloaded by the browser on first use.
import { copyFileSync, mkdirSync, readFileSync, writeFileSync, existsSync } from 'node:fs';
const out = 'public/tts';
mkdirSync(`${out}/ort`, { recursive: true });
for (const f of ['ort-wasm-simd-threaded.wasm', 'ort-wasm-simd-threaded.mjs']) copyFileSync(`node_modules/onnxruntime-web/dist/${f}`, `${out}/ort/${f}`);
const pw = 'node_modules/@diffusionstudio/piper-wasm/build';
for (const f of ['piper_phonemize.wasm', 'piper_phonemize.data']) copyFileSync(`${pw}/${f}`, `${out}/${f}`);
// make the Emscripten loader importable as an ES module
let js = readFileSync(`${pw}/piper_phonemize.js`, 'utf8');
js = js.replace(/if \(typeof exports === 'object'[\s\S]*$/, '') + '\nexport default createPiperPhonemize;\n';
writeFileSync(`${out}/piper_phonemize.mjs`, js);
console.log('speech engine files copied to', out, existsSync(`${out}/piper_phonemize.data`) ? '' : '(missing data!)');
