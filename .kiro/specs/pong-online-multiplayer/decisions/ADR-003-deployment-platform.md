# ADR-003: Unified Single-Service Deployment

## Status

Accepted (supersedes split client/server deployment)

## Context

The multiplayer feature requires both a static game client (React + Phaser) and a WebSocket relay server. The deployment architecture must decide whether these are separate services or a single unified service.

## Options Considered

### Option A: Split Deployment (client on Netlify/Vercel, relay on Render)

- Client deploys to a static host; relay deploys separately.
- **Pro:** Client can use any static host (Netlify, Vercel, GitHub Pages).
- **Con:** Two services to manage, two deploy pipelines.
- **Con:** Requires CORS configuration on the relay server.
- **Con:** Requires `VITE_RELAY_URL` environment variable in the client build.
- **Con:** Two URLs to reason about.
- **Rejected:** Unnecessary complexity for a workshop project.

### Option B: Unified Single-Service (chosen)

- One server process serves both static files (`dist/`) and WebSocket relay on the same port.
- **Pro:** One URL, one deploy, no CORS, no env vars.
- **Pro:** Client derives WebSocket URL from its own `window.location` — zero configuration.
- **Pro:** Single health check covers everything.
- **Pro:** Simpler mental model for workshop participants.
- **Con:** Cannot use pure static hosts (Netlify, GitHub Pages) — needs a server runtime.
- **Con:** Server must handle static file serving (trivial — ~10 lines with any framework).

## Decision

Use **unified single-service deployment**. One server process serves the Vite-built static files for all HTTP requests and handles WebSocket upgrades at `/ws`. Deploy as a single web service to Render (free tier) or equivalent.

The server remains minimal — static file serving is a solved problem (one middleware call), and the WebSocket relay logic is unchanged.

## Consequences

### Positive

- Zero CORS issues — everything is same-origin.
- No environment variables for relay URL — client uses `location.host`.
- One GitHub repo, one deploy pipeline, one service to monitor.
- Workshop participants deploy once and everything works.
- Health check at `/health` validates both static serving and server process.

### Negative

- Cannot deploy to pure static hosts (Netlify, GitHub Pages, Surge).
- Server process must stay alive to serve the game (but this is required for WebSocket anyway).
- Render free tier has 30s cold start — affects initial page load too, not just WebSocket.

### Risks and Mitigations

- **Risk:** Cold start delays initial page load. **Mitigation:** Render wakes on the first HTTP request; by the time the user reads the menu and clicks "Online", the server is warm. For always-warm, use Koyeb or Deno Deploy.
- **Risk:** Static file serving adds complexity. **Mitigation:** It's one line with any server framework (`app.use(express.static('dist'))` or equivalent).
