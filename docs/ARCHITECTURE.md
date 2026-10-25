# Architecture

```
forge/ ──► src/data/league.json ──► src/engine/ (Web Worker) ──► src/agents/ ──► src/screens/
 ingest         one file               interpret                   explain          render
                                                                      ▲                │
                                         src/state/prefs.tsx ─────────┴────────────────┘
                                                 personalise
                                                      │
                                       api/ (Azure Functions → Foundry), optional
```

## 1. Ingest: `forge/`

The Forge writes one deterministic file, `src/data/league.json` (about 370 KB). Run it with
`npm run forge`.

- `clubs.ts`: 20 invented clubs with a tier, a playing style and colours, and three free-agent
  managers for Multiverse.
- `names.ts`: player names built from invented first names and ordinary surnames, checked against a
  list of real names to avoid.
- `forge.ts`: squads, a 38-round schedule and season results up to matchweek 33. A seed search keeps
  the season that sets up the story: Northbridge one point off the top four going into matchweek 34,
  Harbour Athletic in the bottom three.
- `demo.ts`: the flagship match, Northbridge v Harbour Athletic, scripted event by event (29 events,
  6 turning points, 6 stopped attacks, a substitution at 55' and a switch to a back five at 58').
- Season stats (appearances, assists, cards, clean sheets) come from a last pass on its own random
  stream, so adding them changed nothing else. The Forge keeps its own copy of the original match
  model, so the season that already happened doesn't move when the forecasting engine improves.
- `feedgen.ts`: feeds for the other matchweek-34 games. Shots get an xG, goals match the simulated
  score, and there are penalties, fouls, offsides, substitutions, turning points, stopped attacks
  with pundit claims, and tracking stats.

Kick-offs are staggered: two games at 12:30 (already finished), six at 15:00 (running on the replay
clock alongside the flagship) and one at 17:30 with no feed yet.

## 2. Interpret: `src/engine/`

All engine work runs in a Web Worker (`worker.ts`), with a main-thread fallback in `client.ts`.
Results are cached by job and arguments.

| File | What it does |
| --- | --- |
| `rng.ts` | Seeded mulberry32, Poisson draws and inverse-CDF Poisson (`poissonInv`) for coupled draws. |
| `match.ts` | The match model: a Markov chain over (home goals, away goals) in 3-minute steps, with rates from club ratings, game state (trailing sides push), a late-game lift and scheduled changes (subs, shape changes). `winProb` is an **exact forward pass** over every scoreline (up to 12 more goals a side), so win probability has no sampling noise; `playRest` samples the same chain for replays. A **Dixon–Coles** low-score correction (`DC_RHO = -0.1`) moves probability from 1-0 / 0-1 into 0-0 / 1-1, exactly for full matches (`playMatch`) and, for the goals still to come, in the exact pass and in `playRest`. |
| `demo.ts` | Win probability at any minute; each turning point's swing (what happened) and what-if (if it had gone the other way). **Pressure**: each side's rate is updated by the non-penalty xG it has created before that minute, a gamma–Poisson posterior with a prior worth one match (`PRESSURE_PRIOR_MIN = 90`) at the model's expected rate. A moment's own chance counts from the next minute, so its before/after is purely its effect on the score. |
| `credit.ts` | **Fair credit**: exact Shapley values of a match's turning points. Every one of the 2^k combinations of moments (as they happened, or the other way) is scored with the exact model from just before the first moment, with each moment's goal scheduled at its minute, so timing counts. The values add up to the gap between the match as it happened and the match where everything went the other way. Job: `credit`. |
| `ghost.ts` | Ghost runs: logistic xG from distance, angle and pressure, plus models for clearances, tackles, blocks, offside margins and DOGSO. Wilson intervals for ranges. |
| `season.ts` | Run-ins: plays the remaining fixtures 10,000 times. Each simulated season draws every club's attack and defence with lognormal noise (σ = 0.06) so rating uncertainty shows, and each title / top-four / relegation chance gets a **95% range** from batch means over 20 batches (never narrower than Wilson). Rating adjustments use coupled draws (same uniforms, same rating noise, same low-score correction) so a small change makes a small difference. |
| `league.ts` | Tables, the ripple of one result, and `universe()` for Multiverse levers: transfer in or out, injury, manager, tactics, points, a single moment flipped, or a combination. |
| `races.ts` | Current Affairs: `standings()` (table, 10,000-season outlook, points against expected points, form, exact odds for every remaining game), `races()` (the remaining games played 10,000 times with goals and assists handed out by the Forge's weights: top-scorer and top-assister odds, projected totals) and `squadImpact()` (a club's race chance with each key starter out). |
| `settle.ts` | The ten studio experiments: substitution and penalty replays, keeper comparison, deserved result, win-probability added, finishing against xG, offside and red-card calls, clearance value, tactic switch. |

## 3. Explain: `src/agents/`

Four agents, each a plain module.

- **Data Scientist** (`dataScientist.ts`): picks turning points (swing of at least 10 points, or a
  what-if of at least 15) and turns a studio question into an experiment spec.
- **Analyst** (`analyst.ts`): flattens engine output into a named set of facts per card.
- **Narrator** (`narrator.ts`, `templates/`): writes from facts only. The flagship match has a
  hand-written bank; every other moment uses family templates (goals, chances) for four voices in
  seven languages: English, Chinese, Malay, Tamil, Hindi, Spanish and Portuguese.
- **Verifier** (`verifier.ts`): every number in the text must appear in the facts (allowing for
  rounding, signs and decimal commas). Rules catch unsupported superlatives, certainty, red-card
  claims, "decided the match", and comparisons ("more likely", "a better shot") between chances whose
  95% ranges overlap (`rangesOverlap` in the facts), unless the claim is negated. A failed draft goes back to the
  Narrator with the reason. Settle It shows that loop on screen.
- **What would it take?** (`takes.ts`, engine in `src/engine/takes.ts`): reads a goal (club plus
  title, top four or survival), builds candidate changes that each have a sentence `drFootball()`
  reads back to the same levers, and writes up the search. The engine screens every candidate at
  1,000 seasons against one shared baseline, tries pairs if nothing works alone, confirms a varied
  shortlist at 10,000 and binary-searches the points the gap is worth.
- **Match recap** (`recap.ts`): headline and four paragraphs at full time (goals, the moment that
  mattered, whether it was deserved on xG replays, what it does to both seasons), shaped by the kind
  of match and written in the first person for a fan.
- **Overlay cues** (`overlay.ts`): the match as timed, machine-readable graphics cues
  (`whatif.overlay/1`) for a broadcast graphics engine.
- **Router** (`router.ts`): the rulebook for Ask What If; the live router agent handles the rest.
- **Cards** (`cards.ts`): The Swing, Ghost Run and Impact Reel cards, pure functions shared by the
  screens, the cues and the API.
- **Current Affairs** (`currentAffairs.ts`): facts and lines for the club card, squad insights,
  leaderboards and the player card, each checked by the Verifier.
- **Scout** (`scout.ts`): decides My Dugout's alerts (swings over your threshold, merged when they
  land within four minutes; Ghost Run verdicts; full-time ripples; results elsewhere that move your
  race) and writes them in seven languages, fan or neutral voice, each with its own facts.
- **Dr Football** (`drFootball.ts`): reads a Multiverse question into levers, refuses what the
  engine can't model (real clubs, unknown players, impossible rules) and explains why.

`pipeline.ts` wires these together for each screen. When the site is built with
`VITE_AGENT_MODE=live`, `live.ts` sends Settle It and Multiverse questions to the agent backend
(below) and the pipeline falls back to the templates if that fails. The Verifier always runs in
the browser too.

## 4. Render: `src/screens/`, `src/ui/`

React 19 with a hash router, so the build works on any static host. One SVG pitch component draws
players, the ball, real and ghost paths and labels. Styles are plain CSS with tokens in
`src/styles.css`. The matchweek ticker (`ui/MatchTicker.tsx`) switches The Swing, Ghost Run and
Ripple between matches.

## 5. Personalise: `src/state/`

`prefs.tsx` keeps followed clubs, the watch-as setting, language, alert threshold and saved
universes in localStorage. Personas are relative to the match being viewed: following Northbridge
makes you the home fan in Northbridge v Harbour and nobody's fan in Thistlebury v Old Puddingham. `match.tsx`
holds the shared replay clock and loads each match's timeline and ghost runs on demand.

`i18n.tsx` carries the language across every screen. `t(text)` answers from the interface
dictionary (`src/i18n/dict.ts`, seven languages, instant and offline), then from verified
translations already fetched (kept in localStorage), and otherwise shows the English while the line
is queued. Queued lines go to `/api/agents/translate` in batches of 12, four at a time; each translation must
contain exactly the numbers of its English source (`factsFromText` + `verify`), checked on the server
and again in the browser before it replaces the English. Text the agents already wrote in the
reader's language (Swing cards, Scout alerts, live recaps) is left alone.

## Tests

`npm test` runs the engine tests and the agent tests. The agent tests generate every Swing card
(every feed, turning point, persona, language and point of view: over 1,000 cards), every ghost
card and reel item, ripple stories for several matches, all ten Settle It answers and every
Multiverse example, and require each one to pass the Verifier with no `undefined` or `NaN`.

## Backend: `api/`

Agents that use the engine as tools, on Azure Functions (managed by Azure Static Web Apps) with a
chat model on Microsoft Foundry.

```
POST /api/agents/settle      Data Scientist (tools) ─► engine ─► Analyst ─► Narrator ⇄ Verifier
POST /api/agents/multiverse  Dr Football (tools)    ─► engine ─► Analyst ─► Narrator ⇄ Verifier
POST /api/agents/whatittakes Dr Football (tools)    ─► engine search ─► Narrator ⇄ Verifier
POST /api/agents/scout       Scout ⇄ Verifier (per alert, only rejected alerts redrafted)
POST /api/agents/recap       Analyst (engine run on the server) ─► Narrator ⇄ Verifier, in the reader's language
POST /api/agents/ask         Router (tools) ─► hands the question to a screen's agent team
POST /api/agents/translate   Narrator ⇄ Verifier (code), batches of lines, cached per line and language
POST /api/speech/speak       Azure AI Speech: a neural voice reads one line in the reader's language (cached)
POST /api/speech/hear        Azure AI Speech: a spoken question (16 kHz WAV, under 15 s) as words
GET  /api/overlay/{fixture}  overlay cues (no model call)
POST /api/mcp                the engine as MCP tools for any agent (no model call)
GET  /api/health
```

| File | What it does |
| --- | --- |
| `src/core/model.ts` | OpenAI-style chat completions against Foundry. Retries once with `max_completion_tokens` for models that reject `max_tokens`. Everything else takes a `ChatFn`, so tests use a scripted model. |
| `src/core/loop.ts` | The agent loop: model → tool calls → results → model, until a *final* tool accepts an answer. Final tools validate (a spec the engine can run, a sentence the scenario reader understands); a refusal goes back to the model with the reason. Rounds, time and tool output size are capped. |
| `src/core/tools.ts` | Lookups (players with fuzzy matching, clubs, table, managers, moments, fixtures, substitutions, stopped attacks), `run_experiment` on the seeded engine, `check_scenario` with the browser's `drFootball()` reader, `submit_goal` for What would it take?, and the final tools. |
| `src/core/write.ts` | Narrator ⇄ Verifier: drafts as JSON, `verify()` in code, then a football-sense review by model; issues go back as feedback, up to three drafts. |
| `src/core/pipelines.ts` | Settle It and Multiverse, with the rulebook and template as fallbacks at every step, and the agent steps and trace the UI shows. |
| `src/core/guard.ts` | Response cache, per-visitor and daily limits, input checks. |
| `src/core/mcp.ts` | MCP over HTTP (stateless JSON-RPC): lookups, search_players, run_experiment, standings, club outlook, player races, "without him", play a what-if, what would it take, recap and cues. Read-only. |
| `src/core/db.ts` | Azure Cosmos DB: creates and seeds the `whatif` database (clubs, players, fixtures, feeds) when configured, serves `search_players`, and logs every agent run. |
| `src/functions/index.ts` | The HTTP endpoints. |
| `prompts/*.md` | System prompts, inlined into the bundle at build time. |

The backend imports the browser's engine and agents directly (`src/engine`, `src/agents`), and
esbuild bundles them into one file. Engine runs are seeded, so the browser re-runs the experiment
or universe the server chose and gets identical numbers; it re-verifies the live text against its
own facts before showing it. `src/agents/contract.ts` is the request and response types both sides
share. The tests in `src/core/__tests__` drive the whole backend with a scripted model.
