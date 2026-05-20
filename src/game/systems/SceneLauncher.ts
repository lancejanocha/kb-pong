import type { SceneLaunchPayload } from '../types/payload';

let launchPayload: SceneLaunchPayload | null = null;

export function setLaunchPayload(payload: SceneLaunchPayload): void {
  launchPayload = payload;
}

export function getLaunchPayload(): SceneLaunchPayload | null {
  return launchPayload;
}

export function clearLaunchPayload(): void {
  launchPayload = null;
}
