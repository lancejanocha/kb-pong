/** Connection state machine */
export type ConnectionState = 'disconnected' | 'connecting' | 'lobby' | 'playing' | 'error';

/** Player role in an online match */
export type PlayerRole = 'host' | 'guest';

/** Compact game state sent from Host to Guest each frame */
export interface GameSnapshot {
  ball: { x: number; y: number };
  paddles: { leftY: number; rightY: number };
  score: { left: number; right: number };
  event?: 'point_scored' | 'match_won' | 'serve';
  timestamp: number;
}

/** Paddle input sent from Guest to Host */
export interface PaddleInput {
  direction: -1 | 0 | 1;
  timestamp: number;
}

/** Messages exchanged over the WebSocket relay */
export type RelayMessage =
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
