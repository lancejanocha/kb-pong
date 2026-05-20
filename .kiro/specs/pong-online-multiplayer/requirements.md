# Requirements Document — pong-online-multiplayer

## Introduction

This spec adds a `Pong: Online` mode where two players on different devices compete in real-time Pong over a WebSocket relay server. One player creates a room and receives a short join code; the other player enters that code to connect. The relay server is a minimal stateless forwarder — all game logic remains client-side with one player acting as the authoritative host.

This builds on the existing Pong gameplay (once implemented) and reuses the same `PongScene`, physics rules, and scoring logic. The only new runtime dependency is a lightweight WebSocket relay server deployed to a free-tier platform.

## Glossary

- **Host**: The player who creates a room and runs authoritative game simulation.
- **Guest**: The player who joins an existing room via a join code.
- **Relay_Server**: A lightweight WebSocket server that forwards messages between Host and Guest without interpreting game state.
- **Room**: A named channel on the Relay_Server identified by a short alphanumeric code.
- **Join_Code**: A 4–6 character uppercase alphanumeric string that identifies a Room.
- **Network_Manager**: Client-side system that manages the WebSocket connection, message serialization, and reconnection.
- **Authority_Model**: The pattern where the Host runs physics and sends state snapshots; the Guest sends only input and renders received state.

## Requirements

### Requirement 1: Room Creation

**User Story:** As a player, I want to create an online Pong room and get a short code, so that I can share it with a friend to play together.

#### Acceptance Criteria

1. WHEN the player selects `Pong: Online` and chooses "Create Room", THE Network_Manager SHALL connect to the Relay_Server and request a new Room.
2. WHEN the Relay_Server creates a Room, THE system SHALL return a Join_Code of 4–6 uppercase alphanumeric characters.
3. THE Join_Code SHALL be displayed prominently to the Host so they can share it verbally or via message.
4. WHILE waiting for a Guest to join, THE system SHALL display a "Waiting for opponent..." state with the Join_Code visible.
5. IF the Host disconnects before a Guest joins, THEN THE Relay_Server SHALL destroy the Room.

### Requirement 2: Room Joining

**User Story:** As a player, I want to enter a code my friend shared, so that I can join their Pong game.

#### Acceptance Criteria

1. WHEN the player selects `Pong: Online` and chooses "Join Room", THE system SHALL present a text input for the Join_Code.
2. WHEN the player submits a valid Join_Code, THE Network_Manager SHALL connect to the Relay_Server and join the corresponding Room.
3. IF the Join_Code does not match any active Room, THEN THE system SHALL display an error message and allow retry.
4. WHEN both players are connected to the same Room, THE system SHALL transition both clients to the match countdown.
5. THE Join_Code input SHALL accept codes case-insensitively.

### Requirement 3: Real-Time Gameplay Sync

**User Story:** As a player, I want smooth real-time gameplay against my remote opponent, so that the match feels responsive and fair.

#### Acceptance Criteria

1. THE Host SHALL run the authoritative PongScene simulation (ball physics, scoring, collision).
2. THE Host SHALL send state snapshots to the Guest at the scene's update rate (target: 60Hz, minimum: 30Hz).
3. THE Guest SHALL send paddle input (position or velocity) to the Host at the scene's update rate.
4. THE Guest SHALL render received state snapshots with interpolation to smooth network jitter.
5. WHILE the match is active, THE round-trip latency between Host and Guest SHALL be displayed to both players.
6. IF latency exceeds 200ms sustained for 3+ seconds, THE system SHALL display a connection quality warning.

### Requirement 4: Match Lifecycle Over Network

**User Story:** As a player, I want the online match to handle scoring, winning, and disconnection gracefully.

#### Acceptance Criteria

1. WHEN a point is scored, THE Host SHALL broadcast the updated score to the Guest via the Relay_Server.
2. WHEN a player reaches the configured win score, THE Host SHALL broadcast a match-end event and both clients SHALL show the win/loss overlay.
3. IF the Guest disconnects mid-match, THE Host SHALL pause the match and display "Opponent disconnected" with options to wait (30s timeout) or return to menu.
4. IF the Host disconnects mid-match, THE Guest SHALL display "Host disconnected" and return to menu.
5. WHEN the match ends, THE Room SHALL be destroyed on the Relay_Server.
6. THE system SHALL NOT allow mid-match setting changes in online mode.

### Requirement 5: Relay Server

**User Story:** As a developer, I want a minimal relay server that forwards messages without game logic, so that it's cheap to host and simple to maintain.

#### Acceptance Criteria

1. THE Relay_Server SHALL accept WebSocket connections and route messages between two clients in the same Room.
2. THE Relay_Server SHALL generate unique Join_Codes and manage Room lifecycle (create, join, destroy).
3. THE Relay_Server SHALL destroy Rooms when both clients disconnect or after 10 minutes of inactivity.
4. THE Relay_Server SHALL NOT parse, validate, or modify game state messages — it forwards opaque payloads.
5. THE Relay_Server SHALL support deployment to Render, Deno Deploy, or any platform with WebSocket support and a free tier.
6. THE Relay_Server SHALL handle at most 50 concurrent Rooms (sufficient for workshop use).
7. THE Relay_Server SHALL respond to HTTP GET `/health` with 200 OK for platform health checks.

### Requirement 6: Security and Abuse Prevention

**User Story:** As a developer, I want basic protections against abuse without overengineering for a workshop demo.

#### Acceptance Criteria

1. THE Relay_Server SHALL rate-limit room creation to 5 rooms per IP per minute.
2. THE Relay_Server SHALL reject messages larger than 1KB.
3. THE Relay_Server SHALL close connections that send more than 120 messages per second.
4. THE system SHALL NOT transmit any personally identifiable information — only game state and input data.
5. THE client SHALL connect to the Relay_Server over WSS (TLS) in production.

### Requirement 7: UI Flow for Online Mode

**User Story:** As a player, I want a clear flow to create or join an online game without confusion.

#### Acceptance Criteria

1. WHEN the player selects `Pong: Online` from the mode menu, THE system SHALL show a screen with two options: "Create Room" and "Join Room".
2. THE "Create Room" flow SHALL allow configuring win score before creating the room (host decides settings).
3. THE "Join Room" flow SHALL NOT show settings — the Guest plays with the Host's configured settings.
4. WHEN both players are connected, THE system SHALL show a 3-second countdown before gameplay starts.
5. THE online lobby screen SHALL match the existing neon arcade visual direction.
