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

function buildMatchSettings(): MatchSettings {
  const state = useAppStore.getState();

  switch (state.selectedMode) {
    case 'pong-solo':
      return {
        mode: 'pong-solo',
        winScore: state.winScore,
        aiDifficulty: state.aiDifficulty,
        powerupsEnabled: state.powerupsEnabled,
      };
    case 'pong-versus':
      return {
        mode: 'pong-versus',
        winScore: state.winScore,
        powerupsEnabled: state.powerupsEnabled,
      };
    case 'breakout':
      return {
        mode: 'breakout',
        powerupsEnabled: state.powerupsEnabled,
      };
    default:
      return {
        mode: 'pong-solo',
        winScore: state.winScore,
        aiDifficulty: state.aiDifficulty,
        powerupsEnabled: state.powerupsEnabled,
      };
  }
}

function buildSceneLaunchPayload(): SceneLaunchPayload {
  const settings = buildMatchSettings();

  if (settings.mode === 'pong-versus') {
    return { settings, players: ['left', 'right'] };
  }

  if (settings.mode === 'breakout') {
    return { settings, players: ['solo'] };
  }

  return { settings, players: ['left', 'right'] };
}

function GameView(): React.JSX.Element {
  const launchPayload = buildSceneLaunchPayload();
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
    const handleKeyDown = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') {
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

  useEffect(() => {
    setLaunchPayload(launchPayload);
  }, [launchPayload]);

  return (
    <>
      <PhaserContainer config={gameConfig} />
      <PauseOverlay />
      <WinLossOverlay />
    </>
  );
}

export default GameView;
