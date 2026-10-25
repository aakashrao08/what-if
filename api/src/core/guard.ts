// Keeps the model bill near zero: a response cache (the engine is seeded, so the same question gets
// the same answer), a per-visitor rate limit and a daily ceiling per instance. All in memory; a
// cold start resets them, which is fine for a demo-scale app.

import { createHash } from 'node:crypto';

export class LruCache<V> {
  private map = new Map<string, V>();
  constructor(private max = 200) {}
  get(key: string): V | undefined {
    const v = this.map.get(key);
    if (v !== undefined) { this.map.delete(key); this.map.set(key, v); }
    return v;
  }
  set(key: string, v: V) {
    this.map.delete(key);
    this.map.set(key, v);
    if (this.map.size > this.max) this.map.delete(this.map.keys().next().value!);
  }
}

export const cacheKey = (...parts: string[]) => createHash('sha256').update(parts.join('\u0000')).digest('hex').slice(0, 32);
export const normQuestion = (q: string) => q.toLowerCase().replace(/[’']/g, "'").replace(/[^a-z0-9' ]+/g, ' ').replace(/\s+/g, ' ').trim();

export class RateLimiter {
  private hits = new Map<string, number[]>();
  private day = '';
  private today = 0;
  constructor(private perWindow = 12, private windowMs = 10 * 60_000, private perDay = 400) {}
  /** null if allowed, otherwise the reason */
  check(who: string, at = Date.now()): string | null {
    const d = new Date(at).toISOString().slice(0, 10);
    if (d !== this.day) { this.day = d; this.today = 0; }
    if (this.today >= this.perDay) return 'The agents have answered their quota for today. The studio is still running on its templates.';
    const recent = (this.hits.get(who) ?? []).filter((t) => at - t < this.windowMs);
    if (recent.length >= this.perWindow) return 'Too many questions in a few minutes. Give the agents a breather.';
    recent.push(at);
    this.hits.set(who, recent);
    this.today++;
    if (this.hits.size > 5000) this.hits.clear();
    return null;
  }
}

/** A plain question from the request body, or why it isn't one. */
export function readQuestion(body: unknown): { question: string } | { error: string } {
  const q = (body as { question?: unknown } | null)?.question;
  if (typeof q !== 'string') return { error: 'Send {"question": "..."}' };
  const question = q.replace(/[\u0000-\u001f]/g, ' ').trim();
  if (question.length < 6) return { error: 'Ask a full question.' };
  if (question.length > 300) return { error: 'Keep it under 300 characters.' };
  return { question };
}
