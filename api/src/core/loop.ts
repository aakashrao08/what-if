// The agent loop: the model reads the task, calls tools (the simulation engine and the league data),
// reads what comes back, and finishes by calling one of its "final" tools. A final tool validates
// the answer; if it refuses, the model hears why and tries again. Rounds and time are capped.

import type { AgentName, TraceEvent, Usage } from '../../../src/agents/contract';
import type { ChatFn, ChatMessage, ToolSpec } from './model';

export type Verdict<T> = { accept: true; value: T } | { accept: false; error: string };

export interface Tool {
  name: string;
  description: string;
  parameters: Record<string, unknown>;
  /** ordinary tools return data for the model; final tools return a Verdict */
  final?: boolean;
  run: (args: Record<string, unknown>) => unknown | Promise<unknown>;
  /** a short line for the trace, e.g. `find_player("Nettleshaw") → 1 match` */
  describe?: (args: Record<string, unknown>, result: unknown) => string;
}

export interface AgentRun {
  final: { tool: string; value: unknown } | null;
  text: string | null;
  rounds: number;
  trace: TraceEvent[];
  usage: Usage;
}

/** An error as a reader may see it (in the trace or a tool result): never raw provider or database text.
 *  The detail goes to the server log, which Application Insights collects. */
export function safeError(err: unknown): string {
  const raw = String(err);
  console.warn(`agent_error_detail ${raw.slice(0, 300)}`);
  const code = raw.match(/\b(4\d\d|5\d\d)\b/)?.[1];
  if (code === '429') return 'the model is busy right now (rate limited)';
  if (/abort|timed? ?out/i.test(raw)) return 'the model took too long';
  if (code) return `the model service returned ${code}`;
  return 'the service was unavailable';
}

export const emptyUsage = (): Usage => ({ calls: 0, promptTokens: 0, completionTokens: 0 });
export const addUsage = (a: Usage, b: Usage): Usage => ({ calls: a.calls + b.calls, promptTokens: a.promptTokens + b.promptTokens, completionTokens: a.completionTokens + b.completionTokens });

const MAX_RESULT = 3500; // characters of tool output the model sees; keeps prompts (and costs) small
const now = () => performance.now();

export const toolSpec = (t: Tool): ToolSpec => ({ type: 'function', function: { name: t.name, description: t.description, parameters: t.parameters } });

function parseArgs(raw: string): Record<string, unknown> | null {
  try {
    const v = JSON.parse(raw || '{}');
    return v && typeof v === 'object' && !Array.isArray(v) ? v : null;
  } catch {
    return null;
  }
}

const isVerdict = (v: unknown): v is Verdict<unknown> => !!v && typeof v === 'object' && 'accept' in v;

export async function runAgent(o: {
  agent: AgentName;
  chat: ChatFn;
  system: string;
  user: string;
  tools: Tool[];
  maxRounds?: number;
  deadline?: number; // performance.now() value to stop by
}): Promise<AgentRun> {
  const trace: TraceEvent[] = [];
  const usage = emptyUsage();
  const byName = new Map(o.tools.map((t) => [t.name, t]));
  const specs = o.tools.map(toolSpec);
  const messages: ChatMessage[] = [{ role: 'system', content: o.system }, { role: 'user', content: o.user }];
  const maxRounds = o.maxRounds ?? 6;

  for (let round = 1; round <= maxRounds; round++) {
    if (o.deadline && now() > o.deadline) {
      trace.push({ agent: o.agent, kind: 'note', name: 'deadline', detail: 'Out of time; handing back to the rulebook', ms: 0 });
      return { final: null, text: null, rounds: round - 1, trace, usage };
    }
    const t0 = now();
    const res = await o.chat(messages, { tools: specs, maxTokens: 500, temperature: 0.2 });
    usage.calls++; usage.promptTokens += res.usage.prompt; usage.completionTokens += res.usage.completion;
    const calls = res.message.tool_calls ?? [];
    trace.push({
      agent: o.agent, kind: 'model', name: `round ${round}`,
      detail: calls.length ? `asked for ${calls.map((c) => c.function.name).join(', ')}` : 'answered without tools',
      ms: Math.round(now() - t0), tokens: res.usage.prompt + res.usage.completion
    });
    if (!calls.length) return { final: null, text: res.message.content, rounds: round, trace, usage };

    messages.push({ role: 'assistant', content: res.message.content, tool_calls: calls });
    for (const call of calls) {
      const tool = byName.get(call.function.name);
      const args = parseArgs(call.function.arguments);
      const t1 = now();
      let result: unknown;
      if (!tool) result = { error: `No tool called ${call.function.name}.` };
      else if (!args) result = { error: 'Arguments were not valid JSON.' };
      else {
        try { result = await tool.run(args); } catch (err) { result = { error: `Tool failed: ${safeError(err)}` }; }
      }
      const ms = Math.round(now() - t1);
      if (tool?.final && isVerdict(result)) {
        if (result.accept) {
          trace.push({ agent: o.agent, kind: 'tool', name: tool.name, detail: tool.describe?.(args ?? {}, result.value) ?? 'accepted', ms });
          return { final: { tool: tool.name, value: result.value }, text: null, rounds: round, trace, usage };
        }
        trace.push({ agent: o.agent, kind: 'check', name: tool.name, detail: `refused: ${result.error}`, ms });
        result = { refused: result.error };
      } else {
        trace.push({ agent: o.agent, kind: 'tool', name: call.function.name, detail: tool?.describe?.(args ?? {}, result) ?? summarise(args), ms });
      }
      let content = JSON.stringify(result);
      if (content.length > MAX_RESULT) content = `${content.slice(0, MAX_RESULT)}… (truncated)`;
      messages.push({ role: 'tool', tool_call_id: call.id, content });
    }
  }
  trace.push({ agent: o.agent, kind: 'note', name: 'rounds', detail: `No answer after ${maxRounds} rounds`, ms: 0 });
  return { final: null, text: null, rounds: maxRounds, trace, usage };
}

function summarise(args: Record<string, unknown> | null): string {
  if (!args) return 'bad arguments';
  const s = Object.entries(args).map(([k, v]) => `${k}=${typeof v === 'string' ? `"${v}"` : JSON.stringify(v)}`).join(', ');
  return s.length > 90 ? `${s.slice(0, 90)}…` : s || 'no arguments';
}
