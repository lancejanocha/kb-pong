# Design Document — pong-online-multiplayer

## Overview

This design adds networked multiplayer to Pong using a host-authoritative model with a dumb WebSocket relay. The Host runs the full PongScene simulation; the Guest sends input and renders state received from the Host. A minimal relay server (deployable to free-tier platforms) handles room management and message forwarding without understanding game state.

### Key Design Decisions

| Decision | Choice | ADR |
|----------|--------|-----|
| Network topology | Host-authoritative with dumb relay | [ADR-001](decisions/ADR-001-host-authoritative-relay.md) |
| Relay server runtime | Deno (portable to Node) | [ADR-002](decisions/ADR-002-relay-server-runtime.md) |
| Deployment platform | Render free tier (primary), Deno Deploy (alternative) | [ADR-003](decisions/ADR-003-deployment-platform.md) |

## Dependencies

- **Previous specs required:** `react-phaser-foundation`, `shared-types-and-rules`, `react-app-shell`, Pong gameplay (must be implemented first)
- **Steering files:** `architecture.md`, `phaser-typescript.md`, `security.md`
- **External:** WebSocket relay server (new, separate deployable)

## Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                        HOST CLIENT                               │
│                                                                  │
│  React App Shell ──► GameView ──► PongScene (authoritative)     │
│       │                              │                           │
│       │                              ▼                           │
│       │                     NetworkManager                       │
│       │                        │        ▲                        │
│       ▼                        │        │                        │
│  Online Lobby UI               │  guest paddle input             │
│  (create/join/code)            ▼                                 │
│                          state snapshots                         │
└────────────────────────────────┼────────────────────────────────┘
                                 │ WSS
                                 ▼
┌─────────────────────────────────────────────────────────────────┐
│                      RELAY SERVER                                 │
│                                                                  │
│  Room Manager ──► rooms: Map<code, [ws1, ws2]>                  │
│  Health endpoint: GET /health → 200                              │
│  No game logic. Forward bytes between paired connections.        │
└────────────────────────────────┼────────────────────────────────┘
                                 │ WSS
                                 ▼
┌─────────────────────────────────────────────────────────────────┐
│                       GUEST CLIENT                                │
│                                                                  │
│  React App Shell ──► GameView ──► PongScene (render-only)       │
│       │                              │                           │
│       │                              ▼                           │
│       │                     NetworkManager                       │
│       │                        │        ▲                        │
│       ▼                        │        │                        │
│  Online Lobby UI               │  state snapshots                │
│  (join code input)             ▼                                 │
│                          paddle input                             │
└─────────────────────────────────────────────────────────────────┘
```

### Authority Model

- **Host** runs `PongScene` normally — full physics, scoring, ball movement, AI-free (both paddles are human-controlled).
- **Host** sends a compact state snapshot every frame: `{ ball: {x,y}, paddles: {left_y, right_y}, score: {l,r}, event?: string }`.
- **Guest** sends only their paddle input: `{ paddle_y: number }` or `{ input: 'up' | 'down' | 'none' }`.
- **Guest** runs `PongScene` in a render-only mode: receives positions, applies them, no local physics.

This avoids all state reconciliation complexity. The tradeoff is that the Guest experiences one network round-trip of input lag, which is acceptable for Pong at typical internet latencies (<100ms).

## Components and Interfaces

### NetworkManager (`src/game/systems/NetworkManager.ts`)

```typescript
export type ConnectionState = 'disconnected' | 'connecting' | 'lobby' | 'playing' | 'error';
export type PlayerRole = 'host' | 'guest';

export interface NetworkManager {
  readonly state: ConnectionState;
  readonly role: PlayerRole | null;
  readonly roomCode: string | null;
  readonly latencyMs: number;

  createRoom(): Promise<string>;        // Returns join code
  joinRoom(code: string): Promise<void>;
  sendGameState(snapshot: GameSnapshot): void;  // Host only
  sendInput(input: PaddleInput): void;          // Guest only
  disconnect(): void;

  onPeerJoined(cb: () => void): void;
  onPeerLeft(cb: () => void): void;
  onGameState(cb: (snapshot: GameSnapshot) => void): void;
  onInput(cb: (input: PaddleInput) => void): void;
  onError(cb: (error: string) => void): void;
}
```

### Message Protocol

```typescript
/** Messages sent over the WebSocket (JSON-serialized) */
type RelayMessage =
  | { type: 'create_room' }
  | { type: 'room_created'; code: string }
  | { type: 'join_room'; code: string }
  | { type: 'room_joined'; role: PlayerRole }
  | { type: 'peer_joined' }
  | { type: 'peer_left' }
  | { type: 'game_state'; snapshot: GameSnapshot }
  | { type: 'input'; input: PaddleInput }
  | { type: 'ping'; t: number }
  | { type: 'pong'; t: number }
  | { type: 'error'; message: string };

interface GameSnapshot {
  ball: { x: number; y: number };
  paddles: { leftY: number; rightY: number };
  score: { left: number; right: number };
  event?: 'point_scored' | 'match_won' | 'serve';
  timestamp: number;
}

interface PaddleInput {
  y?: number;           // Absolute position (if using position-based)
  direction?: -1 | 0 | 1;  // Or direction-based
  timestamp: number;
}
```

### Relay Server (`server/`)

Minimal implementation — under 150 lines:

```typescript
// server/main.ts (Deno-compatible, portable to Node with minor changes)
const rooms = new Map<string, { host: WebSocket; guest: WebSocket | null }>();

function generateCode(): string {
  // 4-char uppercase alphanumeric, collision-checked against active rooms
}

function handleConnection(ws: WebSocket): void {
  // On 'create_room': generate code, store ws as host, send code back
  // On 'join_room': find room by code, store ws as guest, notify host
  // On 'game_state'/'input': forward to the other peer in the room
  // On close: notify peer, destroy room if both gone
}
```

### Online Lobby UI (`src/components/OnlineLobby.tsx`)

New React component with two sub-states:
1. **Choice screen**: "Create Room" / "Join Room" buttons
2. **Host waiting**: Shows join code, "Waiting for opponent..." spinner
3. **Guest joining**: Code input field, submit button, error display
4. **Countdown**: 3-2-1 before match starts (both clients)

### PongScene Modifications

The existing `PongScene` needs a `networkMode` flag in its launch payload:

```typescript
interface SceneLaunchPayload {
  settings: MatchSettings;
  network?: {
    role: PlayerRole;
    networkManager: NetworkManager;
  };
}
```

- **Host mode**: Scene runs normally. In `update()`, after physics, sends snapshot via `networkManager.sendGameState()`. Listens for guest input to control the guest's paddle.
- **Guest mode**: Scene skips physics. In `update()`, applies latest received snapshot positions to ball and paddles. Sends local paddle input via `networkManager.sendInput()`.

## Data Models

### Store Additions

```typescript
// Additions to AppState
interface AppState {
  // ... existing fields ...
  networkState: ConnectionState;
  playerRole: PlayerRole | null;
  roomCode: string | null;
  latencyMs: number;
}
```

### New GameMode

```typescript
export type GameMode = 'pong-solo' | 'pong-versus' | 'pong-online' | 'breakout';
```

## Deployment Architecture

### Unified Single-Service Deployment

The game client and WebSocket relay deploy as **one service**. A single server process:
1. Serves Vite's built static files (`dist/`) for all HTTP requests
2. Handles WebSocket upgrades at `/ws`

```
┌─────────────────────────────────────────────────────────────┐
│  Single Service (Render / Deno Deploy / Railway)            │
│                                                              │
│  ┌─────────────────────────────────────────────────────┐   │
│  │  Server Process (server/main.ts)                     │   │
│  │                                                       │   │
│  │  HTTP GET /*     ──► serve static files from dist/   │   │
│  │  HTTP GET /health ──► 200 OK                         │   │
│  │  WS  /ws         ──► WebSocket relay (rooms)         │   │
│  └─────────────────────────────────────────────────────┘   │
│                                                              │
│  Build: npm run build → dist/                                │
│  Start: node server/main.js                                  │
└─────────────────────────────────────────────────────────────┘
```

**Benefits:**
- One URL, one service, one deploy pipeline — no CORS.
- Client derives WebSocket URL from its own origin (no env var needed).
- Single health check covers both game and relay.
- Simpler mental model for workshop participants.

**Client WebSocket URL derivation (no configuration needed):**
```typescript
const wsUrl = `${location.protocol === 'https:' ? 'wss:' : 'ws:'}//${location.host}/ws`;
```

### Platform Options

| Platform | Free Tier | Cold Start | Deploy Method |
|----------|-----------|------------|---------------|
| **Render** (recommended) | Yes, free | 30s after 15min idle | Auto-deploy from GitHub |
| **Deno Deploy** | 1M req/mo | None (edge) | `deployctl` or GitHub Action |
| **Koyeb** | 1 always-on service | None | Auto-deploy from GitHub |
| **Railway** | $5 trial credit | None | Auto-deploy from GitHub |

### Build and Start

```bash
npm run build           # Vite builds client → dist/
node server/main.js    # Serves dist/ + WebSocket relay on one port
```

### Render Configuration

```yaml
# render.yaml
services:
  - type: web
    name: paddle-arcade
    runtime: node
    buildCommand: npm install && npm run build
    startCommand: node server/main.js
    healthCheckPath: /health
```

## Correctness Properties

**Property 1: Room code uniqueness**
*For any* set of active rooms, no two rooms share the same Join_Code.

**Property 2: Message ordering**
*For any* sequence of messages sent by the Host, the Guest receives them in the same order.

**Property 3: Room cleanup**
*For any* room where both connections close, the room is removed from the server within 1 second.

**Property 4: State convergence**
*For any* game snapshot sent by the Host, the Guest's rendered state matches within one frame of receipt.

## Error Handling and Edge Cases

| Scenario | Behavior |
|----------|----------|
| Server unreachable | Show "Cannot connect to server" with retry button |
| Invalid room code | Show "Room not found" inline error |
| Room full (2 players already) | Show "Room is full" error |
| Host disconnects mid-game | Guest sees "Host disconnected", returns to menu |
| Guest disconnects mid-game | Host sees "Opponent disconnected", 30s reconnect window |
| Network timeout (>5s no messages) | Trigger disconnect flow |
| Server cold start (Render) | Show "Connecting..." spinner during the wait |

## Testing Strategy

### Unit Tests

- `NetworkManager`: Mock WebSocket, test state transitions, message serialization
- Room code generation: uniqueness property (fast-check)
- Message protocol: round-trip serialization (fast-check)
- Relay server: room lifecycle (create, join, forward, destroy)

### Integration Tests

- Two `NetworkManager` instances connected to a local relay server
- Verify message delivery, ordering, and disconnection handling

### Manual Validation

- Create room on one browser tab, join on another
- Verify gameplay sync, scoring, and win condition
- Test disconnection scenarios (close tab, kill network)
- Test cold start flow on Render

### Property-Based Tests

- Room codes are always 4–6 chars, uppercase alphanumeric
- Serialized messages round-trip without data loss
- Room count never exceeds active connections / 2
