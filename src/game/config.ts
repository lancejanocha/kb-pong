import Phaser from 'phaser';
import PongScene from './scenes/PongScene';
import BreakoutScene from './scenes/BreakoutScene';
import type { SceneLaunchPayload } from './types/payload';

export function createGameConfig(
  payload: SceneLaunchPayload,
): Phaser.Types.Core.GameConfig {
  const scene = payload.settings.mode === 'breakout' ? [BreakoutScene] : [PongScene];
  return {
    type: Phaser.AUTO,
    width: 800,
    height: 600,
    backgroundColor: '#000000',
    physics: {
      default: 'arcade',
      arcade: { debug: false },
    },
    input: {
      keyboard: {
        target: window,
      },
    },
    scene,
  };
}
