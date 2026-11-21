import { forwardRef, useCallback, useEffect, useImperativeHandle, useRef, useState } from 'react';
import type { Project } from '../types';
import { renderFrame, timeline, projectText, type Runtime } from '../render/engine';
import { clearTextCache } from '../render/text';
import { ensureFonts } from '../fonts';
import { LiveRuntime } from '../export/runtime';
import { buildPlan, preloadAudio, schedule } from '../audio/mix';
import { dims } from '../export/exporter';
import { getVisual } from '../media';
import { fmtTime } from '../util';

export interface PlayerHandle { seek: (t: number) => void; toggle: () => void; time: () => number; step: (d: number) => void }

/** Canvas preview with real-time audio. */
export const Player = forwardRef<PlayerHandle, { project: Project; onTime?: (t: number) => void; onWarnings?: (ids: Set<string>) => void }>(
  function Player({ project, onTime, onWarnings }, ref) {
    const canvas = useRef<HTMLCanvasElement>(null);
    const rt = useRef(new LiveRuntime());
    const tRef = useRef(0);
    const pRef = useRef(project);
    pRef.current = project;
    const [playing, setPlaying] = useState(false);
    const playingRef = useRef(false);
    const [time, setTime] = useState(0);
    const actx = useRef<AudioContext | null>(null);
    const nodes = useRef<AudioScheduledSourceNode[]>([]);
    const anchor = useRef({ ctxT: 0, from: 0 });
    const { total } = timeline(project);
    const { w: W, h: H } = dims(project.aspect, 720);

    const stopAudio = () => { for (const n of nodes.current) { try { n.stop(); } catch { /* already stopped */ } } nodes.current = []; };
    const startAudio = useCallback(async () => {
      if (!actx.current) actx.current = new AudioContext({ latencyHint: 'interactive' });
      const ctx = actx.current;
      if (ctx.state === 'suspended') await ctx.resume();
      await preloadAudio(pRef.current);
      stopAudio();
      const when = ctx.currentTime + 0.06;
      nodes.current = schedule(ctx, ctx.destination, pRef.current, buildPlan(pRef.current), tRef.current, when);
      anchor.current = { ctxT: when, from: tRef.current };
    }, []);

    const pause = useCallback(() => { playingRef.current = false; setPlaying(false); stopAudio(); rt.current.playing = false; rt.current.stopAll(); }, []);
    const play = useCallback(async () => {
      if (tRef.current >= timeline(pRef.current).total - 0.05) tRef.current = 0;
      playingRef.current = true;
      setPlaying(true);
      rt.current.playing = true;
      await startAudio();
    }, [startAudio]);
    const seek = useCallback((t: number) => {
      tRef.current = Math.max(0, Math.min(t, timeline(pRef.current).total));
      setTime(tRef.current);
      onTime?.(tRef.current);
      if (playingRef.current) startAudio();
    }, [startAudio, onTime]);

    useImperativeHandle(ref, () => ({
      seek, time: () => tRef.current,
      toggle: () => (playingRef.current ? pause() : play()),
      step: (d: number) => seek(tRef.current + d),
    }), [seek, pause, play]);

    // restart audio if the project changes while playing
    useEffect(() => { if (playingRef.current) startAudio(); }, [project, startAudio]);

    // fonts: load what the text needs, then re-measure
    const textKey = projectText(project) + project.style.fontHead + project.style.fontBody;
    useEffect(() => {
      let live = true;
      ensureFonts([project.style.fontHead, project.style.fontBody], textKey).then(() => { if (live) clearTextCache(); });
      return () => { live = false; };
    }, [textKey]); // eslint-disable-line

    // overflow check: draw every scene's settled frame small, off-screen
    useEffect(() => {
      const id = setTimeout(() => {
        const p = pRef.current;
        const c = document.createElement('canvas');
        const sw = Math.round(W / 4), sh = Math.round(H / 4);
        c.width = sw; c.height = sh;
        const ctx = c.getContext('2d')!;
        const check: Runtime = { overflow: new Set(), layers: [], visual: (mid) => getVisual(mid) };
        const { starts } = timeline(p);
        p.scenes.forEach((s, i) => renderFrame(ctx, p, starts[i] + s.duration * 0.6, sw, sh, check));
        onWarnings?.(check.overflow);
      }, 500);
      return () => clearTimeout(id);
    }, [project, W, H, onWarnings]);

    // render loop
    useEffect(() => {
      let raf = 0, lastUi = 0;
      const loop = (now: number) => {
        const p = pRef.current;
        const tot = timeline(p).total;
        if (playingRef.current && actx.current) {
          const t = anchor.current.from + (actx.current.currentTime - anchor.current.ctxT);
          tRef.current = Math.max(anchor.current.from, t);
          if (tRef.current >= tot) { tRef.current = tot; pause(); }
        }
        const ctx = canvas.current?.getContext('2d');
        if (ctx) {
          renderFrame(ctx, p, tRef.current, W, H, rt.current);
          rt.current.endFrame();
        }
        if (now - lastUi > 90) { lastUi = now; setTime(tRef.current); onTime?.(tRef.current); }
        raf = requestAnimationFrame(loop);
      };
      raf = requestAnimationFrame(loop);
      return () => cancelAnimationFrame(raf);
    }, [W, H, pause, onTime]);

    useEffect(() => () => { stopAudio(); rt.current.stopAll(); actx.current?.close(); actx.current = null; playingRef.current = false; }, []);

    return (
      <div>
        <div className="stage">
          <canvas ref={canvas} width={W} height={H} style={{ aspectRatio: `${W}/${H}` }} onClick={() => (playingRef.current ? pause() : play())} />
        </div>
        <div className="controls">
          <button className="btn primary" onClick={(e) => { e.currentTarget.blur(); playing ? pause() : play(); }} style={{ minWidth: 86 }}>{playing ? '❚❚ Pause' : '▶ Play'}</button>
          <input type="range" min={0} max={Math.max(0.1, total)} step={0.01} value={Math.min(time, total)} onChange={(e) => seek(+e.target.value)} aria-label="Scrub" />
          <span className="timecode">{fmtTime(time)} / {fmtTime(total)}</span>
        </div>
      </div>
    );
  },
);
