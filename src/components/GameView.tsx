import { useEffect } from 'react';
import PhaserContainer from './PhaserContainer';
import PauseOverlay from './PauseOverlay';
import WinLossOverlay from './WinLossOverlay';
import eventBridge from '../game/systems/EventBridge';
import { useAppStore } from '../app/store';
import { createGameConfig } from '../game/config';
import { setLaunchPayload } from '../game/systems/SceneLauncher';
import type { PlayerId } from '../game/types/modes';
import type { MatchSettings } from '../game/types/settings';
import type { SceneLaunchPayload } from '../game/types/payload';
import type { NetworkManager } from '../game/systems/NetworkManager';
import type { PlayerRole } from '../game/types/network';

interface GameViewProps {
  networkInfo?: { manager: NetworkManager; role: PlayerRole } | null;
}

function buildMatchSettings(): MatchSettings {
  const state = useAppStore.getState();
  const base = {
    powerupsEnabled: state.powerupsEnabled,
    ballSpeed: state.ballSpeed,
    paddleSize: state.paddleSize,
  } as const;

  switch (state.selectedMode) {
    case 'pong-solo':
      return { ...base, mode: 'pong-solo', winScore: state.winScore, aiDifficulty: state.aiDifficulty, speedIncrease: state.speedIncrease };
    case 'pong-versus':
      return { ...base, mode: 'pong-versus', winScore: state.winScore, speedIncrease: state.speedIncrease };
    case 'pong-online':
      return { ...base, mode: 'pong-online', winScore: state.winScore, speedIncrease: state.speedIncrease };
    case 'breakout':
      return { ...base, mode: 'breakout', startingLives: state.startingLives, brickDensity: state.brickDensity };
    default:
      return { ...base, mode: 'pong-solo', winScore: state.winScore, aiDifficulty: state.aiDifficulty, speedIncrease: state.speedIncrease };
  }
}

function buildSceneLaunchPayload(networkInfo?: GameViewProps['networkInfo']): SceneLaunchPayload {
  const settings = buildMatchSettings();

  const base: SceneLaunchPayload = (() => {
    if (settings.mode === 'pong-versus' || settings.mode === 'pong-online') {
      return { settings, players: ['left', 'right'] as const };
    }
    if (settings.mode === 'breakout') {
      return { settings, players: ['solo'] as const };
    }
    return { settings, players: ['left', 'right'] as const };
  })();

  if (networkInfo) {
    return { ...base, network: { role: networkInfo.role, manager: networkInfo.manager } };
  }
  return base;
}

function GameView({ networkInfo }: GameViewProps): React.JSX.Element {
  const launchPayload = buildSceneLaunchPayload(networkInfo);
  // Set payload synchronously BEFORE Phaser game is created (per architecture steering)
  setLaunchPayload(launchPayload);
  const gameConfig = createGameConfig(launchPayload);

  useEffect(() => {
    const handleScoreUpdate = (payload: { left: number; right: number }): void => {
      useAppStore.getState().updateScores(payload.left, payload.right);
    };

    const handleMatchWin = (payload: { winner: PlayerId }): void => {
      useAppStore.getState().openWinLossOverlay(payload.winner, null);
    };

    const handleMatchLoss = (payload: { finalScore: number }): void => {
      useAppStore.getState().openWinLossOverlay(null, payload.finalScore);
    };

    const handleLivesUpdate = (payload: { remaining: number }): void => {
      useAppStore.getState().updateLives(payload.remaining);
    };

    eventBridge.on('score:update', handleScoreUpdate);
    eventBridge.on('match:win', handleMatchWin);
    eventBridge.on('match:loss', handleMatchLoss);
    eventBridge.on('lives:update', handleLivesUpdate);

    return () => {
      eventBridge.off('score:update', handleScoreUpdate);
      eventBridge.off('match:win', handleMatchWin);
      eventBridge.off('match:loss', handleMatchLoss);
      eventBridge.off('lives:update', handleLivesUpdate);
    };
  }, []);

  useEffect(() => {
    const isOnline = useAppStore.getState().selectedMode === 'pong-online';
    const handleKeyDown = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') {
        if (isOnline) return; // No pause in online mode
        e.preventDefault();
        const state = useAppStore.getState();
        if (!state.pauseOverlayOpen) {
          state.openPauseOverlay();
          eventBridge.emit('match:pause', { paused: true });
        } else {
          state.closePauseOverlay();
          eventBridge.emit('match:pause', { paused: false });
        }
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, []);

  return (
    <>
      <PhaserContainer config={gameConfig} />
      <PauseOverlay />
      <WinLossOverlay />
    </>
  );
}

export default GameView;
