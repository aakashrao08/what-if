// The Narrator and Verifier loop. The Narrator drafts from facts; the Verifier checks every number
// in code (the same verify() the browser runs), then a model reads it for football sense. Issues go
// back to the Narrator, up to three drafts. If none passes, the caller keeps the template.

import type { TraceEvent, Usage } from '../../../src/agents/contract';
import { verify, type Facts } from '../../../src/agents/verifier';
import type { Lang } from '../../../src/agents/format';
import type { ChatFn } from './model';
import { emptyUsage } from './loop';
import { PROMPTS } from './prompts';

export interface WriteResult<T> { value: T | null; drafts: number; flags: string[]; trace: TraceEvent[]; usage: Usage }

/** Pull the first JSON object out of a model reply, tolerating code fences or a stray sentence. */
export function parseJson(raw: string | null): unknown {
  if (!raw) return null;
  const start = raw.indexOf('{');
  const end = raw.lastIndexOf('}');
  if (start < 0 || end <= start) return null;
  try { return JSON.parse(raw.slice(start, end + 1)); } catch { return null; }
}

const now = () => performance.now();

export async function writeVerified<T>(o: {
  chat: ChatFn;
  task: string; // what is being written, for the model
  format: string; // the JSON shape to return
  facts: Facts;
  template: T; // the passing template draft: house style and a safe conclusion
  question?: string;
  read: (raw: unknown) => T | null; // validate the shape
  text: (value: T) => string; // everything a reader sees, for the Verifier
  maxDrafts?: number;
  deadline?: number;
  lang?: Lang; // the reader's language: numbers are read in its convention (decimal commas in es/pt)
}): Promise<WriteResult<T>> {
  const trace: TraceEvent[] = [];
  const usage = emptyUsage();
  const flags: string[] = [];
  const maxDrafts = o.maxDrafts ?? 3;
  const track = (u: { prompt: number; completion: number }) => { usage.calls++; usage.promptTokens += u.prompt; usage.completionTokens += u.completion; };

  for (let d = 1; d <= maxDrafts; d++) {
    if (o.deadline && now() > o.deadline) { trace.push({ agent: 'Narrator', kind: 'note', name: 'deadline', detail: 'Out of time; keeping the template', ms: 0 }); break; }
    const lastIssues = flags.slice(-4);
    const user = [
      `TASK: ${o.task}`,
      o.question ? `QUESTION: ${o.question}` : '',
      `FACTS: ${JSON.stringify(o.facts)}`,
      `TEMPLATE: ${JSON.stringify(o.template)}`,
      lastIssues.length ? `FEEDBACK: ${lastIssues.join(' | ')}` : '',
      `FORMAT: ${o.format}`
    ].filter(Boolean).join('\n');
    let t = now();
    const res = await o.chat([{ role: 'system', content: PROMPTS.narrator }, { role: 'user', content: user }], { json: true, maxTokens: 450, temperature: 0.5 });
    track(res.usage);
    const value = o.read(parseJson(res.message.content));
    trace.push({ agent: 'Narrator', kind: 'model', name: `draft ${d}`, detail: value ? 'wrote a draft' : 'reply was not in the requested format', ms: Math.round(now() - t), tokens: res.usage.prompt + res.usage.completion });
    if (!value) { flags.push('Reply was not valid JSON in the requested FORMAT.'); continue; }

    // 1. numbers and claims, in code
    t = now();
    const verdict = verify(o.text(value), o.facts, o.lang ?? 'en');
    // when a draft fails, show what it actually said around the problem: the trace is the audit trail
    const where = (detail: string) => { const n = detail.match(/^([\d.,]+)/)?.[1]; const txt = o.text(value); const i = n ? txt.search(new RegExp(`(?<![\\d.,])${n.replace(/[.,]/g, '[.,]')}(?![\\d])`)) : -1; return i >= 0 ? ` (“…${txt.slice(Math.max(0, i - 40), i + n!.length + 20)}…”)` : ''; };
    trace.push({ agent: 'Verifier', kind: 'check', name: 'numbers', detail: verdict.ok ? `${verdict.checked} numbers checked · passed` : verdict.issues.map((i) => `${i.detail}${where(i.detail)}`).join('; '), ms: Math.round(now() - t) });
    if (!verdict.ok) { flags.push(...verdict.issues.map((i) => i.detail)); continue; }

    // 2. football sense, by a model that sees the facts and the safe template
    t = now();
    const review = await o.chat([
      { role: 'system', content: PROMPTS.verifier },
      { role: 'user', content: `DRAFT: ${o.text(value)}\nTEMPLATE: ${o.text(o.template)}\nFACTS: ${JSON.stringify(o.facts)}` }
    ], { json: true, maxTokens: 200, temperature: 0 });
    track(review.usage);
    const r = parseJson(review.message.content) as { ok?: boolean; issues?: unknown } | null;
    const issues = Array.isArray(r?.issues) ? r!.issues.filter((x): x is string => typeof x === 'string').slice(0, 3) : [];
    // an unreadable review doesn't sink a draft that already passed the numbers check
    const passed = r === null || r.ok === true || (r.ok !== false && issues.length === 0);
    const detail = r === null ? 'no readable verdict; the numbers check stands' : passed ? 'passed' : issues.join('; ') || 'rejected';
    trace.push({ agent: 'Verifier', kind: 'model', name: 'football sense', detail, ms: Math.round(now() - t), tokens: review.usage.prompt + review.usage.completion });
    if (passed) return { value, drafts: d, flags, trace, usage };
    flags.push(...(issues.length ? issues : ['The Verifier rejected the draft on football sense.']).map((i) => `Football sense: ${i}`));
  }
  return { value: null, drafts: maxDrafts, flags, trace, usage };
}
