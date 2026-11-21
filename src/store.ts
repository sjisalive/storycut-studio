// Project state with undo / redo. Rapid edits to the same field (typing) are
// merged into one undo step.
import { useCallback, useRef, useState } from 'react';
import type { Project } from './types';

interface Hist { past: Project[]; present: Project; future: Project[] }
export type Updater = Partial<Project> | ((p: Project) => Project);

export function useProjectHistory(initial: Project) {
  const [h, setH] = useState<Hist>({ past: [], present: initial, future: [] });
  const last = useRef<{ key?: string; at: number }>({ at: 0 });

  const update = useCallback((u: Updater, coalesceKey?: string) => {
    setH((cur) => {
      const next = typeof u === 'function' ? u(cur.present) : { ...cur.present, ...u };
      if (next === cur.present) return cur;
      const now = Date.now();
      const merge = coalesceKey && last.current.key === coalesceKey && now - last.current.at < 900;
      last.current = { key: coalesceKey, at: now };
      return {
        past: merge ? cur.past : [...cur.past.slice(-80), cur.present],
        present: next,
        future: [],
      };
    });
  }, []);
  /** Change without creating an undo step (e.g. media finished loading). */
  const silent = useCallback((u: Updater) => {
    setH((cur) => ({ ...cur, present: typeof u === 'function' ? u(cur.present) : { ...cur.present, ...u } }));
  }, []);
  /** Apply to every undo/redo state too (e.g. a file finished loading), so undo never brings back stale data. */
  const silentAll = useCallback((fn: (p: Project) => Project) => {
    setH((cur) => ({ past: cur.past.map(fn), present: fn(cur.present), future: cur.future.map(fn) }));
  }, []);
  const undo = useCallback(() => setH((c) => (c.past.length ? { past: c.past.slice(0, -1), present: c.past[c.past.length - 1], future: [c.present, ...c.future] } : c)), []);
  const redo = useCallback(() => setH((c) => (c.future.length ? { past: [...c.past, c.present], present: c.future[0], future: c.future.slice(1) } : c)), []);
  const reset = useCallback((p: Project) => setH({ past: [], present: p, future: [] }), []);
  return { project: h.present, update, silent, silentAll, undo, redo, reset, canUndo: h.past.length > 0, canRedo: h.future.length > 0 };
}

export type Store = ReturnType<typeof useProjectHistory>;
