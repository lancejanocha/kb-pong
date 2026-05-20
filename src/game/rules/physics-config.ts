/** Ball speed presets */
export type BallSpeedPreset = 'slow' | 'normal' | 'fast';

/** Paddle size presets */
export type PaddleSizePreset = 'small' | 'normal' | 'large';

/** Ball speed increase presets */
export type SpeedIncreasePreset = 'off' | 'gentle' | 'aggressive';

/** Brick density presets */
export type BrickDensityPreset = 'sparse' | 'normal' | 'dense';

// --- Ball Speed ---
const BALL_SPEED_MAP: Record<BallSpeedPreset, { base: number; max: number }> = {
  slow: { base: 220, max: 330 },
  normal: { base: 300, max: 450 },
  fast: { base: 400, max: 600 },
};

export function getBallSpeed(preset: BallSpeedPreset): { base: number; max: number } {
  return BALL_SPEED_MAP[preset];
}

// --- Speed Increase per hit ---
const SPEED_INCREMENT_MAP: Record<SpeedIncreasePreset, number> = {
  off: 0,
  gentle: 8,
  aggressive: 20,
};

export function getSpeedIncrement(preset: SpeedIncreasePreset): number {
  return SPEED_INCREMENT_MAP[preset];
}

// --- Paddle Size ---
const PONG_PADDLE_HEIGHT_MAP: Record<PaddleSizePreset, number> = {
  small: 55,
  normal: 80,
  large: 110,
};

const BREAKOUT_PADDLE_WIDTH_MAP: Record<PaddleSizePreset, number> = {
  small: 70,
  normal: 100,
  large: 140,
};

export function getPongPaddleHeight(preset: PaddleSizePreset): number {
  return PONG_PADDLE_HEIGHT_MAP[preset];
}

export function getBreakoutPaddleWidth(preset: PaddleSizePreset): number {
  return BREAKOUT_PADDLE_WIDTH_MAP[preset];
}

// --- Brick Density ---
const BRICK_DENSITY_MAP: Record<BrickDensityPreset, { rows: number; cols: number }> = {
  sparse: { rows: 3, cols: 6 },
  normal: { rows: 5, cols: 8 },
  dense: { rows: 7, cols: 10 },
};

export function getBrickDensity(preset: BrickDensityPreset): { rows: number; cols: number } {
  return BRICK_DENSITY_MAP[preset];
}

// --- Bounce Angle ---
export const MAX_BOUNCE_ANGLE = Math.PI / 3; // 60 degrees

/**
 * Compute bounce angle from paddle hit offset.
 * offset: -1 (top/left edge) to 1 (bottom/right edge)
 */
export function computeBounceAngle(hitOffset: number): number {
  const clamped = Math.max(-1, Math.min(1, hitOffset));
  return clamped * MAX_BOUNCE_ANGLE;
}

// --- Degenerate Trajectory Prevention ---
const MIN_VY_RATIO = 0.15;

/**
 * Ensures ball has minimum vertical speed to prevent boring horizontal loops.
 */
export function ensureMinimumVerticalSpeed(vx: number, vy: number): { vx: number; vy: number } {
  const speed = Math.sqrt(vx * vx + vy * vy);
  if (speed === 0) return { vx, vy };

  const minVy = speed * MIN_VY_RATIO;
  if (Math.abs(vy) < minVy) {
    const sign = vy >= 0 ? 1 : -1;
    const newVy = sign * minVy;
    const newVx = Math.sign(vx) * Math.sqrt(speed * speed - newVy * newVy);
    return { vx: newVx, vy: newVy };
  }
  return { vx, vy };
}
