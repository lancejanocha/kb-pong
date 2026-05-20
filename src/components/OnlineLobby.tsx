import { useState, useRef } from 'react';
import { NetworkManager } from '../game/systems/NetworkManager';
import type { PlayerRole } from '../game/types/network';

interface OnlineLobbyProps {
  onMatchStart: (networkManager: NetworkManager, role: PlayerRole) => void;
  onBack: () => void;
}

type LobbyPhase = 'choice' | 'join-input' | 'connecting' | 'waiting' | 'countdown' | 'error';

function OnlineLobby({ onMatchStart, onBack }: OnlineLobbyProps): React.JSX.Element {
  const [phase, setPhase] = useState<LobbyPhase>('choice');
  const [roomCode, setRoomCode] = useState('');
  const [codeInput, setCodeInput] = useState('');
  const [errorMsg, setErrorMsg] = useState('');
  const [countdown, setCountdown] = useState(3);
  const nmRef = useRef<NetworkManager | null>(null);

  // No cleanup on unmount — when match starts, GameView owns the NetworkManager.
  // Cancel/back buttons call disconnect() explicitly.

  const startCountdown = (nm: NetworkManager, role: PlayerRole): void => {
    let count = 3;
    setCountdown(count);
    setPhase('countdown');
    const interval = setInterval(() => {
      count--;
      setCountdown(count);
      if (count <= 0) {
        clearInterval(interval);
        onMatchStart(nm, role);
      }
    }, 1000);
  };

  const handleCreate = async (): Promise<void> => {
    setPhase('connecting');
    const nm = new NetworkManager();
    nmRef.current = nm;
    nm.onPeerJoined(() => startCountdown(nm, 'host'));
    nm.onError((msg) => { setErrorMsg(msg); setPhase('error'); });

    try {
      const code = await nm.createRoom();
      setRoomCode(code);
      setPhase('waiting');
    } catch (e) {
      setErrorMsg((e as Error).message);
      setPhase('error');
    }
  };

  const handleJoin = async (): Promise<void> => {
    if (!codeInput.trim()) return;
    setPhase('connecting');
    const nm = new NetworkManager();
    nmRef.current = nm;
    nm.onError((msg) => { setErrorMsg(msg); setPhase('error'); });

    try {
      await nm.joinRoom(codeInput.trim());
      startCountdown(nm, 'guest');
    } catch (e) {
      setErrorMsg((e as Error).message);
      setPhase('error');
    }
  };

  const handleCancel = (): void => {
    nmRef.current?.disconnect();
    onBack();
  };

  if (phase === 'countdown') {
    return (
      <div className="lobby-container">
        <h1 className="screen-title">{countdown}</h1>
        <p className="lobby-subtitle">Match starting...</p>
      </div>
    );
  }

  if (phase === 'waiting') {
    return (
      <div className="lobby-container">
        <h2 className="screen-title">Room Code</h2>
        <p className="room-code">{roomCode}</p>
        <p className="lobby-subtitle">Waiting for opponent...</p>
        <button className="mode-card" onClick={handleCancel}>Cancel</button>
      </div>
    );
  }

  if (phase === 'connecting') {
    return (
      <div className="lobby-container">
        <p className="lobby-subtitle">Connecting...</p>
      </div>
    );
  }

  if (phase === 'error') {
    return (
      <div className="lobby-container">
        <p className="lobby-error">{errorMsg}</p>
        <button className="mode-card" onClick={() => setPhase('choice')}>Try Again</button>
        <button className="mode-card" onClick={onBack}>Back</button>
      </div>
    );
  }

  if (phase === 'join-input') {
    return (
      <div className="lobby-container">
        <h1 className="screen-title">Join Room</h1>
        <div className="join-form">
          <input
            className="code-input"
            type="text"
            maxLength={4}
            placeholder="CODE"
            value={codeInput}
            onChange={(e) => setCodeInput(e.target.value.toUpperCase())}
            onKeyDown={(e) => { if (e.key === 'Enter') handleJoin(); }}
            autoFocus
            aria-label="Room code"
          />
          <button className="mode-card" onClick={handleJoin}>Join</button>
        </div>
        <button className="mode-card" onClick={() => setPhase('choice')} style={{ marginTop: '1rem' }}>Back</button>
      </div>
    );
  }

  // Choice screen
  return (
    <div className="lobby-container">
      <h1 className="screen-title">Pong: Online</h1>
      <div className="mode-grid">
        <button className="mode-card" onClick={handleCreate}>Create Room</button>
        <button className="mode-card" onClick={() => setPhase('join-input')}>Join Room</button>
      </div>
      <button className="mode-card" onClick={onBack} style={{ marginTop: '1rem' }}>Back</button>
    </div>
  );
}

export default OnlineLobby;
