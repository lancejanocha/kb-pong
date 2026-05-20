---
inclusion: always
---

# Multiplayer Direction

This project's end state is a deployable online multiplayer Pong game. All implementation work should move toward this goal. The game and relay server deploy as a single service.

## Target Architecture

```
One deployed service:
  HTTP  → serves the built game (dist/)
  WS /ws → relays messages between paired players (rooms)
```

- **No separate client and server deploys.** One process, one port, one URL.
- **No CORS.** WebSocket connects to same origin.
- **No environment variables for the relay URL.** Client derives it from `window.location`.
- **Deploy target:** Render free tier (primary), Deno Deploy or Koyeb (alternatives).

## Implementation Sequence

Work toward multiplayer in this order. Each phase is independently shippable:

### Phase 1: Local Pong Gameplay (current focus)

Implement `PongScene` with working paddles, ball physics, scoring, and win detection. This is the foundation that online mode reuses directly.

- PongScene with arcade physics
- Paddle movement (keyboard input via window listeners)
- Ball physics (angle influence, speed ramping, degenerate trajectory prevention)
- Scoring and win detection
- Serve delay and ball reset
- Scoreboard on canvas
- Pause/resume/restart/menu flows

### Phase 2: Relay Server

A minimal server (~100–150 lines) that:
- Serves static files from `dist/`
- Handles WebSocket upgrades at `/ws`
- Manages rooms (create with code, join by code, destroy on disconnect)
- Forwards opaque messages between paired connections
- Responds to `GET /health` with 200

No game logic in the server. It's a dumb pipe with room management.

### Phase 3: Network Manager (Client)

A client-side system that manages the WebSocket connection:
- Connection state machine (disconnected → connecting → lobby → playing)
- Room creation and joining
- Message serialization/deserialization
- Latency measurement (ping/pong)
- Disconnection detection and cleanup

### Phase 4: Online Mode Integration

Wire the NetworkManager into PongScene:
- **Host mode:** Runs physics normally, sends state snapshots, receives guest input
- **Guest mode:** Skips physics, renders received state, sends paddle input
- Online lobby UI (create/join room, display code, countdown)
- Disconnection handling (pause, timeout, return to menu)

## Authority Model

- **Host-authoritative.** One client runs the real simulation; the other renders received state.
- The relay server never interprets game messages — it forwards bytes.
- Guest experiences one network round-trip of input lag (acceptable for Pong at <100ms).
- Host has zero additional latency on their own paddle.

## Key Design Constraints

1. **PongScene must work identically in local and online modes.** Online mode adds a network layer on top — it doesn't fork the scene.
2. **The server must remain stateless regarding game logic.** It knows about rooms and connections, not about balls or paddles.
3. **One dependency for the relay server.** Node.js `http` module + `ws` package (exact version pinned). Same runtime as the client build.
4. **The client must work without a server in local modes.** NetworkManager is only instantiated for `pong-online`. Local modes (`pong-solo`, `pong-versus`, `breakout`) are unaffected.
5. **All game state flows through the existing EventBridge internally.** NetworkManager bridges the EventBridge to the WebSocket — it doesn't replace it.

## What NOT to Build

- No matchmaking or player accounts. Room codes are the discovery mechanism.
- No spectator mode.
- No more than 2 players per room.
- No server-side game validation or anti-cheat.
- No persistent game history or leaderboards.
- No WebRTC — WebSocket relay is sufficient for Pong's bandwidth needs.
- No Breakout online mode (Pong only for multiplayer).

## Deployment Checklist

When the multiplayer feature is complete, deployment is:

1. `npm run build` (produces `dist/`)
2. Push to GitHub
3. Render auto-deploys: installs deps, builds, starts `server/main.js`
4. Game is live at `https://your-app.onrender.com`
5. Players share room codes to play together

No infrastructure provisioning, no database, no secrets management.
