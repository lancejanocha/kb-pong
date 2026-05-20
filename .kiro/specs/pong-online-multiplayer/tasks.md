# Implementation Plan — pong-online-multiplayer

## Prerequisites

- Pong gameplay (PongScene with working physics, scoring, win detection) must be implemented first.
- This spec builds on the existing EventBridge, SceneLauncher, and store patterns.

---

- [ ] 1. Define network types and message protocol
  - Add `'pong-online'` to `GameMode` union in `src/game/types/modes.ts`
  - Create `src/game/types/network.ts` with `RelayMessage`, `GameSnapshot`, `PaddleInput`, `ConnectionState`, `PlayerRole`
  - Add network-related fields to `AppState` in store (`networkState`, `playerRole`, `roomCode`, `latencyMs`)
  - Add network actions to store (`setNetworkState`, `setRoomCode`, `setPlayerRole`, `setLatency`)
  - _Requirements: 1, 2, 3_

- [ ] 2. Implement the relay server
  - Create `server/` directory at repo root
  - Implement `server/main.ts` — WebSocket server with room management (~100–150 lines)
  - Room creation with unique code generation (4-char uppercase alphanumeric)
  - Room joining by code, peer notification
  - Message forwarding between paired connections (opaque relay)
  - Room cleanup on disconnect and 10-minute inactivity timeout
  - Health endpoint: `GET /health` → 200
  - Rate limiting: 5 rooms/IP/min, 1KB max message, 120 msg/sec cap
  - Add `server/package.json` (or `deno.json`) with start script
  - _Requirements: 5, 6_

- [ ] 3. Implement NetworkManager client system
  - Create `src/game/systems/NetworkManager.ts`
  - WebSocket connection management (connect, reconnect, disconnect)
  - Room creation flow (send `create_room`, receive `room_created` with code)
  - Room joining flow (send `join_room`, receive `room_joined` with role)
  - Message sending: `sendGameState()` for Host, `sendInput()` for Guest
  - Message receiving: callbacks for `onGameState`, `onInput`, `onPeerJoined`, `onPeerLeft`
  - Latency measurement via ping/pong messages
  - Connection state machine: disconnected → connecting → lobby → playing → error
  - Configure relay URL from `import.meta.env.VITE_RELAY_URL`
  - _Requirements: 1, 2, 3, 6_

- [ ] 4. Build Online Lobby UI
  - Create `src/components/OnlineLobby.tsx`
  - Choice screen: "Create Room" / "Join Room" buttons
  - Host waiting state: display join code prominently, "Waiting for opponent..." indicator
  - Guest join state: code input field (case-insensitive), submit, error display
  - Countdown state: 3-2-1 display when both players connected
  - Connection error states with retry
  - Match existing neon arcade visual direction
  - Wire to store actions and NetworkManager
  - _Requirements: 1, 2, 7_

- [ ] 5. Modify PongScene for network modes
  - Extend `SceneLaunchPayload` with optional `network` field (`{ role, networkManager }`)
  - **Host mode**: After physics update, serialize and send `GameSnapshot` via NetworkManager. Listen for guest `PaddleInput` and apply to guest paddle.
  - **Guest mode**: Skip local physics. Apply received `GameSnapshot` positions to ball and paddles. Send local paddle input each frame.
  - Add interpolation/smoothing for Guest rendering (lerp between snapshots)
  - Handle `peer_left` event: pause match, show disconnect overlay
  - Handle match-end broadcast: both clients show win/loss overlay
  - _Requirements: 3, 4_

- [ ] 6. Integrate online mode into app flow
  - Add `Pong: Online` option to `ModeSelectionScreen`
  - Route to `OnlineLobby` when `pong-online` is selected
  - Host configures win score in lobby before creating room
  - Guest receives settings from Host (transmitted in `room_joined` or first game message)
  - Transition to `GameView` with network payload when countdown completes
  - Handle return-to-menu from online match (disconnect + cleanup)
  - _Requirements: 4, 7_

- [ ] 7. Add unified deployment configuration
  - Create `server/main.ts` as a static file server + WebSocket relay on one port
  - Server serves `dist/` for all HTTP GET requests (SPA fallback to `index.html`)
  - Server upgrades `/ws` requests to WebSocket for relay
  - Server responds to `/health` with 200 OK
  - Add `render.yaml` for one-click Render deployment
  - Add `server/README.md` with local dev and deployment instructions
  - Client derives WebSocket URL from `window.location` — no env var needed
  - Update CSP `connect-src` to allow `wss:` to same origin (already covered by `'self'`)
  - _Requirements: 5_

- [ ] 8. Add tests
  - Unit tests for NetworkManager state machine (mock WebSocket)
  - Unit tests for room code generation (uniqueness property via fast-check)
  - Unit tests for message serialization round-trip (fast-check)
  - Integration test: relay server room lifecycle (create → join → forward → destroy)
  - React tests: OnlineLobby renders correct states, code input validation
  - Manual test script: two browser tabs, full match flow
  - _Requirements: 1–7_

- [ ] 9. Review delivery readiness
  - Verify all validation commands pass (`typecheck`, `lint`, `test`, `build`)
  - Verify relay server starts and passes health check locally
  - Manual play-test: create room, join from second tab, play to win score
  - Test disconnection scenarios (close tab mid-match)
  - Test invalid code entry
  - Verify CSP allows WSS connection to relay URL
  - Update `connect-src` in CSP if needed: `connect-src 'self' wss://your-relay.onrender.com`
  - Create spec-local ADRs
  - _Requirements: 1–7_
