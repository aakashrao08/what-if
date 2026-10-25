// Live mode: the agents run on the server (api/, Azure Functions) with models on Microsoft Foundry
// and the simulation engine as their tools. Set VITE_AGENT_MODE=live at build time. The browser
// never holds a key; it calls /api/agents/<pipeline> and falls back to the templates if the call
// fails, times out, or the in-browser Verifier disagrees with what came back.

export const LIVE = import.meta.env?.VITE_AGENT_MODE === 'live';

export type LivePipeline = 'settle' | 'multiverse' | 'whatittakes' | 'scout' | 'recap' | 'ask' | 'translate';

export async function askAgents<T>(pipeline: LivePipeline, body: unknown, timeoutMs = 30000): Promise<T | null> {
  if (!LIVE) return null;
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(`/api/agents/${pipeline}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal: ctrl.signal
    });
    if (!res.ok) return null;
    return (await res.json()) as T;
  } catch {
    return null;
  } finally {
    clearTimeout(t);
  }
}
