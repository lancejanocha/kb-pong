import { useAppStore } from './store';
import './styles.css';
import ModeSelectionScreen from '../components/ModeSelectionScreen';
import SettingsPanel from '../components/SettingsPanel';
import GameView from '../components/GameView';
import AudioControls from '../components/AudioControls';
import OnlineLobby from '../components/OnlineLobby';
import type { NetworkManager } from '../game/systems/NetworkManager';
import type { PlayerRole } from '../game/types/network';

interface NetworkInfo {
  manager: NetworkManager;
  role: PlayerRole;
}

// Module-level storage (same pattern as SceneLauncher) — survives across renders
let activeNetworkInfo: NetworkInfo | null = null;

function App(): React.JSX.Element {
  const phase = useAppStore((s) => s.phase);

  const handleOnlineMatchStart = (manager: NetworkManager, role: PlayerRole): void => {
    activeNetworkInfo = { manager, role };
    useAppStore.getState().startMatch();
  };

  const handleOnlineBack = (): void => {
    activeNetworkInfo = null;
    useAppStore.getState().goToMenu();
  };

  return (
    <div className="app-shell">
      <AudioControls />
      {phase === 'menu' && <ModeSelectionScreen />}
      {phase === 'settings' && <SettingsPanel />}
      {phase === 'online-lobby' && (
        <OnlineLobby onMatchStart={handleOnlineMatchStart} onBack={handleOnlineBack} />
      )}
      {phase === 'playing' && <GameView networkInfo={activeNetworkInfo} />}
    </div>
  );
}

export default App;
