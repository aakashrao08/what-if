// HTTP endpoints for the agent backend, served by Azure Static Web Apps at /api.
//   POST /api/agents/settle      { question }  -> SettleReply
//   POST /api/agents/multiverse  { question }  -> MultiverseReply
//   POST /api/agents/whatittakes { question, club? } -> TakesReply
//   POST /api/agents/ask         { question }  -> AskReply (which team answers it)
//   POST /api/agents/recap       { fixtureId, persona, lang } -> RecapReply
//   POST /api/agents/translate   { lang, items } -> TranslateReply (every line checked)
//   POST /api/agents/scout       { lang, fan, club, alerts } -> ScoutReply
//   GET  /api/overlay/{fixtureId}?persona=&lang=  -> timed broadcast graphics cues (no model call)
//   POST /api/mcp                MCP (HTTP transport, JSON responses): the engine as tools for any agent
//   POST /api/speech/speak       { text, lang } -> audio/mpeg, a neural voice reads the line (Azure AI Speech)
//   POST /api/speech/hear?lang=  16 kHz mono WAV -> { text }, a spoken question as words
//   GET  /api/health                            -> whether live agents and speech are configured
// The browser treats any non-200 as "use the templates", so failures degrade quietly.

import { app, type HttpRequest, type HttpResponseInit, type InvocationContext } from '@azure/functions';
import { league } from '../../../src/data/league';
import { foundryChat, foundryConfig } from '../core/model';
import { askPipeline, multiversePipeline, readRecap, readTranslate, translatePipeline, readScout, recapPipeline, scoutPipeline, settlePipeline, takesPipeline, type PipelineDeps } from '../core/pipelines';
import { LruCache, RateLimiter, cacheKey, normQuestion, readQuestion } from '../core/guard';
import { computeGhost, computeTimeline, type Timeline } from '../../../src/engine/demo';
import { overlayCues } from '../../../src/agents/overlay';
import { handleMcp, mcpTools } from '../core/mcp';
import { dbStatus, getDb, logRun } from '../core/db';
import { useDatabase } from '../core/tools';
import { LANGS, type Lang, type Persona } from '../../../src/agents/format';
import { checkWav, hear, readSpeak, speak, speechConfig } from '../core/speech';

const cfg = foundryConfig();
const deps: PipelineDeps | null = cfg ? { league, chat: foundryChat(cfg), model: cfg.model } : null;
const cache = new LruCache<object>(300);
useDatabase(() => getDb(league));
void getDb(league); // create and seed the database in the background on a cold start

/** Log every agent run to the database (no personal data), counting fallbacks to the rulebook or template. */
// ...and write the same summary as one structured log line, which Application Insights collects
// (query: traces | where message startswith "agent_run" | extend r = parse_json(substring(message, 10)))
const record = (pipeline: string, reply: { ok?: boolean; usage?: { calls: number; promptTokens: number; completionTokens: number }; trace?: { agent: string; kind: string; name: string; detail: string; ms: number }[] }, ms: number, cached: boolean, ctx?: InvocationContext) => {
  const fallbacks = (reply.trace ?? []).filter((e) => e.name === 'rulebook' || /template|house/i.test(e.detail)).length;
  ctx?.info(`agent_run ${JSON.stringify({ pipeline, ok: reply.ok !== false, cached, ms, calls: reply.usage?.calls ?? 0, tokens: (reply.usage?.promptTokens ?? 0) + (reply.usage?.completionTokens ?? 0), fallbacks, tools: (reply.trace ?? []).filter((e) => e.kind === 'tool').length })}`);
  void logRun(league, { pipeline, model: deps?.model ?? '', ok: reply.ok !== false, cached, ms, usage: reply.usage, trace: reply.trace as never, fallbacks });
};
// Generous enough to explore properly (visitors behind one office network share an address);
// answers served from the cache don't count, and when a limit is hit the site falls back to its templates.
const limiter = new RateLimiter(Number(process.env.AGENT_RATE_PER_10MIN) || 30, 10 * 60_000, Number(process.env.AGENT_DAILY_LIMIT) || 1500);

/** Refuse a body bigger than the endpoint needs before reading it. */
const tooBig = (req: HttpRequest, max: number): HttpResponseInit | null => (Number(req.headers.get('content-length') ?? 0) > max ? { status: 413, jsonBody: { error: 'Request too large.' } } : null);

const visitor = (req: HttpRequest) => (req.headers.get('x-forwarded-for') ?? req.headers.get('x-client-ip') ?? 'anon').split(',')[0].trim();

type Pipeline = (deps: PipelineDeps, question: string, body: Record<string, unknown>) => Promise<{ ok: boolean }>;

function endpoint(name: string, pipeline: Pipeline) {
  app.http(`agents-${name}`, {
    route: `agents/${name}`,
    methods: ['POST'],
    authLevel: 'anonymous',
    handler: async (req, ctx): Promise<HttpResponseInit> => {
      if (!deps) return { status: 503, jsonBody: { error: 'Live agents are not configured (FOUNDRY_CHAT_URL, FOUNDRY_API_KEY, FOUNDRY_MODEL).' } };
      const big = tooBig(req, 16_000);
      if (big) return big;
      let body: unknown;
      try { body = await req.json(); } catch { return { status: 400, jsonBody: { error: 'Body must be JSON.' } }; }
      const input = readQuestion(body);
      if ('error' in input) return { status: 400, jsonBody: input };
      const extra = typeof (body as { club?: unknown }).club === 'string' ? String((body as { club: string }).club).slice(0, 8) : '';
      const key = cacheKey(name, deps.model, normQuestion(input.question), extra);
      const hit = cache.get(key);
      if (hit) { record(name, hit, 0, true, ctx); return { jsonBody: { ...hit, cached: true } }; }
      const limited = limiter.check(visitor(req));
      if (limited) return { status: 429, jsonBody: { error: limited } };
      try {
        const t0 = Date.now();
        const reply = await pipeline(deps, input.question, body as Record<string, unknown>);
        cache.set(key, reply);
        record(name, reply, Date.now() - t0, false, ctx);
        return { jsonBody: reply };
      } catch (err) {
        ctx.error(`agent_error ${JSON.stringify({ pipeline: name, error: String(err).slice(0, 200) })}`);
        return { status: 503, jsonBody: { error: 'The agents are unavailable right now.' } };
      }
    }
  });
}

endpoint('settle', settlePipeline);
endpoint('multiverse', multiversePipeline);
endpoint('whatittakes', takesPipeline);
endpoint('ask', askPipeline);

/** A typed body (not a question): validated by `read`, cached on the validated input. */
function structured<T extends object>(name: string, read: (body: unknown) => T | { error: string }, run: (d: PipelineDeps, input: T) => Promise<object>, limits: RateLimiter = limiter) {
  app.http(`agents-${name}`, {
    route: `agents/${name}`,
    methods: ['POST'],
    authLevel: 'anonymous',
    handler: async (req, ctx): Promise<HttpResponseInit> => {
      if (!deps) return { status: 503, jsonBody: { error: 'Live agents are not configured.' } };
      let body: unknown;
      const big = tooBig(req, 64_000);
      if (big) return big;
      try { body = await req.json(); } catch { return { status: 400, jsonBody: { error: 'Body must be JSON.' } }; }
      const input = read(body);
      if ('error' in input) return { status: 400, jsonBody: input };
      const key = cacheKey(name, deps.model, JSON.stringify(input));
      const hit = cache.get(key);
      if (hit) { record(name, hit, 0, true, ctx); return { jsonBody: { ...hit, cached: true } }; }
      const limited = limits.check(visitor(req));
      if (limited) return { status: 429, jsonBody: { error: limited } };
      try {
        const t0 = Date.now();
        const reply = await run(deps, input);
        cache.set(key, reply);
        record(name, reply as never, Date.now() - t0, false, ctx);
        return { jsonBody: reply };
      } catch (err) {
        ctx.error(`agent_error ${JSON.stringify({ pipeline: name, error: String(err).slice(0, 200) })}`);
        return { status: 503, jsonBody: { error: 'The agents are unavailable right now.' } };
      }
    }
  });
}

structured('recap', (b) => readRecap(b, league), recapPipeline);

structured('scout', (b) => readScout(b, league), scoutPipeline);

// translation has its own allowance (a page can need a few batches), so it never eats into the agents'
const translateLimiter = new RateLimiter(Number(process.env.TRANSLATE_PER_10MIN) || 120, 10 * 60_000, Number(process.env.TRANSLATE_DAILY_LIMIT) || 4000);
structured('translate', readTranslate, translatePipeline, translateLimiter);

const timelines = new Map<string, Timeline>();
app.http('overlay', {
  route: 'overlay/{fixtureId}',
  methods: ['GET'],
  authLevel: 'anonymous',
  handler: async (req): Promise<HttpResponseInit> => {
    const feed = league.feeds.find((f) => f.fixtureId === req.params.fixtureId);
    if (!feed) return { status: 404, jsonBody: { error: 'Unknown match.', matches: league.feeds.map((f) => f.fixtureId) } };
    const persona = (['casual', 'home', 'away', 'analyst'].includes(req.query.get('persona') ?? '') ? req.query.get('persona') : 'casual') as Persona;
    const lang = (LANGS.some((l) => l.id === req.query.get('lang')) ? req.query.get('lang') : 'en') as Lang;
    if (!timelines.has(feed.fixtureId)) timelines.set(feed.fixtureId, computeTimeline(league, feed));
    const cues = overlayCues(league, feed, timelines.get(feed.fixtureId)!, feed.stoppedAttacks.map((a) => computeGhost(a)), persona, lang);
    return { jsonBody: cues, headers: { 'Cache-Control': 'public, max-age=3600' } };
  }
});

const tools = mcpTools(league);
const HEAVY_TOOLS = new Set(['what_would_it_take', 'play_what_if', 'player_without', 'standings', 'player_races']);
const heavyLimiter = new RateLimiter(Number(process.env.MCP_HEAVY_PER_10MIN) || 10, 10 * 60_000, Number(process.env.MCP_HEAVY_DAILY_LIMIT) || 500);
app.http('mcp', {
  route: 'mcp',
  methods: ['POST', 'GET', 'DELETE'],
  authLevel: 'anonymous',
  handler: async (req): Promise<HttpResponseInit> => {
    // stateless server: no server-sent event stream and no sessions to end
    if (req.method !== 'POST') return { status: 405, headers: { Allow: 'POST' }, jsonBody: { error: 'POST JSON-RPC messages to this endpoint.' } };
    let body: unknown;
    const big = tooBig(req, 64_000);
    if (big) return big;
    try { body = await req.json(); } catch { return { status: 400, jsonBody: { jsonrpc: '2.0', id: null, error: { code: -32700, message: 'Parse error' } } }; }
    const calls = Array.isArray(body) ? body : [body];
    const called = calls.filter((m) => (m as { method?: string })?.method === 'tools/call').map((m) => String((m as { params?: { name?: unknown } }).params?.name ?? ''));
    if (called.length) {
      // the simulation-heavy tools get their own, tighter limit so the endpoint can't be used as free compute
      const heavy = called.some((n) => HEAVY_TOOLS.has(n));
      const limited = limiter.check(visitor(req)) ?? (heavy ? heavyLimiter.check(visitor(req)) : null);
      if (limited) return { status: 429, jsonBody: { jsonrpc: '2.0', id: null, error: { code: -32000, message: limited } } };
    }
    const replies = (await Promise.all(calls.map((m) => handleMcp(tools, m)))).filter((r) => r !== null);
    if (!replies.length) return { status: 202 };
    return { jsonBody: Array.isArray(body) ? replies : replies[0], headers: { 'Content-Type': 'application/json' } };
  }
});

// speech: its own allowance, and only ever the site's own short lines or a short question
const speech = speechConfig();
const speakLimiter = new RateLimiter(Number(process.env.SPEECH_PER_10MIN) || 40, 10 * 60_000, Number(process.env.SPEECH_DAILY_LIMIT) || 1500);
const hearLimiter = new RateLimiter(Number(process.env.HEAR_PER_10MIN) || 15, 10 * 60_000, Number(process.env.HEAR_DAILY_LIMIT) || 500);
const langIds = LANGS.map((l) => l.id);
app.http('speech-speak', {
  route: 'speech/speak',
  methods: ['POST'],
  authLevel: 'anonymous',
  handler: async (req, ctx): Promise<HttpResponseInit> => {
    if (!speech) return { status: 503, jsonBody: { error: 'Speech is not configured (SPEECH_KEY, SPEECH_REGION).' } };
    let body: unknown;
    const big = tooBig(req, 8_000);
    if (big) return big;
    try { body = await req.json(); } catch { return { status: 400, jsonBody: { error: 'Body must be JSON.' } }; }
    const input = readSpeak(body, langIds);
    if ('error' in input) return { status: 400, jsonBody: input };
    const limited = speakLimiter.check(visitor(req));
    if (limited) return { status: 429, jsonBody: { error: limited } };
    try {
      const audio = await speak(speech, input.text, input.lang);
      ctx.info(`speech_run ${JSON.stringify({ kind: 'speak', lang: input.lang, chars: input.text.length })}`);
      return { body: audio, headers: { 'Content-Type': 'audio/mpeg', 'Cache-Control': 'private, max-age=86400' } };
    } catch (err) {
      ctx.error(`speech_error ${JSON.stringify({ kind: 'speak', error: String(err).slice(0, 200) })}`);
      return { status: 503, jsonBody: { error: 'Speech is unavailable right now.' } };
    }
  }
});
app.http('speech-hear', {
  route: 'speech/hear',
  methods: ['POST'],
  authLevel: 'anonymous',
  handler: async (req, ctx): Promise<HttpResponseInit> => {
    if (!speech) return { status: 503, jsonBody: { error: 'Speech is not configured (SPEECH_KEY, SPEECH_REGION).' } };
    const lang = req.query.get('lang') ?? 'en';
    if (!langIds.includes(lang as Lang)) return { status: 400, jsonBody: { error: 'Unknown language.' } };
    const big = tooBig(req, 600_000);
    if (big) return big;
    const wav = new Uint8Array(await req.arrayBuffer());
    const bad = checkWav(wav);
    if (bad) return { status: 400, jsonBody: { error: bad } };
    const limited = hearLimiter.check(visitor(req));
    if (limited) return { status: 429, jsonBody: { error: limited } };
    try {
      const text = await hear(speech, wav, lang as Lang);
      ctx.info(`speech_run ${JSON.stringify({ kind: 'hear', lang, seconds: Math.round((wav.length - 44) / 32000) })}`);
      return { jsonBody: { text } };
    } catch (err) {
      ctx.error(`speech_error ${JSON.stringify({ kind: 'hear', error: String(err).slice(0, 200) })}`);
      return { status: 503, jsonBody: { error: 'Speech is unavailable right now.' } };
    }
  }
});

app.http('health', {
  route: 'health',
  methods: ['GET'],
  authLevel: 'anonymous',
  handler: async () => ({ jsonBody: { live: !!deps, model: cfg?.model ?? null, speech: !!speech, database: await dbStatus(league) } })
});
