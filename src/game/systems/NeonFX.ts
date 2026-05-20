import Phaser from 'phaser';

const GLOW_COLOR = 0x2be3c3;
const GLOW_STRENGTH = 4;
const TRAIL_LENGTH = 8;
const TRAIL_ALPHA_STEP = 0.08;

/**
 * Adds neon glow postFX to a game object (WebGL only, no-op on Canvas).
 */
export function addGlow(obj: Phaser.GameObjects.GameObject, color = GLOW_COLOR, strength = GLOW_STRENGTH): void {
  if ('postFX' in obj && obj.postFX) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (obj.postFX as any).addGlow(color, strength, 0, false);
  }
}

/**
 * Creates a ball trail effect using a graphics object that draws fading circles.
 */
export class BallTrail {
  private positions: { x: number; y: number }[] = [];
  private graphics: Phaser.GameObjects.Graphics;
  private color: number;

  constructor(scene: Phaser.Scene, color = 0xffffff) {
    this.graphics = scene.add.graphics();
    this.graphics.setDepth(-1);
    this.color = color;
  }

  update(x: number, y: number): void {
    this.positions.push({ x, y });
    if (this.positions.length > TRAIL_LENGTH) {
      this.positions.shift();
    }
    this.graphics.clear();
    this.positions.forEach((pos, i) => {
      const alpha = (i + 1) * TRAIL_ALPHA_STEP;
      this.graphics.fillStyle(this.color, alpha);
      this.graphics.fillCircle(pos.x, pos.y, 3 + i * 0.3);
    });
  }

  destroy(): void {
    this.graphics.destroy();
  }
}

/**
 * Emits a burst of particles at a position.
 */
export function emitBurst(scene: Phaser.Scene, x: number, y: number, color = GLOW_COLOR, count = 8): void {
  for (let i = 0; i < count; i++) {
    const angle = (Math.PI * 2 * i) / count;
    const speed = 80 + Math.random() * 60;
    const particle = scene.add.circle(x, y, 3, color, 1);
    scene.tweens.add({
      targets: particle,
      x: x + Math.cos(angle) * speed,
      y: y + Math.sin(angle) * speed,
      alpha: 0,
      scale: 0.2,
      duration: 300 + Math.random() * 200,
      onComplete: () => particle.destroy(),
    });
  }
}

/**
 * Shakes the camera briefly.
 */
export function shakeCamera(scene: Phaser.Scene, intensity = 0.005, duration = 100): void {
  scene.cameras.main.shake(duration, intensity);
}
