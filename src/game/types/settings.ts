import type { AIDifficultyPreset } from './modes';
import type { BallSpeedPreset, PaddleSizePreset, SpeedIncreasePreset, BrickDensityPreset } from '../rules/physics-config';

/** Base fields shared by all match settings */
interface MatchSettingsBase {
  readonly powerupsEnabled: boolean;
  readonly ballSpeed: BallSpeedPreset;
  readonly paddleSize: PaddleSizePreset;
}

/** Pong Solo requires AI difficulty and win score */
export interface PongSoloSettings extends MatchSettingsBase {
  readonly mode: 'pong-solo';
  readonly winScore: number;
  readonly aiDifficulty: AIDifficultyPreset;
  readonly speedIncrease: SpeedIncreasePreset;
}

/** Pong Versus requires win score only */
export interface PongVersusSettings extends MatchSettingsBase {
  readonly mode: 'pong-versus';
  readonly winScore: number;
  readonly speedIncrease: SpeedIncreasePreset;
}

/** Pong Online requires win score only (host decides) */
export interface PongOnlineSettings extends MatchSettingsBase {
  readonly mode: 'pong-online';
  readonly winScore: number;
  readonly speedIncrease: SpeedIncreasePreset;
}

/** Breakout has lives and brick density */
export interface BreakoutSettings extends MatchSettingsBase {
  readonly mode: 'breakout';
  readonly startingLives: 1 | 3 | 5;
  readonly brickDensity: BrickDensityPreset;
}

/** Discriminated union keyed on `mode` */
export type MatchSettings = PongSoloSettings | PongVersusSettings | PongOnlineSettings | BreakoutSettings;
