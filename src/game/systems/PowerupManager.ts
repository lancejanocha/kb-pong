import Phaser from 'phaser';
import eventBridge from './EventBridge';
import { addGlow } from './NeonFX';

/** Powerup definition */
export interface PowerupDef {
  readonly id: string;
  readonly name: string;
  readonly modes: readonly string[];
  readonly duration: number; // ms, 0 = permanent
  readonly color: number;
  readonly apply: (ctx: PowerupContext) => void;
  readonly remove: (ctx: PowerupContext) => void;
}

/** Context passed to powerup apply/remove functions */
export interface PowerupContext {
  scene: Phaser.Scene;
  ball: Phaser.Physics.Arcade.Sprite;
  paddle: Phaser.Physics.Arcade.Sprite;
  opponentPaddle?: Phaser.Physics.Arcade.Sprite;
}

/** Active effect tracking */
interface ActiveEffect {
  def: PowerupDef;
  expiresAt: number;
}

// --- POWERUP REGISTRY ---

const PADDLE_GROW_SCALE = 1.5;
const PADDLE_SHRINK_SCALE = 0.6;
const SPEED_BOOST = 1.4;
const SPEED_SLOW = 0.7;
const EFFECT_DURATION = 6000;

export const POWERUP_REGISTRY: PowerupDef[] = [
  {
    id: 'paddle-grow',
    name: 'Paddle Grow',
    modes: ['pong-solo', 'pong-versus', 'breakout'],
    duration: EFFECT_DURATION,
    color: 0x44ff44,
    apply: (ctx: PowerupContext): void => { ctx.paddle.setScale(PADDLE_GROW_SCALE, 1); },
    remove: (ctx: PowerupContext): void => { ctx.paddle.setScale(1, 1); },
  },
  {
    id: 'paddle-shrink',
    name: 'Paddle Shrink',
    modes: ['pong-solo', 'pong-versus'],
    duration: EFFECT_DURATION,
    color: 0xff4444,
    apply: (ctx: PowerupContext): void => {
      if (ctx.opponentPaddle) ctx.opponentPaddle.setScale(PADDLE_SHRINK_SCALE, 1);
    },
    remove: (ctx: PowerupContext): void => {
      if (ctx.opponentPaddle) ctx.opponentPaddle.setScale(1, 1);
    },
  },
  {
    id: 'ball-speed-up',
    name: 'Ball Speed Up',
    modes: ['pong-solo', 'pong-versus', 'breakout'],
    duration: EFFECT_DURATION,
    color: 0xff8844,
    apply: (ctx: PowerupContext): void => {
      const body = ctx.ball.body as Phaser.Physics.Arcade.Body;
      body.setVelocity(body.velocity.x * SPEED_BOOST, body.velocity.y * SPEED_BOOST);
    },
    remove: (ctx: PowerupContext): void => {
      const body = ctx.ball.body as Phaser.Physics.Arcade.Body;
      body.setVelocity(body.velocity.x / SPEED_BOOST, body.velocity.y / SPEED_BOOST);
    },
  },
  {
    id: 'ball-slow-down',
    name: 'Ball Slow Down',
    modes: ['pong-solo', 'pong-versus', 'breakout'],
    duration: EFFECT_DURATION,
    color: 0x4488ff,
    apply: (ctx: PowerupContext): void => {
      const body = ctx.ball.body as Phaser.Physics.Arcade.Body;
      body.setVelocity(body.velocity.x * SPEED_SLOW, body.velocity.y * SPEED_SLOW);
    },
    remove: (ctx: PowerupContext): void => {
      const body = ctx.ball.body as Phaser.Physics.Arcade.Body;
      body.setVelocity(body.velocity.x / SPEED_SLOW, body.velocity.y / SPEED_SLOW);
    },
  },
  {
    id: 'wide-paddle',
    name: 'Wide Paddle',
    modes: ['breakout'],
    duration: EFFECT_DURATION,
    color: 0x44ffff,
    apply: (ctx: PowerupContext): void => { ctx.paddle.setScale(1.8, 1); },
    remove: (ctx: PowerupContext): void => { ctx.paddle.setScale(1, 1); },
  },
  {
    id: 'extra-life',
    name: 'Extra Life',
    modes: ['breakout'],
    duration: 0,
    color: 0xff44ff,
    apply: (_ctx: PowerupContext): void => { /* handled by scene */ },
    remove: (_ctx: PowerupContext): void => { /* permanent */ },
  },
];

// --- POWERUP MANAGER ---

const SPAWN_INTERVAL_MIN = 8000;
const SPAWN_INTERVAL_MAX = 15000;
const FALL_SPEED = 120;
const POWERUP_SIZE = 20;

export class PowerupManager {
  private scene: Phaser.Scene;
  private mode: string;
  private ctx: PowerupContext;
  private activeEffects: ActiveEffect[] = [];
  private sprite: Phaser.Physics.Arcade.Sprite | null = null;
  private currentDef: PowerupDef | null = null;
  private spawnTimer: Phaser.Time.TimerEvent | null = null;
  private enabled: boolean;

  constructor(scene: Phaser.Scene, mode: string, ctx: PowerupContext, enabled: boolean) {
    this.scene = scene;
    this.mode = mode;
    this.ctx = ctx;
    this.enabled = enabled;

    if (this.enabled) {
      this.scheduleSpawn();
    }
  }

  private getEligible(): PowerupDef[] {
    return POWERUP_REGISTRY.filter(p => p.modes.includes(this.mode));
  }

  private scheduleSpawn(): void {
    const delay = SPAWN_INTERVAL_MIN + Math.random() * (SPAWN_INTERVAL_MAX - SPAWN_INTERVAL_MIN);
    this.spawnTimer = this.scene.time.delayedCall(delay, () => {
      this.spawn();
      this.scheduleSpawn();
    });
  }

  private spawn(): void {
    if (this.sprite) return; // one at a time
    const eligible = this.getEligible();
    if (eligible.length === 0) return;

    const def = eligible[Math.floor(Math.random() * eligible.length)];
    this.currentDef = def;

    const x = 100 + Math.random() * (this.scene.scale.width - 200);
    const y = 60;

    // Create texture if needed
    const texKey = `powerup-${def.id}`;
    if (!this.scene.textures.exists(texKey)) {
      const g = this.scene.add.graphics();
      g.fillStyle(def.color);
      g.fillRoundedRect(0, 0, POWERUP_SIZE, POWERUP_SIZE, 4);
      g.generateTexture(texKey, POWERUP_SIZE, POWERUP_SIZE);
      g.destroy();
    }

    this.sprite = this.scene.physics.add.sprite(x, y, texKey);
    this.sprite.setVelocityY(FALL_SPEED);
    addGlow(this.sprite, def.color, 6);
  }

  /** Call in scene update — checks collection and expiry */
  update(): void {
    if (!this.enabled) return;

    // Check if powerup fell off screen
    if (this.sprite && this.sprite.y > this.scene.scale.height + POWERUP_SIZE) {
      this.sprite.destroy();
      this.sprite = null;
      this.currentDef = null;
    }

    // Check expiry of active effects
    const now = Date.now();
    this.activeEffects = this.activeEffects.filter(effect => {
      if (effect.def.duration > 0 && now >= effect.expiresAt) {
        effect.def.remove(this.ctx);
        return false;
      }
      return true;
    });
  }

  /** Check collision between powerup sprite and a target (paddle or ball) */
  checkCollection(target: Phaser.Physics.Arcade.Sprite): boolean {
    if (!this.sprite || !this.currentDef) return false;

    const bounds = this.sprite.getBounds();
    const targetBounds = target.getBounds();
    if (!Phaser.Geom.Intersects.RectangleToRectangle(bounds, targetBounds)) return false;

    this.collect(this.currentDef);
    return true;
  }

  private collect(def: PowerupDef): void {
    // Remove sprite
    this.sprite?.destroy();
    this.sprite = null;
    this.currentDef = null;

    // Refresh duration if same effect already active (no stacking)
    const existing = this.activeEffects.find(e => e.def.id === def.id);
    if (existing) {
      existing.expiresAt = Date.now() + def.duration;
      return;
    }

    // Apply effect
    def.apply(this.ctx);
    eventBridge.emit('audio:powerup-pickup');

    if (def.duration > 0) {
      this.activeEffects.push({ def, expiresAt: Date.now() + def.duration });
    }
  }

  /** Remove all active effects — call on point scored, life lost, match end */
  cleanup(): void {
    this.activeEffects.forEach(effect => effect.def.remove(this.ctx));
    this.activeEffects = [];
    this.sprite?.destroy();
    this.sprite = null;
    this.currentDef = null;
  }

  /** Full destroy — call on scene shutdown */
  destroy(): void {
    this.cleanup();
    this.spawnTimer?.destroy();
  }

  /** Returns the current powerup def if 'extra-life' was just collected (for scene to handle) */
  get lastCollectedId(): string | null {
    return this.currentDef?.id ?? null;
  }
}
