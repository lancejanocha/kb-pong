# ADR-002: Relay Server Runtime

## Status

Accepted

## Context

The relay server needs a runtime that supports WebSocket connections, is simple to write, and deploys as part of the unified single-service. The game client already uses Node.js (npm, Vite, package.json), so the server runtime choice affects developer experience and deployment complexity.

## Options Considered

### Option A: Node.js with `ws` library (chosen)

- **Pro:** Same runtime as the client build — no second toolchain.
- **Pro:** Workshop participants already have Node installed.
- **Pro:** Render deploys Node natively without Docker.
- **Pro:** One `package.json` manages both client and server.
- **Con:** Requires one dependency (`ws`) for WebSocket support.

### Option B: Deno with native WebSocket

- **Pro:** Zero dependencies — WebSocket built into `Deno.serve()`.
- **Pro:** TypeScript-native, no build step for the server.
- **Con:** Second runtime to install — friction for workshop participants.
- **Con:** Render requires Docker for Deno (more config).
- **Con:** Two package management systems in one repo.
- **Rejected:** Adds toolchain complexity for minimal benefit on a ~100-line server.

### Option C: Bun

- **Pro:** Fast, built-in WebSocket.
- **Con:** Less mature deployment story on Render.
- **Con:** Workshop participants may not have it installed.
- **Rejected:** Deployment and familiarity concerns.

## Decision

Use **Node.js** with the `ws` package (exact version pinned). The server is `server/main.js` — plain JavaScript, no build step needed for the server itself.

## Consequences

### Positive

- Zero new tooling — participants already have Node from `npm install`.
- Render deploys with `node server/main.js` — no Docker, no extra config.
- One `package.json` at root manages `ws` as a production dependency.
- Server is ~100 lines of plain JS — readable by anyone.

### Negative

- One production dependency (`ws`) added to `package.json`.
- Server is JS not TS (acceptable for ~100 lines; avoids needing a separate tsconfig/build for server).

### Risks and Mitigations

- **Risk:** `ws` version has vulnerability. **Mitigation:** Pin exact version, run `npm audit`.
