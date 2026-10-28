const { loadEnvConfig } = require('@next/env');
loadEnvConfig(process.cwd());

const { createServer: createHttpServer } = require('http');
const { createServer: createHttpsServer } = require('https');
const { parse } = require('url');
const next = require('next');
const { Server: SocketIOServer } = require('socket.io');
const os = require('os');
const selfsigned = require('selfsigned');
const https = require('https');

// Fallback Google STUN servers
const DEFAULT_ICE_SERVERS = [
  { urls: 'stun:stun.l.google.com:19302' },
  { urls: 'stun:stun1.l.google.com:19302' },
  { urls: 'stun:stun2.l.google.com:19302' },
];

let cachedIceServers = null;
let iceServersExpiresAt = 0;

// Fetch secure, time-limited STUN/TURN credentials from Xirsys REST API
async function getXirsysIceServers() {
  const ident = process.env.XIRSYS_IDENT || 'Tony';
  const secret = process.env.XIRSYS_SECRET || 'e4f5f0f6-d2ef-11f1-9a38-0242ac140002';
  const channel = process.env.XIRSYS_CHANNEL || 'channele699b410';
  const gateway = process.env.XIRSYS_GATEWAY || 'https://global.xirsys.net';

  if (!ident || !secret || !channel) {
    console.log('[Xirsys] Credentials not configured. Using Google STUN servers.');
    return DEFAULT_ICE_SERVERS;
  }

  const now = Date.now();
  if (cachedIceServers && now < iceServersExpiresAt) {
    return cachedIceServers;
  }

  try {
    const auth = Buffer.from(`${ident}:${secret}`).toString('base64');
    const url = new URL(`/_turn/${channel}?webrtc=1`, gateway);

    const result = await new Promise((resolve, reject) => {
      const req = https.request(
        {
          hostname: url.hostname,
          port: url.port || 443,
          path: url.pathname + url.search,
          method: 'PUT',
          headers: {
            Authorization: `Basic ${auth}`,
            'Content-Type': 'application/json',
          },
          rejectUnauthorized: false, // Safely handle corporate/proxy inspection
        },
        (res) => {
          let body = '';
          res.on('data', (chunk) => (body += chunk));
          res.on('end', () => {
            try {
              const data = JSON.parse(body);
              if (data.s === 'ok' && data.v && Array.isArray(data.v.iceServers)) {
                resolve(data.v.iceServers);
              } else {
                reject(new Error(data.e || data.s || 'Invalid Xirsys response'));
              }
            } catch (err) {
              reject(err);
            }
          });
        }
      );
      req.on('error', reject);
      req.setTimeout(5000, () => {
        req.destroy();
        reject(new Error('Xirsys API request timed out'));
      });
      req.end();
    });

    console.log(`[Xirsys] Successfully fetched ${result.length} ICE server configuration(s) (STUN + TURN UDP/TCP/TLS)`);
    cachedIceServers = result;
    iceServersExpiresAt = now + 10 * 60 * 1000; // Cache for 10 minutes
    return result;
  } catch (err) {
    console.warn('[Xirsys] Error fetching TURN credentials, falling back to STUN:', err.message);
    return cachedIceServers || DEFAULT_ICE_SERVERS;
  }
}

const dev = process.env.NODE_ENV !== 'production';
const app = next({ dev });
const handle = app.getRequestHandler();

const HTTP_PORT = parseInt(process.env.PORT || '3000', 10);
const HTTPS_PORT = parseInt(process.env.HTTPS_PORT || '3443', 10);

// Discover actual active physical Wi-Fi / Ethernet LAN IP
function getLocalNetworkIp() {
  const interfaces = os.networkInterfaces();

  // First pass: look specifically for Wi-Fi or physical adapters, ignoring virtual/host-only ones
  for (const name of Object.keys(interfaces)) {
    const lowerName = name.toLowerCase();
    if (
      lowerName.includes('virtual') ||
      lowerName.includes('vbox') ||
      lowerName.includes('vmware') ||
      lowerName.includes('host-only') ||
      lowerName.includes('bluetooth') ||
      lowerName.includes('loopback')
    ) {
      continue;
    }

    for (const net of interfaces[name] || []) {
      if (
        net.family === 'IPv4' &&
        !net.internal &&
        !net.address.startsWith('169.254.') &&
        !net.address.startsWith('192.168.56.')
      ) {
        return net.address;
      }
    }
  }

  // Second pass: any valid IPv4 that is not 127.0.0.1, 169.254, or 192.168.56
  for (const name of Object.keys(interfaces)) {
    for (const net of interfaces[name] || []) {
      if (
        net.family === 'IPv4' &&
        !net.internal &&
        !net.address.startsWith('169.254.') &&
        !net.address.startsWith('192.168.56.')
      ) {
        return net.address;
      }
    }
  }

  return 'localhost';
}

const localIp = getLocalNetworkIp();

app.prepare().then(async () => {
  const requestListener = async (req, res) => {
    const parsedUrl = parse(req.url, true);
    if (parsedUrl.pathname === '/api/ice-servers') {
      const iceServers = await getXirsysIceServers();
      res.writeHead(200, {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, OPTIONS',
      });
      res.end(JSON.stringify({ iceServers }));
      return;
    }
    handle(req, res, parsedUrl);
  };

  // 1. HTTP Server (Primary for PC localhost)
  const httpServer = createHttpServer(requestListener);

  // 2. HTTPS Server (Dedicated with SAN for Mobile Phones on LAN)
  let httpsServer = null;
  try {
    console.log(`[Security] Generating 2048-bit TLS certificate with SAN for ${localIp} & localhost...`);
    const attrs = [{ name: 'commonName', value: localIp }];
    const altNames = [
      { type: 2, value: 'localhost' },
      { type: 7, ip: '127.0.0.1' },
    ];
    if (localIp !== 'localhost') {
      altNames.push({ type: 7, ip: localIp });
    }

    const pems = await selfsigned.generate(attrs, {
      days: 365,
      keySize: 2048,
      algorithm: 'sha256',
      extensions: [
        {
          name: 'subjectAltName',
          altNames,
        },
      ],
    });

    httpsServer = createHttpsServer({ key: pems.private, cert: pems.cert }, requestListener);
  } catch (err) {
    console.warn('[Security] Failed to generate HTTPS certificate:', err);
  }

  // 3. Shared Socket.IO instance attached to BOTH HTTP and HTTPS servers
  const io = new SocketIOServer({
    cors: {
      origin: '*',
      methods: ['GET', 'POST'],
    },
    maxHttpBufferSize: 1e8, // 100MB
  });

  io.attach(httpServer);
  if (httpsServer) {
    io.attach(httpsServer);
  }

  // Ephemeral Room State Tracking
  const rooms = new Map();

  io.on('connection', (socket) => {
    let currentRoom = null;
    let currentUser = null;

    socket.on('join-room', async ({ roomId, role, participantId, name }) => {
      currentRoom = roomId;
      currentUser = {
        id: participantId,
        socketId: socket.id,
        name: name || (role === 'junior-dentist' ? 'Junior Clinician' : role === 'senior-doctor' ? 'Senior Specialist' : 'Mobile Companion'),
        role,
        joinedAt: Date.now(),
      };

      if (!rooms.has(roomId)) {
        rooms.set(roomId, {
          participants: new Map(),
          seniorDoctorCount: 0,
        });
      }

      const roomData = rooms.get(roomId);

      // P2P Mesh Uplink Protection: Cap at 1 Senior Doctor in pure P2P mode
      const hasLiveKit = Boolean(process.env.LIVEKIT_URL && process.env.LIVEKIT_API_KEY);
      if (role === 'senior-doctor' && !hasLiveKit && roomData.seniorDoctorCount >= 1) {
        socket.emit('room-warning', {
          type: 'P2P_SENIOR_DOCTOR_LIMIT',
          message: 'P2P mode is currently capped at 1 Senior Doctor to prevent rural PC upload exhaustion. Enable LiveKit SFU in .env for multi-mentor calls.',
        });
      }

      if (role === 'senior-doctor') {
        roomData.seniorDoctorCount += 1;
      }

      socket.join(roomId);
      roomData.participants.set(socket.id, currentUser);

      // Return current participants, detected network info, and Xirsys STUN/TURN servers to joining client
      const existingParticipants = Array.from(roomData.participants.values()).filter(p => p.socketId !== socket.id);
      const iceServers = await getXirsysIceServers();
      socket.emit('room-state', {
        participants: existingParticipants,
        localIp,
        httpPort: HTTP_PORT,
        httpsPort: HTTPS_PORT,
        iceServers,
        isLiveKitAvailable: hasLiveKit,
      });

      // Notify others in room
      socket.to(roomId).emit('peer-joined', currentUser);
      console.log(`[Room ${roomId}] ${currentUser.name} (${currentUser.role}) joined via socket ${socket.id}`);
    });

    // WebRTC Signaling routing
    socket.on('signal', ({ targetPeerId, signal, streamType }) => {
      io.to(targetPeerId).emit('signal', {
        senderPeerId: socket.id,
        senderRole: currentUser?.role || 'senior-doctor',
        signal,
        streamType,
      });
    });

    // WebRTC Track Metadata routing (deterministic intraoral vs webcam identification)
    socket.on('track-metadata', ({ targetPeerId, tracks }) => {
      io.to(targetPeerId).emit('track-metadata', {
        senderPeerId: socket.id,
        senderRole: currentUser?.role || 'senior-doctor',
        tracks,
      });
    });

    // Telestration
    socket.on('telestration-stroke', (data) => {
      if (currentRoom) socket.to(currentRoom).emit('telestration-stroke', data);
    });

    socket.on('telestration-clear', (data) => {
      if (currentRoom) socket.to(currentRoom).emit('telestration-clear', data);
    });

    // Remote High-Res Snapshot Request
    socket.on('request-hardware-snapshot', (data) => {
      if (currentRoom) {
        console.log(`[Snapshot Request] Forwarding hardware snapshot request from ${socket.id} to clinic PC`);
        socket.to(currentRoom).emit('request-hardware-snapshot', {
          requestedBy: currentUser,
          feedType: data.feedType || 'intraoral',
        });
      }
    });

    socket.on('snapshot-captured', (payload) => {
      if (currentRoom) {
        console.log(`[Snapshot Broadcast] Distributing raw ${payload.feedType} snapshot (${payload.originalWidth}x${payload.originalHeight}) to room ${currentRoom}`);
        io.to(currentRoom).emit('snapshot-captured', payload);
      }
    });

    socket.on('freeze-annotation-update', (data) => {
      if (currentRoom) socket.to(currentRoom).emit('freeze-annotation-update', data);
    });

    socket.on('low-bandwidth-state', (data) => {
      if (currentRoom) socket.to(currentRoom).emit('low-bandwidth-state', data);
    });

    socket.on('mobile-visibility-change', (data) => {
      if (currentRoom) socket.to(currentRoom).emit('mobile-visibility-change', data);
    });

    socket.on('chat-message', (data) => {
      if (currentRoom) {
        io.to(currentRoom).emit('chat-message', {
          id: `msg-${Date.now()}-${Math.random().toString(36).substr(2, 5)}`,
          senderId: currentUser?.id || socket.id,
          senderName: currentUser?.name || 'Doctor',
          senderRole: currentUser?.role || 'senior-doctor',
          text: data.text,
          timestamp: Date.now(),
        });
      }
    });

    socket.on('disconnect', () => {
      if (currentRoom && rooms.has(currentRoom)) {
        const roomData = rooms.get(currentRoom);
        if (currentUser?.role === 'senior-doctor') {
          roomData.seniorDoctorCount = Math.max(0, roomData.seniorDoctorCount - 1);
        }
        roomData.participants.delete(socket.id);
        socket.to(currentRoom).emit('peer-left', { socketId: socket.id, participantId: currentUser?.id });
        console.log(`[Room ${currentRoom}] ${currentUser?.name || socket.id} disconnected`);

        if (roomData.participants.size === 0) {
          rooms.delete(currentRoom);
        }
      }
    });
  });

  // Start HTTP Server
  httpServer.listen(HTTP_PORT, '0.0.0.0', () => {
    console.log(`\n======================================================`);
    console.log(`  TELEDENTISTRY CLINICAL MENTORSHIP PLATFORM`);
    console.log(`======================================================`);
    console.log(`  PC Access (HTTP):       http://localhost:${HTTP_PORT}`);
    console.log(`  LAN Access (HTTP):      http://${localIp}:${HTTP_PORT}`);

    if (httpsServer) {
      httpsServer.listen(HTTPS_PORT, '0.0.0.0', () => {
        console.log(`  Mobile Phone (HTTPS):   https://${localIp}:${HTTPS_PORT}`);
        console.log(`  (Both ports share the same WebRTC room and signaling)`);
        console.log(`======================================================\n`);
      });
    } else {
      console.log(`======================================================\n`);
    }
  });
});
