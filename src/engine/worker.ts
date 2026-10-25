/// <reference lib="webworker" />
// Runs engine jobs off the main thread so the UI stays smooth while 10,000 seasons play out.
import { runJob, type JobName } from './jobs';

self.onmessage = (e: MessageEvent<{ id: number; job: JobName; args: never }>) => {
  const { id, job, args } = e.data;
  try {
    const result = runJob(job, args, (done) => self.postMessage({ id, progress: done }));
    self.postMessage({ id, result });
  } catch (err) {
    self.postMessage({ id, error: String(err) });
  }
};
