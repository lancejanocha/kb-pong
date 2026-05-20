import Phaser from 'phaser';
import PlaceholderScene from './scenes/PlaceholderScene';
import type { SceneLaunchPayload } from './types/payload';

export function createGameConfig(
  _payload: SceneLaunchPayload,
): Phaser.Types.Core.GameConfig {
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
    scene: [PlaceholderScene],
  };
}
