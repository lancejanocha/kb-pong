import Phaser from 'phaser';
import eventBridge from '../systems/EventBridge';
import { getLaunchPayload } from '../systems/SceneLauncher';

/**
 * Minimal scene that proves Phaser boots and communicates
 * through the EventBridge. Will be replaced by real scenes.
 */
export default class PlaceholderScene extends Phaser.Scene {
  constructor() {
    super({ key: 'PlaceholderScene' });
  }

  create(): void {
    const payload = getLaunchPayload();
    const mode = payload?.settings.mode ?? 'pong-solo';
    const title = mode === 'breakout'
      ? 'Breakout'
      : mode === 'pong-versus'
        ? 'Pong Versus'
        : 'Pong Solo';
    const details = mode === 'breakout'
      ? 'Scene boot is wired.\nBreakout mechanics can be implemented here.'
      : 'Scene boot is wired.\nPaddle-ball mechanics can be implemented here.';

    this.cameras.main.setBackgroundColor('#05070d');
    this.add.rectangle(400, 300, 800, 600, 0x05070d);
    this.add.rectangle(400, 300, 620, 360, 0x0d1320, 0.95)
      .setStrokeStyle(2, 0x2be3c3, 0.45);
    this.add.text(400, 214, title, {
      color: '#ffffff',
      fontFamily: 'Arial',
      fontSize: '42px',
      fontStyle: 'bold',
    }).setOrigin(0.5);
    this.add.text(400, 286, 'Implementation Scaffold', {
      color: '#2be3c3',
      fontFamily: 'Arial',
      fontSize: '20px',
      fontStyle: 'bold',
      letterSpacing: 2,
    }).setOrigin(0.5);
    this.add.text(400, 346, details, {
      align: 'center',
      color: '#9fb3c8',
      fontFamily: 'Arial',
      fontSize: '20px',
    }).setOrigin(0.5);
    this.add.text(400, 434, 'Next step: replace this scene with gameplay objects, input, and rules.', {
      align: 'center',
      color: '#6d7f94',
      fontFamily: 'Arial',
      fontSize: '16px',
    }).setOrigin(0.5);
    eventBridge.emit('placeholder:ping', { timestamp: Date.now() });
  }
}
