// The one door to the language model: an OpenAI-style chat completions call to a model deployed on
// Microsoft Foundry. Everything else takes a ChatFn, so tests swap in a scripted model.

export interface ToolCall { id: string; type: 'function'; function: { name: string; arguments: string } }

export type ChatMessage =
  | { role: 'system' | 'user'; content: string }
  | { role: 'assistant'; content: string | null; tool_calls?: ToolCall[] }
  | { role: 'tool'; tool_call_id: string; content: string };

export interface ToolSpec {
  type: 'function';
  function: { name: string; description: string; parameters: Record<string, unknown> };
}

export interface ChatOptions { tools?: ToolSpec[]; json?: boolean; maxTokens?: number; temperature?: number }
export interface ChatResult {
  message: { content: string | null; tool_calls?: ToolCall[] };
  usage: { prompt: number; completion: number };
}
export type ChatFn = (messages: ChatMessage[], opts?: ChatOptions) => Promise<ChatResult>;

export interface FoundryConfig { url: string; key: string; model: string; timeoutMs?: number }

export function foundryConfig(env: Record<string, string | undefined> = process.env): FoundryConfig | null {
  const { FOUNDRY_CHAT_URL: url, FOUNDRY_API_KEY: key, FOUNDRY_MODEL: model } = env;
  return url && key && model ? { url, key, model, timeoutMs: Number(env.FOUNDRY_TIMEOUT_MS) || 15000 } : null;
}

/**
 * Chat completions against a Foundry endpoint (Azure AI model inference or Azure OpenAI). Newer
 * reasoning models reject `max_tokens` and `temperature`; if the endpoint says so, we retry once
 * with `max_completion_tokens` and remember the choice for the rest of the instance's life.
 */
export function foundryChat(cfg: FoundryConfig, fetchImpl: typeof fetch = fetch): ChatFn {
  let modern = false;
  return async (messages, opts = {}) => {
    const send = async () => {
      const body: Record<string, unknown> = { model: cfg.model, messages };
      if (modern) body.max_completion_tokens = opts.maxTokens ?? 600;
      else { body.max_tokens = opts.maxTokens ?? 600; body.temperature = opts.temperature ?? 0.3; }
      if (opts.tools?.length) { body.tools = opts.tools; body.tool_choice = 'auto'; }
      else if (opts.json) body.response_format = { type: 'json_object' };
      const ctrl = new AbortController();
      const timer = setTimeout(() => ctrl.abort(), cfg.timeoutMs ?? 15000);
      try {
        return await fetchImpl(cfg.url, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'api-key': cfg.key },
          body: JSON.stringify(body),
          signal: ctrl.signal
        });
      } finally {
        clearTimeout(timer);
      }
    };
    let res = await send();
    if (res.status === 400 && !modern) {
      const text = await res.text();
      if (/max_tokens|max_completion_tokens|temperature/.test(text)) { modern = true; res = await send(); }
      else throw new Error(`Foundry 400: ${text.slice(0, 200)}`);
    }
    if (!res.ok) throw new Error(`Foundry ${res.status}: ${(await res.text()).slice(0, 200)}`);
    const data = (await res.json()) as {
      choices: { message: { content: string | null; tool_calls?: ToolCall[] } }[];
      usage?: { prompt_tokens?: number; completion_tokens?: number };
    };
    const message = data.choices?.[0]?.message ?? { content: null };
    return { message, usage: { prompt: data.usage?.prompt_tokens ?? 0, completion: data.usage?.completion_tokens ?? 0 } };
  };
}
