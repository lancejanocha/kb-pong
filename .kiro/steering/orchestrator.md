---
inclusion: always
---

# Implementation Orchestrator

This is the execution plan for the full Paddle Arcade implementation. All decisions are resolved. Work proceeds in this exact order. Each phase is independently shippable.

## Resolved Decisions

| Decision | Resolution |
|----------|-----------|
| Implementation order | Pong → AI → Multiplayer → Breakout → Visuals → Powerups → Lifecycle verification |
| Physics approach | MVP (playable) first, full feel (presets, ramping) in polish pass |
| AI difficulty | All three presets from the start — config-only differentiation |
| Multiplayer paddle assignment | Host = left paddle, Guest = right paddle, always |
| Pause in multiplayer | Disabled — Escape does nothing (or shows "Leave Match?" → disconnect) |
| Relay server runtime | Node.js with `ws` package — same stack as client |
| Deployment | Single service on Render free tier — `render.yaml` in repo |
| Breakout | Must-have, implemented after multiplayer |
| Neon visuals | Full spec, implemented after Breakout |
| Powerups | Full spec, implemented after visuals |
| ADO integration | Single pipeline task at the end |

## Execution Phases

### Phase 1: Pong Versus (Foundation Gameplay)

**Goal:** Two local players can play Pong to completion on the same keyboard.

**Tasks:**
1. Create `src/game/scenes/PongScene.ts` with Arcade Physics
2. Add ball and two paddles as physics bodies
3. Implement keyboard input via window listeners (W/S left, ArrowUp/ArrowDown right)
4. Ball-paddle collision with simple angle variation on hit position
5. Ball-wall collision (top/bottom bounce)
6. Ball exit detection (left/right edge) → score point, reset ball to center
7. Serve delay (500ms) with ball visible at center before launch
8. Serve direction alternates toward the player who lost the point
9. Scoreboard HUD on canvas (both scores + "First to N")
10. Wire scene events to EventBridge: `score:update`, `match:win`
11. Wire audio events: `audio:paddle-hit`, `audio:wall-bounce`, `audio:score-point`, `audio:win`
12. Win detection: score >= winScore → emit `match:win`
13. Pause/resume: manual velocity save/restore (no `physics.pause()`), zero all body velocities on pause
14. Update `GameView` to launch `PongScene` instead of `PlaceholderScene`
15. Validate: typecheck, lint, test, build pass

**Lifecycle rules baked in:**
- Never set `body.y` directly on moving bodies
- Reposition ball to center immediately on score
- Window event listeners for keyboard (not Phaser keyboard plugin)
- Single Escape handler in GameView only
- Manual pause (velocity save/restore + paused flag)
- Zero ALL body velocities on pause (including paddles)

**Exit criteria:** Two players can play Pong: Versus to win score, see scoreboard, hear audio, pause/resume/restart/menu all work.

---

### Phase 2: Pong AI (Solo Mode)

**Goal:** Single player vs AI with three difficulty presets.

**Tasks:**
1. Create `src/game/rules/ai-config.ts` with difficulty presets:
   - Easy: low speed cap, high reaction delay, high prediction error
   - Normal: medium speed cap, medium reaction delay, medium prediction error
   - Hard: high speed cap, low reaction delay, low prediction error
2. Create AI controller logic in PongScene (or extracted module)
   - Capped paddle speed (never exceeds preset max)
   - Reaction delay (doesn't respond instantly to ball direction changes)
   - Prediction error (targets slightly wrong Y position)
3. PongScene reads `mode` from payload — if `pong-solo`, left paddle uses AI controller
4. AI difficulty comes from `settings.aiDifficulty` in launch payload
5. Validate: all three difficulties are beatable but progressively harder

**Exit criteria:** Pong: Solo is playable at all three difficulties. Settings selector works. AI doesn't cheat (respects speed caps).

---

### Phase 3: Multiplayer (Stretch Goal — Online Pong)

**Goal:** Two players on different devices play Pong via room code sharing.

**Tasks:**
1. Add `'pong-online'` to `GameMode` union
2. Create `src/game/types/network.ts` (message protocol types)
3. Create `server/main.js` — Node.js server (~100 lines):
   - Serve static files from `dist/`
   - WebSocket upgrade at `/ws`
   - Room management (create → code, join → pair, destroy → cleanup)
   - Opaque message forwarding between paired connections
   - `GET /health` → 200
   - Rate limiting (5 rooms/IP/min, 1KB max message, 120 msg/sec)
   - 10-minute inactivity room timeout
4. Add `ws` as a production dependency (exact version)
5. Create `src/game/systems/NetworkManager.ts`:
   - Connection state machine (disconnected → connecting → lobby → playing)
   - WebSocket URL derived from `window.location` (no env var)
   - Room creation/joining
   - Message send/receive with typed callbacks
   - Ping/pong latency measurement
6. Create `src/components/OnlineLobby.tsx`:
   - Choice screen: "Create Room" / "Join Room"
   - Host: displays 4-char room code, "Waiting for opponent..."
   - Guest: code input (case-insensitive), error display
   - Countdown (3-2-1) when both connected
7. Modify PongScene for network modes:
   - Host mode: runs physics normally, sends `GameSnapshot` each frame, receives guest paddle input
   - Guest mode: skips physics, applies received positions, sends paddle input
   - No pause in online mode (Escape disabled or shows "Leave Match?" → disconnect)
8. Add `Pong: Online` to mode selection screen
9. Wire online flow: mode select → lobby → countdown → GameView with network payload
10. Handle disconnection: Host disconnect → Guest returns to menu; Guest disconnect → Host sees message, returns to menu
11. Create `render.yaml` for single-service deployment
12. Add `server/` start script to `package.json`
13. Validate: two browser tabs can play a full match via WebSocket

**Key constraints:**
- Host = left paddle, Guest = right paddle, always
- No pause in online mode
- Server has zero game logic — forwards bytes only
- Local modes completely unaffected by network code

**Exit criteria:** Create room → share code → join → play Pong online → win/loss → clean disconnect. Deployable to Render with one push.

---

### Phase 4: Breakout (Second Game Mode)

**Goal:** Single-player Breakout with brick grid, lives, and win/loss.

**Tasks:**
1. Create `src/game/scenes/BreakoutScene.ts` with Arcade Physics
2. Bottom paddle with ArrowLeft/ArrowRight and A/D input
3. Ball physics (same as Pong — angle from paddle hit position)
4. Brick grid generated from `generateBrickGrid()` pure rule
5. Ball-brick collision → destroy brick, increment score, emit `audio:brick-break`
6. Ball exit bottom → lose life, emit `audio:life-loss`, `lives:update`
7. All bricks cleared → win, emit `match:win`
8. All lives gone → loss, emit `match:loss`
9. HUD on canvas: score + remaining lives
10. Serve delay on start and after life loss
11. Pause/resume with same manual approach as Pong
12. Wire to GameView — launch BreakoutScene when mode is `breakout`
13. Validate: full Breakout match playable to win and loss

**Exit criteria:** Breakout is playable, bricks break, lives decrement, win/loss overlays trigger correctly.

---

### Phase 5: Neon Visuals (Polish)

**Goal:** Phaser-side visual polish — glow, particles, camera effects.

**Tasks:**
1. Neon glow on paddles and ball (Phaser postFX pipeline or drawn programmatically)
2. Brick colors by row (gradient or distinct per row)
3. Particle burst on: brick break, score point, match win, powerup pickup
4. Subtle camera shake on score/life loss
5. Ball trail effect (short particle trail or afterimage)
6. Ensure 60fps maintained with all effects active
7. Validate: visual feedback reinforces gameplay, no performance regression

**Exit criteria:** Game looks polished and arcade-like. Effects are noticeable but not distracting.

---

### Phase 6: Powerups (Full System)

**Goal:** Mode-aware powerup spawning, collection, effects, duration, and cleanup.

**Tasks:**
1. Create `src/game/systems/PowerupManager.ts` — registry, spawn logic, active effect tracking
2. Powerup spawn: random timer, mode-eligible only, rare frequency
3. Powerup sprite: simple geometric shape with glow, falls/floats in play area
4. Collection: ball or paddle collision with powerup
5. Effect application: modify paddle size, ball speed, add balls, freeze AI, etc.
6. Duration tracking: timed effects expire, refresh on re-collect (no stacking)
7. Cleanup: all effects removed on match end, life loss (Breakout), or point scored (Pong)
8. Pong opponent-targeting: harmful effects hit the other player
9. Wire to powerupsEnabled setting — skip all spawn logic when disabled
10. Audio + visual events for pickup and expiry
11. Validate: powerups spawn, apply, expire, clean up correctly in all modes

**Exit criteria:** Powerups toggle works. When enabled, powerups spawn and affect gameplay correctly per mode. When disabled, no powerups appear.

---

### Phase 7: Full Physics Feel (Polish)

**Goal:** Wire all physics presets and settings to real values.

**Tasks:**
1. Create `src/game/rules/physics-config.ts` with all tunable constants
2. Implement hit-position angle influence (pure function)
3. Implement speed ramping per paddle/brick hit
4. Implement degenerate trajectory prevention (minimum vertical speed)
5. Wire Ball Speed preset (Slow/Normal/Fast) to base and max speed
6. Wire Paddle Size preset (Small/Normal/Large) to paddle height
7. Wire Ball Speed Increase (Off/Gentle/Aggressive) to increment values
8. Wire Breakout Brick Density (Sparse/Normal/Dense) to grid rows/columns
9. Wire Starting Lives (1/3/5) for Breakout
10. Validate: all settings produce noticeably different gameplay feel

**Exit criteria:** Every settings control in the UI produces a real gameplay difference.

---

### Phase 8: Lifecycle Verification & ADO

**Goal:** Verify all transitions, add CI pipeline.

**Tasks:**
1. Verify pause/resume in all local modes (Pong Solo, Versus, Breakout)
2. Verify restart from pause overlay and win/loss overlay in all modes
3. Verify return-to-menu destroys scene cleanly in all modes
4. Verify online mode has no pause, disconnect works cleanly
5. Verify settings locked at match start (no mid-match mutation)
6. Verify rapid Escape press doesn't corrupt state
7. Add `azure-pipelines.yml`: `npm ci && npm run typecheck && npm run lint && npm test && npm run build`
8. Final validation: all commands pass, all modes playable

**Exit criteria:** Every mode's full lifecycle works without bugs. CI pipeline validates on push.

---

## Parallel Work Opportunities

These phases can overlap if working with multiple agents:

- **Phase 4 (Breakout)** can start as soon as Phase 1 (Pong Versus) is done — it doesn't depend on AI or Multiplayer
- **Phase 5 (Visuals)** can start as soon as Phase 4 is done
- **Phase 6 (Powerups)** can start as soon as Phase 4 is done
- **Phase 7 (Physics)** can start as soon as Phase 1 is done

```
Phase 1 (Pong) ──► Phase 2 (AI) ──► Phase 3 (Multiplayer)
      │                                       │
      ├──► Phase 4 (Breakout) ──► Phase 5 (Visuals)
      │                      └──► Phase 6 (Powerups)
      └──► Phase 7 (Physics Feel)
                                              │
                              Phase 8 (Lifecycle + ADO) ◄── all complete
```

## Validation Gate (Every Phase)

Before moving to the next phase:
```bash
npm run typecheck   # Zero errors
npm run lint        # Zero errors/warnings
npm test            # Zero failures
npm run build       # Clean production bundle
```

Manual play-test the implemented feature before proceeding.
