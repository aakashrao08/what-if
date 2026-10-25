# Security

Found a problem? Open a private report through GitHub's *Security → Report a vulnerability* on this
repository rather than a public issue.

## How the app is protected

- **No secrets in the browser or the repo.** The Foundry and Azure AI Speech keys live only in the
  Static Web App's environment variables; the browser talks to `/api` on the same origin and never
  sees a key. `.env*` is ignored by git.
- **Every live endpoint is bounded.** Per-visitor limits over 10 minutes plus a daily ceiling per
  endpoint (agents, translation, read-aloud, voice questions, simulation-heavy MCP tools), answer
  caching, capped tokens and tool rounds, and request bodies refused above what each endpoint needs.
  When a limit is hit the site falls back to its verified templates.
- **Inputs are validated** (question length, known languages and personas, 16 kHz WAV under 15
  seconds, batch sizes, JSON or WAV content types only, so other websites can't post on a visitor's
  behalf) and errors return a generic message; provider and database details go to the server log only.
- **A site-wide ceiling per minute** on model calls sits on top of the per-visitor limits, so forged
  addresses can't flood the model; MCP batches are capped and every tool call in them counts.
- **Translations can't be steered.** A batch containing links, markup or instructions is refused, and a
  translation is only accepted (and shared through the cache) if it looks like a translation of that
  line: same numbers, the right script, a sensible length, no links or markup.
- **Saved settings are checked field by field** when they load, so stale or tampered browser storage
  falls back to defaults instead of breaking a screen; a screen that does fail shows a way out.
- **Model output is checked before it is shown.** The Verifier checks every number against the
  engine's facts, on the server and again in the browser; agents' tools are read-only views of the
  simulation engine.
- **Browser hardening:** a strict Content-Security-Policy (scripts from this origin only, no framing),
  HSTS, `nosniff`, a referrer policy, and a Permissions-Policy that allows only the microphone, for
  asking by voice.
- **Deploys** run only from pushes to `main`, with GitHub identity (OIDC) plus the deployment token;
  every GitHub Action is pinned to an exact commit, and the checkout leaves no token behind.
- **Repository:** secret scanning with push protection, CodeQL code scanning, Dependabot alerts and
  updates, private vulnerability reporting, and `main` protected from force pushes and deletion.
- **Synthetic data only.** No personal data is collected; preferences stay in the visitor's browser.
