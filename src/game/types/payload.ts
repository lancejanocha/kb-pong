import type { MatchSettings } from './settings';
import type { PlayerId } from './modes';
import type { PlayerRole } from './network';
import type { NetworkManager } from '../systems/NetworkManager';

/** Payload passed from React to Phaser when launching a game scene */
export interface SceneLaunchPayload {
  readonly settings: MatchSettings;
  readonly players: readonly PlayerId[];
  readonly network?: {
    readonly role: PlayerRole;
    readonly manager: NetworkManager;
  };
}
