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
  seconds, batch sizes) and errors return a generic message; details go to the server log only.
- **Model output is checked before it is shown.** The Verifier checks every number against the
  engine's facts, on the server and again in the browser; agents' tools are read-only views of the
  simulation engine.
- **Browser hardening:** a strict Content-Security-Policy (scripts from this origin only, no framing),
  HSTS, `nosniff`, a referrer policy, and a Permissions-Policy that allows only the microphone, for
  asking by voice.
- **Deploys** run only from pushes to `main`, with GitHub identity (OIDC) plus the deployment token.
- **Synthetic data only.** No personal data is collected; preferences stay in the visitor's browser.
