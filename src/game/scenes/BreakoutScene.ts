import Phaser from 'phaser';
import eventBridge from '../systems/EventBridge';
import { generateBrickGrid, type BrickDescriptor } from '../rules/brick-grid';
import { createInitialState, loseLife, breakBrick, getMatchStatus, type BreakoutState } from '../rules/life-rules';
import { getBallSpeed, getBreakoutPaddleWidth, getBrickDensity, computeBounceAngle, ensureMinimumVerticalSpeed } from '../rules/physics-config';
import { addGlow, BallTrail, emitBurst, shakeCamera } from '../systems/NeonFX';
import { PowerupManager } from '../systems/PowerupManager';
import { getLaunchPayload } from '../systems/SceneLauncher';

const PADDLE_HEIGHT = 12;
const PADDLE_Y_OFFSET = 40;
const PADDLE_SPEED = 500;
const BALL_SIZE = 10;
const SERVE_DELAY = 500;
const POINTS_PER_BRICK = 10;

export default class BreakoutScene extends Phaser.Scene {
  private ball!: Phaser.Physics.Arcade.Sprite;
  private paddle!: Phaser.Physics.Arcade.Sprite;
  private bricks!: Phaser.Physics.Arcade.StaticGroup;
  private topWall!: Phaser.Physics.Arcade.Sprite;
  private leftWall!: Phaser.Physics.Arcade.Sprite;
  private rightWall!: Phaser.Physics.Arcade.Sprite;

  private state!: BreakoutState;
  private ballSpeed = 300;
  private ballMaxSpeed = 450;
  private paddleWidth = 100;
  private brickRows = 5;
  private brickCols = 8;
  private startingLives: 1 | 3 | 5 = 3;
  private serving = false;
  private matchOver = false;
  private paused = false;
  private savedBallVelocity = { x: 0, y: 0 };

  private keys: Record<string, boolean> = {};
  private keyDownHandler!: (e: KeyboardEvent) => void;
  private keyUpHandler!: (e: KeyboardEvent) => void;

  private scoreText!: Phaser.GameObjects.Text;
  private livesText!: Phaser.GameObjects.Text;
  private ballTrail!: BallTrail;
  private powerupManager!: PowerupManager;

  constructor() {
    super({ key: 'BreakoutScene' });
  }

  init(): void {
    this.serving = false;
    this.matchOver = false;
    this.paused = false;
    this.keys = {};

    const payload = getLaunchPayload();
    const settings = payload?.settings;
    const { base, max } = getBallSpeed(settings?.ballSpeed ?? 'normal');
    this.ballSpeed = base;
    this.ballMaxSpeed = max;
    this.paddleWidth = getBreakoutPaddleWidth(settings?.paddleSize ?? 'normal');
    if (settings?.mode === 'breakout') {
      const density = getBrickDensity(settings.brickDensity);
      this.brickRows = density.rows;
      this.brickCols = density.cols;
      this.startingLives = settings.startingLives;
    }
  }

  create(): void {
    const { width, height } = this.scale;

    // Textures
    this.createTextures();

    // Walls (top, left, right — bottom is open for ball exit)
    this.topWall = this.physics.add.sprite(width / 2, 2, '__DEFAULT') as Phaser.Physics.Arcade.Sprite;
    this.topWall.setDisplaySize(width, 4).setImmovable(true).setVisible(false);
    this.topWall.body!.setSize(width, 4);

    this.leftWall = this.physics.add.sprite(2, height / 2, '__DEFAULT') as Phaser.Physics.Arcade.Sprite;
    this.leftWall.setDisplaySize(4, height).setImmovable(true).setVisible(false);
    this.leftWall.body!.setSize(4, height);

    this.rightWall = this.physics.add.sprite(width - 2, height / 2, '__DEFAULT') as Phaser.Physics.Arcade.Sprite;
    this.rightWall.setDisplaySize(4, height).setImmovable(true).setVisible(false);
    this.rightWall.body!.setSize(4, height);

    // Paddle
    this.paddle = this.physics.add.sprite(width / 2, height - PADDLE_Y_OFFSET, 'breakout-paddle');
    this.paddle.setImmovable(true);
    this.paddle.setDisplaySize(this.paddleWidth, PADDLE_HEIGHT);
    this.paddle.body!.setSize(this.paddleWidth, PADDLE_HEIGHT);

    // Ball
    this.ball = this.physics.add.sprite(width / 2, height - PADDLE_Y_OFFSET - 20, 'ball');
    this.ball.setCircle(BALL_SIZE / 2);
    this.ball.setBounce(1, 1);
    (this.ball.body as Phaser.Physics.Arcade.Body).setMaxSpeed(this.ballMaxSpeed);

    // Bricks
    this.bricks = this.physics.add.staticGroup();
    const grid = generateBrickGrid({
      rows: this.brickRows,
      columns: this.brickCols,
      playAreaWidth: width,
      playAreaHeight: height * 0.4,
      topOffset: 60,
      padding: 4,
    });
    this.createBricks(grid);

    // Initialize game state
    this.state = createInitialState(grid.length);
    this.state = { ...this.state, lives: this.startingLives };

    // Collisions
    this.physics.add.collider(this.ball, this.topWall, this.onWallBounce, undefined, this);
    this.physics.add.collider(this.ball, this.leftWall, this.onWallBounce, undefined, this);
    this.physics.add.collider(this.ball, this.rightWall, this.onWallBounce, undefined, this);
    this.physics.add.collider(this.ball, this.paddle, () => this.onPaddleHit(), undefined, this);
    this.physics.add.collider(this.ball, this.bricks, (_ball, brick) => {
      this.onBrickHit(brick as Phaser.GameObjects.Rectangle);
    }, undefined, this);

    // HUD
    this.scoreText = this.add.text(10, 10, 'Score: 0', {
      fontSize: '18px', color: '#ffffff', fontFamily: 'monospace',
    });
    this.livesText = this.add.text(width - 10, 10, `Lives: ${this.state.lives}`, {
      fontSize: '18px', color: '#ffffff', fontFamily: 'monospace',
    }).setOrigin(1, 0);

    // Neon effects
    addGlow(this.paddle);
    addGlow(this.ball, 0xffffff, 3);
    this.ballTrail = new BallTrail(this);

    // Powerups
    const payload = getLaunchPayload();
    const powerupsEnabled = payload?.settings.powerupsEnabled ?? false;
    this.powerupManager = new PowerupManager(this, 'breakout', {
      scene: this,
      ball: this.ball,
      paddle: this.paddle,
    }, powerupsEnabled);

    // Input
    this.keyDownHandler = (e: KeyboardEvent): void => {
      this.keys[e.key] = true;
      if (['ArrowLeft', 'ArrowRight', 'a', 'd', 'A', 'D'].includes(e.key)) {
        e.preventDefault();
      }
    };
    this.keyUpHandler = (e: KeyboardEvent): void => {
      this.keys[e.key] = false;
    };
    window.addEventListener('keydown', this.keyDownHandler);
    window.addEventListener('keyup', this.keyUpHandler);

    // EventBridge
    eventBridge.on('match:pause', this.handlePause);
    eventBridge.on('scene:restart', this.handleRestart);

    // First serve
    this.startServe();
  }

  private createTextures(): void {
    if (!this.textures.exists('breakout-paddle')) {
      const g = this.add.graphics();
      g.fillStyle(0xffffff);
      g.fillRect(0, 0, this.paddleWidth, PADDLE_HEIGHT);
      g.generateTexture('breakout-paddle', this.paddleWidth, PADDLE_HEIGHT);
      g.destroy();
    }
    if (!this.textures.exists('ball')) {
      const g = this.add.graphics();
      g.fillStyle(0xffffff);
      g.fillCircle(BALL_SIZE / 2, BALL_SIZE / 2, BALL_SIZE / 2);
      g.generateTexture('ball', BALL_SIZE, BALL_SIZE);
      g.destroy();
    }
  }

  private createBricks(grid: BrickDescriptor[]): void {
    const colors = [0xff4444, 0xff8844, 0xffff44, 0x44ff44, 0x4488ff];
    grid.forEach((desc, i) => {
      const row = Math.floor(i / this.brickCols);
      const color = colors[row % colors.length];
      const brick = this.add.rectangle(
        desc.x + desc.width / 2,
        desc.y + desc.height / 2,
        desc.width - 2,
        desc.height - 2,
        color,
      );
      this.physics.add.existing(brick, true); // static body
      this.bricks.add(brick);
    });
  }

  update(): void {
    if (this.paused || this.matchOver) return;

    const { width } = this.scale;

    // Paddle input
    if (this.keys['ArrowLeft'] || this.keys['a'] || this.keys['A']) {
      this.paddle.setVelocityX(-PADDLE_SPEED);
    } else if (this.keys['ArrowRight'] || this.keys['d'] || this.keys['D']) {
      this.paddle.setVelocityX(PADDLE_SPEED);
    } else {
      this.paddle.setVelocityX(0);
    }

    // Clamp paddle
    const halfW = this.paddleWidth / 2;
    if (this.paddle.x < halfW + 4) {
      this.paddle.x = halfW + 4;
      this.paddle.setVelocityX(0);
    } else if (this.paddle.x > width - halfW - 4) {
      this.paddle.x = width - halfW - 4;
      this.paddle.setVelocityX(0);
    }

    // Ball exit (bottom)
    if (!this.serving && this.ball.y > this.scale.height + BALL_SIZE) {
      this.onBallLost();
    }

    // Ball trail
    this.ballTrail.update(this.ball.x, this.ball.y);

    // Powerups
    this.powerupManager.update();
    this.powerupManager.checkCollection(this.paddle);
  }

  private onWallBounce(): void {
    eventBridge.emit('audio:wall-bounce');
  }

  private onPaddleHit(): void {
    const hitOffset = (this.ball.x - this.paddle.x) / (this.paddleWidth / 2);
    const angle = computeBounceAngle(hitOffset);

    let vx = Math.sin(angle) * this.ballSpeed;
    let vy = -Math.abs(Math.cos(angle) * this.ballSpeed);
    const fixed = ensureMinimumVerticalSpeed(vx, vy);
    vx = fixed.vx;
    vy = fixed.vy;

    this.ball.setVelocity(vx, vy);
    eventBridge.emit('audio:paddle-hit');
  }

  private onBrickHit(brick: Phaser.GameObjects.Rectangle): void {
    const bx = brick.x;
    const by = brick.y;
    const color = brick.fillColor;
    brick.destroy();

    emitBurst(this, bx, by, color, 6);

    this.state = breakBrick(this.state, POINTS_PER_BRICK);
    this.scoreText.setText(`Score: ${this.state.score}`);
    eventBridge.emit('audio:brick-break');

    const status = getMatchStatus(this.state);
    if (status === 'win') {
      this.matchOver = true;
      this.ball.setVelocity(0, 0);
      eventBridge.emit('match:win', { winner: 'solo' });
      eventBridge.emit('audio:win');
    }
  }

  private onBallLost(): void {
    this.ball.setPosition(this.scale.width / 2, this.scale.height - PADDLE_Y_OFFSET - 20);
    this.ball.setVelocity(0, 0);
    this.serving = true;

    this.state = loseLife(this.state);
    this.livesText.setText(`Lives: ${this.state.lives}`);
    eventBridge.emit('audio:life-loss');
    eventBridge.emit('lives:update', { remaining: this.state.lives });
    shakeCamera(this, 0.008, 150);
    this.powerupManager.cleanup();

    const status = getMatchStatus(this.state);
    if (status === 'loss') {
      this.matchOver = true;
      eventBridge.emit('match:loss', { finalScore: this.state.score });
      eventBridge.emit('audio:loss');
      return;
    }

    this.startServe();
  }

  private startServe(): void {
    this.serving = true;
    this.ball.setPosition(this.scale.width / 2, this.scale.height - PADDLE_Y_OFFSET - 20);
    this.ball.setVelocity(0, 0);

    this.time.delayedCall(SERVE_DELAY, () => {
      if (this.matchOver || this.paused) return;
      this.serving = false;
      const angle = (Math.random() - 0.5) * (Math.PI / 3);
      this.ball.setVelocity(
        Math.sin(angle) * this.ballSpeed,
        -Math.abs(Math.cos(angle) * this.ballSpeed),
      );
    });
  }

  private handlePause = (payload: { paused: boolean }): void => {
    if (this.matchOver) return;
    if (payload.paused) {
      this.paused = true;
      this.savedBallVelocity = { x: this.ball.body!.velocity.x, y: this.ball.body!.velocity.y };
      this.ball.setVelocity(0, 0);
      this.paddle.setVelocityX(0);
    } else {
      this.paused = false;
      this.ball.setVelocity(this.savedBallVelocity.x, this.savedBallVelocity.y);
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
    this.powerupManager.destroy();
  }
}
