import type {
  ConnectionState,
  PlayerRole,
  RelayMessage,
  GameSnapshot,
  PaddleInput,
} from '../types/network';

type Callback<T> = (data: T) => void;

export class NetworkManager {
  private ws: WebSocket | null = null;
  private _state: ConnectionState = 'disconnected';
  private _role: PlayerRole | null = null;
  private _roomCode: string | null = null;
  private _latencyMs = 0;
  private pingInterval: ReturnType<typeof setInterval> | null = null;
  private lastPingTime = 0;

  private onPeerJoinedCb: Callback<void>[] = [];
  private onPeerLeftCb: Callback<void>[] = [];
  private onGameStateCb: Callback<GameSnapshot>[] = [];
  private onInputCb: Callback<PaddleInput>[] = [];
  private onErrorCb: Callback<string>[] = [];
  private onStateChangeCb: Callback<ConnectionState>[] = [];

  get state(): ConnectionState { return this._state; }
  get role(): PlayerRole | null { return this._role; }
  get roomCode(): string | null { return this._roomCode; }
  get latencyMs(): number { return this._latencyMs; }

  private setState(s: ConnectionState): void {
    this._state = s;
    this.onStateChangeCb.forEach(cb => cb(s));
  }

  private getWsUrl(): string {
    const proto = location.protocol === 'https:' ? 'wss:' : 'ws:';
    return `${proto}//${location.host}/ws`;
  }

  private connect(): Promise<void> {
    return new Promise((resolve, reject) => {
      this.setState('connecting');
      this.ws = new WebSocket(this.getWsUrl());

      this.ws.onopen = () => {
        this.startPing();
        resolve();
      };

      this.ws.onclose = () => {
        this.cleanup();
        if (this._state === 'playing' || this._state === 'lobby') {
          this.onPeerLeftCb.forEach(cb => cb());
        }
        this.setState('disconnected');
      };

      this.ws.onerror = () => {
        this.setState('error');
        reject(new Error('WebSocket connection failed'));
      };

      this.ws.onmessage = (event) => {
        this.handleMessage(event.data as string);
      };
    });
  }

  private handleMessage(raw: string): void {
    let msg: RelayMessage;
    try { msg = JSON.parse(raw); } catch { return; }

    switch (msg.type) {
      case 'room_created':
        this._roomCode = msg.code;
        this._role = 'host';
        this.setState('lobby');
        break;
      case 'room_joined':
        this._role = msg.role;
        this.setState('lobby');
        break;
      case 'peer_joined':
        this.setState('playing');
        this.onPeerJoinedCb.forEach(cb => cb());
        break;
      case 'peer_left':
        this.onPeerLeftCb.forEach(cb => cb());
        break;
      case 'game_state':
        this.onGameStateCb.forEach(cb => cb(msg.snapshot));
        break;
      case 'input':
        this.onInputCb.forEach(cb => cb(msg.input));
        break;
      case 'pong':
        this._latencyMs = Date.now() - msg.t;
        break;
      case 'error':
        this.onErrorCb.forEach(cb => cb(msg.message));
        break;
    }
  }

  async createRoom(): Promise<string> {
    await this.connect();
    this.send({ type: 'create_room' });
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => reject(new Error('Timeout')), 5000);
      const handler = (raw: string): void => {
        let msg: RelayMessage;
        try { msg = JSON.parse(raw); } catch { return; }
        if (msg.type === 'room_created') {
          clearTimeout(timeout);
          this.ws!.removeEventListener('message', wrappedHandler);
          resolve(msg.code);
        } else if (msg.type === 'error') {
          clearTimeout(timeout);
          this.ws!.removeEventListener('message', wrappedHandler);
          reject(new Error(msg.message));
        }
      };
      const wrappedHandler = (e: MessageEvent): void => handler(e.data as string);
      this.ws!.addEventListener('message', wrappedHandler);
    });
  }

  async joinRoom(code: string): Promise<void> {
    await this.connect();
    this.send({ type: 'join_room', code: code.toUpperCase() });
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => reject(new Error('Timeout')), 5000);
      const handler = (raw: string): void => {
        let msg: RelayMessage;
        try { msg = JSON.parse(raw); } catch { return; }
        if (msg.type === 'room_joined') {
          clearTimeout(timeout);
          this._roomCode = code.toUpperCase();
          this.ws!.removeEventListener('message', wrappedHandler);
          resolve();
        } else if (msg.type === 'error') {
          clearTimeout(timeout);
          this.ws!.removeEventListener('message', wrappedHandler);
          reject(new Error(msg.message));
        }
      };
      const wrappedHandler = (e: MessageEvent): void => handler(e.data as string);
      this.ws!.addEventListener('message', wrappedHandler);
    });
  }

  sendGameState(snapshot: GameSnapshot): void {
    this.send({ type: 'game_state', snapshot });
  }

  sendInput(input: PaddleInput): void {
    this.send({ type: 'input', input });
  }

  disconnect(): void {
    if (this.ws) {
      this.ws.close();
    }
    this.cleanup();
    this.setState('disconnected');
  }

  private send(msg: RelayMessage): void {
    if (this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(msg));
    }
  }

  private startPing(): void {
    this.pingInterval = setInterval(() => {
      this.lastPingTime = Date.now();
      this.send({ type: 'ping', t: this.lastPingTime });
    }, 2000);
  }

  private cleanup(): void {
    if (this.pingInterval) {
      clearInterval(this.pingInterval);
      this.pingInterval = null;
    }
    this.ws = null;
    this._role = null;
    this._roomCode = null;
  }

  // Event registration
  onPeerJoined(cb: Callback<void>): void { this.onPeerJoinedCb.push(cb); }
  onPeerLeft(cb: Callback<void>): void { this.onPeerLeftCb.push(cb); }
  onGameState(cb: Callback<GameSnapshot>): void { this.onGameStateCb.push(cb); }
  onInput(cb: Callback<PaddleInput>): void { this.onInputCb.push(cb); }
  onError(cb: Callback<string>): void { this.onErrorCb.push(cb); }
  onStateChange(cb: Callback<ConnectionState>): void { this.onStateChangeCb.push(cb); }

  removeAllListeners(): void {
    this.onPeerJoinedCb = [];
    this.onPeerLeftCb = [];
    this.onGameStateCb = [];
    this.onInputCb = [];
    this.onErrorCb = [];
    this.onStateChangeCb = [];
  }
}
