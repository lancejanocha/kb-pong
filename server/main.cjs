const http = require('http');
const fs = require('fs');
const path = require('path');
const { WebSocketServer } = require('ws');

const PORT = process.env.PORT || 3000;
const DIST = path.join(__dirname, '..', 'dist');
const MAX_ROOMS = 50;
const ROOM_TIMEOUT_MS = 10 * 60 * 1000; // 10 minutes
const MAX_MSG_SIZE = 2048;
const MAX_MSG_RATE = 300; // per second (60fps game_state + input + pings)

// Room storage
const rooms = new Map();

// Rate limiting: room creation per IP
const ipRoomCreation = new Map();

function generateCode() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // no I/O/0/1 for clarity
  let code;
  do {
    code = '';
    for (let i = 0; i < 4; i++) code += chars[Math.floor(Math.random() * chars.length)];
  } while (rooms.has(code));
  return code;
}

function destroyRoom(code) {
  const room = rooms.get(code);
  if (!room) return;
  clearTimeout(room.timeout);
  rooms.delete(code);
}

function resetRoomTimeout(code) {
  const room = rooms.get(code);
  if (!room) return;
  clearTimeout(room.timeout);
  room.timeout = setTimeout(() => destroyRoom(code), ROOM_TIMEOUT_MS);
}

function canCreateRoom(ip) {
  const now = Date.now();
  const entries = ipRoomCreation.get(ip) || [];
  const recent = entries.filter(t => now - t < 60000);
  ipRoomCreation.set(ip, recent);
  return recent.length < 5;
}

// MIME types for static serving
const MIME = {
  '.html': 'text/html',
  '.js': 'application/javascript',
  '.css': 'text/css',
  '.json': 'application/json',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
};

// HTTP server — serves dist/ and health check
const server = http.createServer((req, res) => {
  if (req.url === '/health') {
    res.writeHead(200, { 'Content-Type': 'text/plain' });
    res.end('ok');
    return;
  }

  // Serve static files from dist/
  let filePath = path.join(DIST, req.url === '/' ? 'index.html' : req.url);
  if (!fs.existsSync(filePath)) {
    filePath = path.join(DIST, 'index.html'); // SPA fallback
  }

  const ext = path.extname(filePath);
  const contentType = MIME[ext] || 'application/octet-stream';

  try {
    const content = fs.readFileSync(filePath);
    res.writeHead(200, { 'Content-Type': contentType });
    res.end(content);
  } catch {
    res.writeHead(404);
    res.end('Not found');
  }
});

// WebSocket server
const wss = new WebSocketServer({ server, path: '/ws', maxPayload: MAX_MSG_SIZE });

wss.on('connection', (ws, req) => {
  const ip = req.headers['x-forwarded-for']?.split(',')[0]?.trim() || req.socket.remoteAddress;
  let roomCode = null;
  let role = null;
  let msgCount = 0;
  let msgResetTime = Date.now();

  ws.on('message', (data) => {
    // Rate limiting
    const now = Date.now();
    if (now - msgResetTime > 1000) {
      msgCount = 0;
      msgResetTime = now;
    }
    msgCount++;
    if (msgCount > MAX_MSG_RATE) {
      ws.close(1008, 'Rate limit exceeded');
      return;
    }

    let msg;
    try { msg = JSON.parse(data); } catch { return; }

    if (msg.type === 'create_room') {
      if (!canCreateRoom(ip)) {
        ws.send(JSON.stringify({ type: 'error', message: 'Rate limit: too many rooms' }));
        return;
      }
      if (rooms.size >= MAX_ROOMS) {
        ws.send(JSON.stringify({ type: 'error', message: 'Server full' }));
        return;
      }
      const code = generateCode();
      rooms.set(code, { host: ws, guest: null, timeout: null });
      resetRoomTimeout(code);
      roomCode = code;
      role = 'host';
      ipRoomCreation.set(ip, [...(ipRoomCreation.get(ip) || []), Date.now()]);
      ws.send(JSON.stringify({ type: 'room_created', code }));
    } else if (msg.type === 'join_room') {
      const code = (msg.code || '').toUpperCase();
      const room = rooms.get(code);
      if (!room) {
        ws.send(JSON.stringify({ type: 'error', message: 'Room not found' }));
        return;
      }
      if (room.guest) {
        ws.send(JSON.stringify({ type: 'error', message: 'Room is full' }));
        return;
      }
      room.guest = ws;
      roomCode = code;
      role = 'guest';
      resetRoomTimeout(code);
      ws.send(JSON.stringify({ type: 'room_joined', role: 'guest' }));
      room.host.send(JSON.stringify({ type: 'peer_joined' }));
    } else if (msg.type === 'game_state' || msg.type === 'input' || msg.type === 'ping' || msg.type === 'pong') {
      // Forward to peer
      if (!roomCode) return;
      const room = rooms.get(roomCode);
      if (!room) return;
      resetRoomTimeout(roomCode);
      const peer = role === 'host' ? room.guest : room.host;
      if (peer && peer.readyState === 1) {
        peer.send(data.toString());
      }
    }
  });

  ws.on('close', () => {
    if (!roomCode) return;
    const room = rooms.get(roomCode);
    if (!room) return;

    // Notify peer
    const peer = role === 'host' ? room.guest : room.host;
    if (peer && peer.readyState === 1) {
      peer.send(JSON.stringify({ type: 'peer_left' }));
    }

    // Clean up
    if (role === 'host') {
      destroyRoom(roomCode);
    } else {
      room.guest = null;
    }
  });
});

server.listen(PORT, () => {
  console.log(`Paddle Arcade server running on port ${PORT}`);
});
