// The UI's door into the engine. Jobs go to a Web Worker; if one can't be created
// (old browser, file:// preview, tests) they run on the main thread instead.

import type { JobMap, JobName } from './jobs';

type Pending = { resolve: (v: unknown) => void; reject: (e: Error) => void; onProgress?: (n: number) => void };

let worker: Worker | null = null;
let workerFailed = false;
let nextId = 1;
const pending = new Map<number, Pending>();
const cache = new Map<string, Promise<unknown>>();

function getWorker(): Worker | null {
  if (worker || workerFailed) return worker;
  try {
    worker = new Worker(new URL('./worker.ts', import.meta.url), { type: 'module' });
    worker.onmessage = (e: MessageEvent<{ id: number; result?: unknown; error?: string; progress?: number }>) => {
      const p = pending.get(e.data.id);
      if (!p) return;
      if (e.data.progress !== undefined) { p.onProgress?.(e.data.progress); return; }
      pending.delete(e.data.id);
      if (e.data.error) p.reject(new Error(e.data.error)); else p.resolve(e.data.result);
    };
    worker.onerror = () => {
      workerFailed = true;
      worker = null;
      for (const [, p] of pending) p.reject(new Error('worker failed'));
      pending.clear();
    };
  } catch {
    workerFailed = true;
    worker = null;
  }
  return worker;
}

async function onMainThread<J extends JobName>(job: J, args: JobMap[J]['args'], onProgress?: (n: number) => void) {
  const { runJob } = await import('./jobs');
  await new Promise((r) => setTimeout(r, 0));
  return runJob(job, args, onProgress);
}

export function run<J extends JobName>(job: J, args: JobMap[J]['args'], onProgress?: (n: number) => void): Promise<JobMap[J]['result']> {
  const w = getWorker();
  if (!w) return onMainThread(job, args, onProgress);
  const id = nextId++;
  return new Promise<JobMap[J]['result']>((resolve, reject) => {
    pending.set(id, { resolve: resolve as (v: unknown) => void, reject, onProgress });
    w.postMessage({ id, job, args });
  }).catch(() => onMainThread(job, args, onProgress));
}

/** Same as run, but identical requests share one result (the engine is deterministic). */
export function cached<J extends JobName>(job: J, args: JobMap[J]['args']): Promise<JobMap[J]['result']> {
  const key = `${job}:${JSON.stringify(args)}`;
  if (!cache.has(key)) cache.set(key, run(job, args));
  return cache.get(key) as Promise<JobMap[J]['result']>;
}
