import Phaser from 'phaser';
import eventBridge from '../systems/EventBridge';
import { getLaunchPayload } from '../systems/SceneLauncher';
import { awardPoint, type PongScores } from '../rules/scoring';
import { getAIConfig, type AIConfig } from '../rules/ai-config';
import { getBallSpeed, getPongPaddleHeight, getSpeedIncrement, computeBounceAngle, ensureMinimumVerticalSpeed, type BallSpeedPreset, type PaddleSizePreset, type SpeedIncreasePreset } from '../rules/physics-config';
import { addGlow, BallTrail, emitBurst, shakeCamera } from '../systems/NeonFX';
import { PowerupManager } from '../systems/PowerupManager';
import type { SceneLaunchPayload } from '../types/payload';
import type { NetworkManager } from '../systems/NetworkManager';
import type { PlayerRole, GameSnapshot, PaddleInput } from '../types/network';

const PADDLE_WIDTH = 12;
const PADDLE_OFFSET = 30;
const PADDLE_SPEED = 400;
const BALL_SIZE = 10;
const SERVE_DELAY = 500;

export default class PongScene extends Phaser.Scene {
  private ball!: Phaser.Physics.Arcade.Sprite;
  private leftPaddle!: Phaser.Physics.Arcade.Sprite;
  private rightPaddle!: Phaser.Physics.Arcade.Sprite;
  private topWall!: Phaser.Physics.Arcade.Sprite;
  private bottomWall!: Phaser.Physics.Arcade.Sprite;

  private scores: PongScores = { left: 0, right: 0 };
  private winScore = 7;
  private ballSpeed = 300;
  private ballMaxSpeed = 450;
  private paddleHeight = 80;
  private speedIncrement = 8;
  private currentBallSpeed = 300;
  private nextServeDirection: 'left' | 'right' = 'left';
  private serving = false;
  private matchOver = false;
  private paused = false;
  private savedBallVelocity = { x: 0, y: 0 };

  private keys: Record<string, boolean> = {};
  private keyDownHandler!: (e: KeyboardEvent) => void;
  private keyUpHandler!: (e: KeyboardEvent) => void;

  private scoreText!: Phaser.GameObjects.Text;

  private payload: SceneLaunchPayload | null = null;

  // AI state
  private isAIMode = false;
  private aiConfig: AIConfig | null = null;
  private aiTargetY = 0;
  private aiLastReactionTime = 0;
  private aiErrorOffset = 0;

  // Network state
  private networkRole: PlayerRole | null = null;
  private networkManager: NetworkManager | null = null;
  private guestInput: PaddleInput | null = null;
  private ballTrail: BallTrail | null = null;
  private powerupManager: PowerupManager | null = null;

  constructor() {
    super({ key: 'PongScene' });
  }

  init(): void {
    this.payload = getLaunchPayload();
    if (this.payload && this.payload.settings.mode !== 'breakout') {
      this.winScore = this.payload.settings.winScore;
    }

    // Physics config from settings
    const settings = this.payload?.settings;
    const ballPreset: BallSpeedPreset = settings?.ballSpeed ?? 'normal';
    const paddlePreset: PaddleSizePreset = settings?.paddleSize ?? 'normal';
    const speedPreset: SpeedIncreasePreset = (settings && 'speedIncrease' in settings) ? settings.speedIncrease : 'gentle';
    const { base, max } = getBallSpeed(ballPreset);
    this.ballSpeed = base;
    this.ballMaxSpeed = max;
    this.currentBallSpeed = base;
    this.paddleHeight = getPongPaddleHeight(paddlePreset);
    this.speedIncrement = getSpeedIncrement(speedPreset);
    this.scores = { left: 0, right: 0 };
    this.nextServeDirection = 'left';
    this.serving = false;
    this.matchOver = false;
    this.paused = false;
    this.keys = {};

    // AI setup
    this.isAIMode = this.payload?.settings.mode === 'pong-solo';
    if (this.isAIMode && this.payload?.settings.mode === 'pong-solo') {
      this.aiConfig = getAIConfig(this.payload.settings.aiDifficulty);
    } else {
      this.aiConfig = null;
    }
    this.aiTargetY = 0;
    this.aiLastReactionTime = 0;
    this.aiErrorOffset = 0;

    // Network setup
    this.networkRole = this.payload?.network?.role ?? null;
    this.networkManager = this.payload?.network?.manager ?? null;
    this.guestInput = null;

    if (this.networkManager && this.networkRole === 'host') {
      this.networkManager.onInput((input: PaddleInput) => {
        this.guestInput = input;
      });
    }
    if (this.networkManager && this.networkRole === 'guest') {
      this.networkManager.onGameState((snapshot: GameSnapshot) => {
        this.applySnapshot(snapshot);
      });
    }
  }

  create(): void {
    const { width, height } = this.scale;

    // Walls (top/bottom)
    this.topWall = this.physics.add.sprite(width / 2, 2, '__DEFAULT') as Phaser.Physics.Arcade.Sprite;
    this.topWall.setDisplaySize(width, 4).setImmovable(true).setVisible(false);
    this.topWall.body!.setSize(width, 4);

    this.bottomWall = this.physics.add.sprite(width / 2, height - 2, '__DEFAULT') as Phaser.Physics.Arcade.Sprite;
    this.bottomWall.setDisplaySize(width, 4).setImmovable(true).setVisible(false);
    this.bottomWall.body!.setSize(width, 4);

    // Create textures programmatically
    this.createTextures();

    // Paddles
    this.leftPaddle = this.physics.add.sprite(PADDLE_OFFSET, height / 2, 'paddle');
    this.leftPaddle.setImmovable(true);
    this.leftPaddle.setDisplaySize(PADDLE_WIDTH, this.paddleHeight);
    this.leftPaddle.body!.setSize(PADDLE_WIDTH, this.paddleHeight);

    this.rightPaddle = this.physics.add.sprite(width - PADDLE_OFFSET, height / 2, 'paddle');
    this.rightPaddle.setImmovable(true);
    this.rightPaddle.setDisplaySize(PADDLE_WIDTH, this.paddleHeight);
    this.rightPaddle.body!.setSize(PADDLE_WIDTH, this.paddleHeight);

    // Ball
    this.ball = this.physics.add.sprite(width / 2, height / 2, 'ball');
    this.ball.setCircle(BALL_SIZE / 2);
    if (this.networkRole !== 'guest') {
      this.ball.setBounce(1, 1);
      (this.ball.body as Phaser.Physics.Arcade.Body).setMaxSpeed(this.ballMaxSpeed);
    }

    // Collisions (host/local only — guest renders received positions)
    if (this.networkRole !== 'guest') {
      this.physics.add.collider(this.ball, this.topWall, this.onWallBounce, undefined, this);
      this.physics.add.collider(this.ball, this.bottomWall, this.onWallBounce, undefined, this);
      this.physics.add.collider(this.ball, this.leftPaddle, this.onPaddleHitLeft, undefined, this);
      this.physics.add.collider(this.ball, this.rightPaddle, this.onPaddleHitRight, undefined, this);
    }
    // Guest: no colliders. applySnapshot sets positions directly via onGameState callback.

    // HUD
    this.scoreText = this.add.text(width / 2, 30, '0 - 0', {
      fontSize: '32px',
      color: '#ffffff',
      fontFamily: 'monospace',
    }).setOrigin(0.5);

    this.add.text(width / 2, 58, `First to ${this.winScore}`, {
      fontSize: '14px',
      color: '#888888',
      fontFamily: 'monospace',
    }).setOrigin(0.5);

    // Center line
    for (let y = 10; y < height; y += 20) {
      this.add.rectangle(width / 2, y, 2, 10, 0x333333);
    }

    // Neon effects
    addGlow(this.leftPaddle);
    addGlow(this.rightPaddle);
    addGlow(this.ball, 0xffffff, 3);
    this.ballTrail = new BallTrail(this);

    // Powerups
    const mode = this.payload?.settings.mode ?? 'pong-versus';
    const powerupsEnabled = this.payload?.settings.powerupsEnabled ?? false;
    this.powerupManager = new PowerupManager(this, mode, {
      scene: this,
      ball: this.ball,
      paddle: this.rightPaddle,
      opponentPaddle: this.leftPaddle,
    }, powerupsEnabled && this.networkRole !== 'guest');

    // Input
    this.keyDownHandler = (e: KeyboardEvent): void => {
      this.keys[e.key] = true;
      if (['w', 's', 'W', 'S', 'ArrowUp', 'ArrowDown'].includes(e.key)) {
        e.preventDefault();
      }
    };
    this.keyUpHandler = (e: KeyboardEvent): void => {
      this.keys[e.key] = false;
    };
    window.addEventListener('keydown', this.keyDownHandler);
    window.addEventListener('keyup', this.keyUpHandler);

    // EventBridge listeners
    eventBridge.on('match:pause', this.handlePause);
    eventBridge.on('scene:restart', this.handleRestart);

    // Start first serve (host/local only — guest receives state)
    if (this.networkRole !== 'guest') {
      this.startServe();
    }
  }

  private createTextures(): void {
    if (!this.textures.exists('paddle')) {
      const pg = this.add.graphics();
      pg.fillStyle(0xffffff);
      pg.fillRect(0, 0, PADDLE_WIDTH, this.paddleHeight);
      pg.generateTexture('paddle', PADDLE_WIDTH, this.paddleHeight);
      pg.destroy();
    }
    if (!this.textures.exists('ball')) {
      const bg = this.add.graphics();
      bg.fillStyle(0xffffff);
      bg.fillCircle(BALL_SIZE / 2, BALL_SIZE / 2, BALL_SIZE / 2);
      bg.generateTexture('ball', BALL_SIZE, BALL_SIZE);
      bg.destroy();
    }
  }

  update(): void {
    if (this.paused || this.matchOver) return;

    // Guest mode: skip physics, send input, render received state
    if (this.networkRole === 'guest') {
      this.sendGuestInput();
      return;
    }

    const { height } = this.scale;

    // Left paddle: AI or human input
    if (this.isAIMode && this.aiConfig) {
      this.updateAI();
    } else if (this.networkRole !== 'host') {
      // Local left paddle (W/S) — only in non-network modes
      if (this.keys['w'] || this.keys['W']) {
        this.leftPaddle.setVelocityY(-PADDLE_SPEED);
      } else if (this.keys['s'] || this.keys['S']) {
        this.leftPaddle.setVelocityY(PADDLE_SPEED);
      } else {
        this.leftPaddle.setVelocityY(0);
      }
    } else {
      // Host controls left paddle with W/S
      if (this.keys['w'] || this.keys['W']) {
        this.leftPaddle.setVelocityY(-PADDLE_SPEED);
      } else if (this.keys['s'] || this.keys['S']) {
        this.leftPaddle.setVelocityY(PADDLE_SPEED);
      } else {
        this.leftPaddle.setVelocityY(0);
      }
    }

    // Right paddle: network guest input or local ArrowUp/ArrowDown
    if (this.networkRole === 'host' && this.guestInput) {
      this.rightPaddle.setVelocityY(this.guestInput.direction * PADDLE_SPEED);
    } else {
      if (this.keys['ArrowUp']) {
        this.rightPaddle.setVelocityY(-PADDLE_SPEED);
      } else if (this.keys['ArrowDown']) {
        this.rightPaddle.setVelocityY(PADDLE_SPEED);
      } else {
        this.rightPaddle.setVelocityY(0);
      }
    }

    // Clamp paddles to bounds
    this.clampPaddle(this.leftPaddle, height);
    this.clampPaddle(this.rightPaddle, height);

    // Ball exit detection
    if (!this.serving) {
      const ballX = this.ball.x;
      if (ballX < 0) {
        this.onBallExit('left');
      } else if (ballX > this.scale.width) {
        this.onBallExit('right');
      }
    }

    // Powerups
    if (this.powerupManager) {
      this.powerupManager.update();
      this.powerupManager.checkCollection(this.leftPaddle);
      this.powerupManager.checkCollection(this.rightPaddle);
    }

    // Ball trail
    this.ballTrail?.update(this.ball.x, this.ball.y);

    // Host sends state snapshot
    if (this.networkRole === 'host' && this.networkManager) {
      this.networkManager.sendGameState({
        ball: { x: this.ball.x, y: this.ball.y },
        paddles: { leftY: this.leftPaddle.y, rightY: this.rightPaddle.y },
        score: { left: this.scores.left, right: this.scores.right },
        timestamp: Date.now(),
      });
    }
  }

  private applySnapshot(snapshot: GameSnapshot): void {
    // Guest: set positions directly (no physics)
    this.ball.x = snapshot.ball.x;
    this.ball.y = snapshot.ball.y;
    this.leftPaddle.y = snapshot.paddles.leftY;
    this.rightPaddle.y = snapshot.paddles.rightY;

    // Update score if changed
    if (snapshot.score.left !== this.scores.left || snapshot.score.right !== this.scores.right) {
      this.scores = { left: snapshot.score.left, right: snapshot.score.right };
      this.scoreText.setText(`${this.scores.left} - ${this.scores.right}`);
      eventBridge.emit('score:update', { left: this.scores.left, right: this.scores.right });

      // Check win on guest side
      if (this.scores.left >= this.winScore || this.scores.right >= this.winScore) {
        this.matchOver = true;
        const winner = this.scores.left >= this.winScore ? 'left' : 'right';
        eventBridge.emit('match:win', { winner });
        eventBridge.emit('audio:win');
      }
    }
  }

  private sendGuestInput(): void {
    if (this.networkRole !== 'guest' || !this.networkManager) return;
    let direction: -1 | 0 | 1 = 0;
    if (this.keys['ArrowUp']) direction = -1;
    else if (this.keys['ArrowDown']) direction = 1;
    this.networkManager.sendInput({ direction, timestamp: Date.now() });
  }

  private updateAI(): void {
    const config = this.aiConfig!;
    const now = this.time.now;

    // Only update target after reaction delay
    if (now - this.aiLastReactionTime > config.reactionDelay) {
      this.aiLastReactionTime = now;
      this.aiTargetY = this.ball.y;
      // Apply prediction error (random offset)
      this.aiErrorOffset = (Math.random() - 0.5) * 2 * config.predictionError;
    }

    const targetY = this.aiTargetY + this.aiErrorOffset;
    const diff = targetY - this.leftPaddle.y;
    const deadZone = 5;

    if (Math.abs(diff) < deadZone) {
      this.leftPaddle.setVelocityY(0);
    } else if (diff > 0) {
      this.leftPaddle.setVelocityY(Math.min(config.maxSpeed, PADDLE_SPEED));
    } else {
      this.leftPaddle.setVelocityY(-Math.min(config.maxSpeed, PADDLE_SPEED));
    }
  }

  private clampPaddle(paddle: Phaser.Physics.Arcade.Sprite, height: number): void {
    const halfH = this.paddleHeight / 2;
    if (paddle.y < halfH + 4) {
      paddle.y = halfH + 4;
      paddle.setVelocityY(0);
    } else if (paddle.y > height - halfH - 4) {
      paddle.y = height - halfH - 4;
      paddle.setVelocityY(0);
    }
  }

  private onWallBounce(): void {
    eventBridge.emit('audio:wall-bounce');
  }

  private onPaddleHitLeft(): void {
    this.deflectBall(this.leftPaddle, 1);
  }

  private onPaddleHitRight(): void {
    this.deflectBall(this.rightPaddle, -1);
  }

  private deflectBall(paddle: Phaser.Physics.Arcade.Sprite, direction: number): void {
    const b = this.ball;

    // Speed ramping
    this.currentBallSpeed = Math.min(this.currentBallSpeed + this.speedIncrement, this.ballMaxSpeed);

    // Calculate hit offset (-1 to 1)
    const hitOffset = (b.y - paddle.y) / (this.paddleHeight / 2);
    const angle = computeBounceAngle(hitOffset);
    const speed = this.currentBallSpeed;

    let vx = Math.cos(angle) * speed * direction;
    let vy = Math.sin(angle) * speed;

    // Prevent degenerate horizontal trajectories
    const fixed = ensureMinimumVerticalSpeed(vx, vy);
    vx = fixed.vx;
    vy = fixed.vy;

    b.setVelocity(vx, vy);
    eventBridge.emit('audio:paddle-hit');
  }

  private onBallExit(edge: 'left' | 'right'): void {
    if (this.matchOver || this.serving) return;

    // Immediately reposition ball to center
    this.ball.setPosition(this.scale.width / 2, this.scale.height / 2);
    this.ball.setVelocity(0, 0);
    this.serving = true;

    // Score
    const result = awardPoint(this.scores, edge);
    this.scores = result.scores;
    this.nextServeDirection = result.nextServeDirection;

    // Update HUD
    this.scoreText.setText(`${this.scores.left} - ${this.scores.right}`);

    // Emit events
    eventBridge.emit('score:update', { left: this.scores.left, right: this.scores.right });
    eventBridge.emit('audio:score-point');
    emitBurst(this, this.scale.width / 2, this.scale.height / 2);
    shakeCamera(this);
    this.powerupManager?.cleanup();

    // Check win
    if (this.scores.left >= this.winScore) {
      this.matchOver = true;
      eventBridge.emit('match:win', { winner: 'left' });
      eventBridge.emit('audio:win');
      return;
    }
    if (this.scores.right >= this.winScore) {
      this.matchOver = true;
      eventBridge.emit('match:win', { winner: 'right' });
      eventBridge.emit('audio:win');
      return;
    }

    // Next serve
    this.startServe();
  }

  private startServe(): void {
    this.serving = true;
    this.currentBallSpeed = this.ballSpeed; // Reset speed on serve
    this.ball.setPosition(this.scale.width / 2, this.scale.height / 2);
    this.ball.setVelocity(0, 0);

    this.time.delayedCall(SERVE_DELAY, () => {
      if (this.matchOver || this.paused) return;
      this.serving = false;

      const direction = this.nextServeDirection === 'right' ? 1 : -1;
      const angle = (Math.random() - 0.5) * (Math.PI / 4);
      this.ball.setVelocity(
        Math.cos(angle) * this.ballSpeed * direction,
        Math.sin(angle) * this.ballSpeed,
      );
    });
  }

  private handlePause = (payload: { paused: boolean }): void => {
    if (this.matchOver) return;
    // No pause in online mode
    if (this.networkRole) return;

    if (payload.paused) {
      this.paused = true;
      this.savedBallVelocity = {
        x: this.ball.body!.velocity.x,
        y: this.ball.body!.velocity.y,
      };
      this.ball.setVelocity(0, 0);
      this.leftPaddle.setVelocityY(0);
      this.rightPaddle.setVelocityY(0);
    } else {
      this.paused = false;
      this.ball.setVelocity(this.savedBallVelocity.x, this.savedBallVelocity.y);
      // If ball was stationary (paused during serve), trigger new serve
      if (this.savedBallVelocity.x === 0 && this.savedBallVelocity.y === 0 && !this.serving) {
        this.startServe();
      }
    }
  };

  private handleRestart = (): void => {
    this.scene.restart();
  };

  shutdown(): void {
    window.removeEventListener('keydown', this.keyDownHandler);
    window.removeEventListener('keyup', this.keyUpHandler);
    eventBridge.off('match:pause', this.handlePause);
    eventBridge.off('scene:restart', this.handleRestart);
    this.powerupManager?.destroy();
  }
}
