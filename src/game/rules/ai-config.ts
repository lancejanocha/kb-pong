import type { AIDifficultyPreset } from '../types/modes';

/** Tunable parameters for AI paddle behavior */
export interface AIConfig {
  /** Maximum paddle speed in pixels/sec — AI never moves faster than this */
  readonly maxSpeed: number;
  /** Delay in ms before AI reacts to ball direction changes */
  readonly reactionDelay: number;
  /** Maximum prediction error in pixels — AI targets slightly wrong Y */
  readonly predictionError: number;
}

const AI_PRESETS: Record<AIDifficultyPreset, AIConfig> = {
  easy: { maxSpeed: 150, reactionDelay: 400, predictionError: 60 },
  normal: { maxSpeed: 250, reactionDelay: 200, predictionError: 30 },
  hard: { maxSpeed: 380, reactionDelay: 80, predictionError: 10 },
};

export function getAIConfig(difficulty: AIDifficultyPreset): AIConfig {
  return AI_PRESETS[difficulty];
}
