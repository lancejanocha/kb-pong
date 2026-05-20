# ADR-001: Host-Authoritative Model with Dumb Relay

## Status

Accepted

## Context

Networked multiplayer for Pong requires synchronizing game state between two players. The key architectural decision is where game logic runs and how state is shared. Options range from a fully authoritative server (server runs physics) to peer-to-peer (both clients run physics and reconcile).

For a workshop demo, the solution must be simple to implement, cheap to host, and good enough for Pong's low-complexity physics.

## Options Considered

### Option A: Server-Authoritative (server runs physics)

The relay server runs the Phaser game loop, both clients are render-only.

- **Pro:** No cheating possible, both players have identical experience.
- **Con:** Server needs Phaser/physics runtime — expensive, complex deployment, can't use free static hosting for the server.
- **Con:** Doubles input latency for both players (input → server → render).
- **Rejected:** Overkill for a 2-player Pong workshop demo. Server complexity explodes.

### Option B: Peer-to-Peer (WebRTC DataChannel)

Both clients connect directly after signaling. One is authoritative.

- **Pro:** Lowest possible latency once connected.
- **Con:** NAT traversal failures require TURN server fallback (additional infrastructure).
- **Con:** Connection setup is significantly more complex (ICE, SDP exchange).
- **Con:** Harder to debug in a workshop setting.
- **Rejected:** Connection reliability issues make this a poor workshop experience.

### Option C: Host-Authoritative with Dumb Relay (chosen)

One client (Host) runs full physics. A minimal WebSocket server forwards messages between Host and Guest without understanding them.

- **Pro:** Relay server is trivial (~100 lines), stateless regarding game logic, cheap to host.
- **Pro:** Host experiences zero additional input latency.
- **Pro:** Reuses existing PongScene code with minimal modification.
- **Pro:** Easy to reason about — one source of truth.
- **Con:** Guest experiences one round-trip of input lag.
- **Con:** Host has a slight advantage (no input lag on their paddle).

## Decision

Use **Option C: Host-Authoritative with Dumb Relay**.

The Guest's input lag (~30–80ms on typical connections) is acceptable for Pong. The simplicity of the relay server (no game logic, no physics, just message forwarding) means it can be deployed on any free-tier platform and maintained with minimal effort.

## Consequences

### Positive

- Relay server is under 150 lines, deployable anywhere with WebSocket support.
- No game logic duplication — PongScene remains the single source of truth.
- Free-tier hosting is viable (Render, Deno Deploy, Koyeb).
- Workshop participants can understand the full system in one session.

### Negative

- Guest has ~30–80ms input lag (acceptable for Pong, would be problematic for faster games).
- Host has a structural advantage — mitigated by the social context (friends playing together).
- If Host has a slow connection, both players suffer (Host's upload = Guest's experience).

### Risks and Mitigations

- **Risk:** Host on slow upload degrades Guest experience. **Mitigation:** Display latency indicator; suggest switching roles if latency is high.
- **Risk:** Host could theoretically cheat by modifying their client. **Mitigation:** Acceptable for a workshop/social game. Not a competitive esports title.
