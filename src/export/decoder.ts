// Fast, frame-exact video reading for export. Instead of seeking a <video>
// element for every frame (each seek re-decodes from the last keyframe), we
// demux MP4/MOV files with mp4box.js and decode forward with WebCodecs.
// Anything this can't handle (WebM, rotated phone clips, very large files,
// browsers without VideoDecoder) returns null and the caller falls back to seeking.
import { createFile, DataStream, MP4BoxBuffer } from 'mp4box';

interface S { ts: number; dur: number; key: boolean; data: Uint8Array }

export class ClipDecoder {
  private dec: any = null;
  private next = 0;
  private frames: any[] = []; // decoded VideoFrames waiting, sorted by timestamp
  private current: any = null;
  private ended = false;
  private failed = false;
  private outputs = 0;

  private constructor(private cfg: any, private samples: S[], private keyIdx: number[], public width: number, public height: number) {}

  static async open(blob: Blob): Promise<ClipDecoder | null> {
    const VD = (window as any).VideoDecoder;
    if (typeof VD !== 'function' || blob.size > 900 * 1024 * 1024) return null;
    if (!/mp4|quicktime|m4v/i.test(blob.type) && blob.type) return null;
    try {
      const ab = await blob.arrayBuffer();
      const file: any = createFile();
      let info: any = null;
      const samples: S[] = [];
      file.onReady = (i: any) => { info = i; };
      file.onError = () => { info = null; };
      file.appendBuffer(MP4BoxBuffer.fromArrayBuffer(ab, 0));
      file.flush();
      const vt = info?.videoTracks?.[0];
      if (!vt) { console.info('[decoder] no video track'); return null; }
      // Rotated phone videos (track matrix) — let the <video> element handle those.
      const m = vt.matrix as number[] | undefined;
      if (m && (m[1] !== 0 || m[3] !== 0 || m[0] < 0)) return null;
      const trak = file.getTrackById(vt.id);
      let description: Uint8Array | undefined;
      for (const entry of trak.mdia.minf.stbl.stsd.entries) {
        const box = entry.avcC || entry.hvcC || entry.vpcC || entry.av1C;
        if (box) {
          const stream = new DataStream(undefined, 0, 1 /* big endian */);
          box.write(stream);
          description = new Uint8Array(stream.buffer, 8);
          break;
        }
      }
      // Edit list start (first frame shown later/earlier than t=0)
      let shift = 0;
      const elst = trak.edts?.elst?.entries?.[0];
      if (elst && elst.media_time > 0) shift = elst.media_time / vt.timescale;
      // Read the sample table directly and slice the bytes from the file we already hold.
      for (const smp of file.getTrackSamplesInfo(vt.id) as any[]) {
        if (smp.offset + smp.size > ab.byteLength) continue;
        samples.push({ ts: (smp.cts / smp.timescale - shift) * 1e6, dur: (smp.duration / smp.timescale) * 1e6, key: smp.is_sync, data: new Uint8Array(ab, smp.offset, smp.size) });
      }
      if (!samples.length) { console.info('[decoder] no samples'); return null; }
      const cfg: any = { codec: vt.codec, codedWidth: vt.video.width, codedHeight: vt.video.height, description, optimizeForLatency: false };
      const sup = await VD.isConfigSupported(cfg).catch(() => ({ supported: false }));
      if (!sup.supported) { console.info('[decoder] codec not supported', cfg.codec); return null; }
      const keyIdx = samples.map((s, i) => (s.key ? i : -1)).filter((i) => i >= 0);
      if (!keyIdx.length) return null;
      return new ClipDecoder(cfg, samples, keyIdx, vt.video.width, vt.video.height);
    } catch (e) {
      console.warn('fast decoder unavailable, using seek', e);
      return null;
    }
  }

  private start(fromSample: number) {
    try { this.dec?.close(); } catch { /* closed */ }
    for (const f of this.frames) f.close();
    this.frames = [];
    const VD = (window as any).VideoDecoder;
    this.dec = new VD({
      output: (f: any) => { this.outputs++; this.frames.push(f); this.frames.sort((a, b) => a.timestamp - b.timestamp); },
      error: () => { this.failed = true; },
    });
    this.dec.configure(this.cfg);
    this.next = fromSample;
    this.ended = false;
  }

  /** The frame on screen at time t (seconds). Returns a VideoFrame owned by the decoder. */
  async frameAt(t: number): Promise<any | null> {
    if (this.failed) return null;
    const us = t * 1e6;
    const cur = this.current?.timestamp ?? -Infinity;
    // Seek when jumping backwards or far ahead (> 3 s).
    if (!this.dec || us < cur - 1000 || us > cur + 3e6) {
      let k = this.keyIdx[0];
      for (const i of this.keyIdx) { if (this.samples[i].ts <= us + 1) k = i; else break; }
      this.current?.close(); this.current = null;
      this.start(k);
    }
    let spins = 0;
    while (!this.failed) {
      // take every decoded frame at or before t; the last one is what's on screen
      while (this.frames.length && this.frames[0].timestamp <= us + 1) {
        const f = this.frames.shift();
        this.current?.close();
        this.current = f;
      }
      if (this.frames.length) break; // the next frame is already in the future
      if (this.ended) break;
      if (this.next < this.samples.length) {
        if (this.dec.decodeQueueSize > 6 || this.frames.length > 6) { await new Promise((r) => setTimeout(r, 0)); continue; }
        const s = this.samples[this.next++];
        const Chunk = (window as any).EncodedVideoChunk;
        this.dec.decode(new Chunk({ type: s.key ? 'key' : 'delta', timestamp: s.ts, duration: s.dur, data: s.data }));
        if (++spins % 4 === 0) await new Promise((r) => setTimeout(r, 0));
      } else {
        await this.dec.flush();
        this.ended = true;
      }
    }
    if (!this.current && this.frames.length) this.current = this.frames.shift();
    return this.current;
  }

  close() {
    try { this.dec?.close(); } catch { /* closed */ }
    this.current?.close();
    for (const f of this.frames) f.close();
    this.frames = [];
    this.current = null;
  }
}
