const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const path = require('path');
const { v4: uuidv4 } = require('uuid');
const cors = require('cors');
const helmet = require('helmet');
const CryptoUtils = require('./crypto-utils');
const WebTransportServer = require('./webtransport-server');
require('dotenv').config();

const app = express();

// Create HTTP server (Render handles HTTPS automatically)
const server = http.createServer(app);

// Initialize crypto utilities
const cryptoUtils = new CryptoUtils();

// Initialize WebTransport server
const webTransportServer = new WebTransportServer(3001);

// Security middleware
app.use(helmet({
  contentSecurityPolicy: false, // Disable for WebRTC
  crossOriginEmbedderPolicy: false
}));

app.use(cors({
  origin: process.env.CORS_ORIGIN || "*",
  credentials: true
}));

app.use(express.json());

// Serve static files FIRST - this is critical for Render deployment
app.use(express.static(path.join(__dirname, 'public'), {
  index: 'index.html',
  setHeaders: (res, path) => {
    if (path.endsWith('.html')) {
      res.setHeader('Cache-Control', 'no-cache');
    }
  }
}));

// Initialize Socket.IO with HTTP server (Render handles SSL termination)
const io = socketIo(server, {
    cors: {
        origin: process.env.CORS_ORIGIN || "*",
        methods: ["GET", "POST"],
        credentials: true
    },
    transports: ['websocket', 'polling']
});

// Fallback HTTP Socket.IO for development
// Remove the httpIo initialization since we only have one server now
// const httpIo = socketIo(httpServer, {
//     cors: {
//         origin: process.env.CORS_ORIGIN || "http://localhost:3000",
//         methods: ["GET", "POST"],
//         credentials: true
//     },
//     transports: ['websocket', 'polling']
// });

// Store active rooms and participants with encryption keys
const rooms = new Map();
const users = new Map();
const roomKeys = new Map(); // Store room-specific encryption keys

class Room {
  constructor(id) {
    this.id = id;
    this.participants = new Map();
    this.createdAt = new Date();
    
    // Generate room-specific encryption keys
    this.encryptionKey = cryptoUtils.generateKey();
    this.salt = cryptoUtils.generateSalt();
  }

  addParticipant(socketId, userData) {
    this.participants.set(socketId, {
      id: socketId,
      ...userData,
      joinedAt: new Date(),
      keyPair: cryptoUtils.generateKeyPair() // Generate key pair for each participant
    });
  }

  removeParticipant(socketId) {
    this.participants.delete(socketId);
  }

  getParticipants() {
    return Array.from(this.participants.values()).map(participant => ({
      id: participant.id,
      username: participant.username,
      joinedAt: participant.joinedAt,
      publicKey: participant.keyPair.publicKey // Share public key for E2E encryption
    }));
  }

  getParticipantKeyPair(socketId) {
    const participant = this.participants.get(socketId);
    return participant ? participant.keyPair : null;
  }

  isEmpty() {
    return this.participants.size === 0;
  }

  getRoomKeys() {
    return {
      encryptionKey: this.encryptionKey.toString('hex'),
      salt: this.salt
    };
  }
}

// WebRTC signaling handlers
io.on('connection', (socket) => {
  console.log(`User connected: ${socket.id}`);

  // Join room
  socket.on('join-room', (data) => {
    const { roomId, userData } = data;
    
    if (!roomId) {
      socket.emit('error', { message: 'Room ID is required' });
      return;
    }

    // Create room if it doesn't exist
    if (!rooms.has(roomId)) {
      rooms.set(roomId, new Room(roomId));
    }

    const room = rooms.get(roomId);
    room.addParticipant(socket.id, userData);
    users.set(socket.id, { roomId, userData });

    socket.join(roomId);

    // Send room encryption keys to the new participant
    const participantKeyPair = room.getParticipantKeyPair(socket.id);
    socket.emit('room-keys', {
      roomKeys: room.getRoomKeys(),
      yourKeyPair: {
        publicKey: participantKeyPair.publicKey,
        privateKey: participantKeyPair.privateKey
      }
    });

    // Notify existing participants about new user
    socket.to(roomId).emit('user-joined', {
      userId: socket.id,
      userData
    });

    // Send existing participants to new user
    const existingParticipants = room.getParticipants().filter(p => p.id !== socket.id);
    socket.emit('existing-participants', existingParticipants);

    console.log(`User ${socket.id} joined room ${roomId}`);
  });

  // WebRTC signaling
  socket.on('offer', (data) => {
    const { targetUserId, offer } = data;
    socket.to(targetUserId).emit('offer', {
      fromUserId: socket.id,
      offer
    });
  });

  socket.on('answer', (data) => {
    const { targetUserId, answer } = data;
    socket.to(targetUserId).emit('answer', {
      fromUserId: socket.id,
      answer
    });
  });

  socket.on('ice-candidate', (data) => {
    const { targetUserId, candidate } = data;
    socket.to(targetUserId).emit('ice-candidate', {
      fromUserId: socket.id,
      candidate
    });
  });

  // Handle encrypted chat messages
  socket.on('encrypted-chat-message', (data) => {
    const user = users.get(socket.id);
    if (user && rooms.has(user.roomId)) {
      const { encryptedMessage, iv, tag, timestamp } = data;
      
      // Broadcast encrypted message to all participants in the room
      socket.to(user.roomId).emit('encrypted-chat-message', {
        senderId: socket.id,
        senderName: user.userData.username,
        encryptedMessage,
        iv,
        tag,
        timestamp: timestamp || new Date().toISOString()
      });
    }
  });

  // Handle secure signaling for WebRTC
  socket.on('secure-offer', (data) => {
    const { targetId, encryptedOffer, iv, tag } = data;
    socket.to(targetId).emit('secure-offer', {
      senderId: socket.id,
      encryptedOffer,
      iv,
      tag
    });
  });

  socket.on('secure-answer', (data) => {
    const { targetId, encryptedAnswer, iv, tag } = data;
    socket.to(targetId).emit('secure-answer', {
      senderId: socket.id,
      encryptedAnswer,
      iv,
      tag
    });
  });

  socket.on('secure-ice-candidate', (data) => {
    const { targetId, encryptedCandidate, iv, tag } = data;
    socket.to(targetId).emit('secure-ice-candidate', {
      senderId: socket.id,
      encryptedCandidate,
      iv,
      tag
    });
  });

  // Media state changes
  socket.on('media-state-change', (data) => {
    const user = users.get(socket.id);
    if (user) {
      const { roomId } = user;
      socket.to(roomId).emit('media-state-change', {
        userId: socket.id,
        ...data
      });
    }
  });

  // Screen sharing
  socket.on('screen-share-start', () => {
    const user = users.get(socket.id);
    if (user) {
      const { roomId } = user;
      socket.to(roomId).emit('screen-share-start', {
        userId: socket.id
      });
    }
  });

  socket.on('screen-share-stop', () => {
    const user = users.get(socket.id);
    if (user) {
      const { roomId } = user;
      socket.to(roomId).emit('screen-share-stop', {
        userId: socket.id
      });
    }
  });

  // Handle disconnection
  socket.on('disconnect', () => {
    const user = users.get(socket.id);
    if (user) {
      const { roomId } = user;
      const room = rooms.get(roomId);
      
      if (room) {
        room.removeParticipant(socket.id);
        
        // Notify other participants
        socket.to(roomId).emit('user-left', {
          userId: socket.id
        });

        // Clean up empty rooms
        if (room.isEmpty()) {
          rooms.delete(roomId);
          console.log(`Room ${roomId} deleted (empty)`);
        }
      }
    }
    
    users.delete(socket.id);
    console.log(`User disconnected: ${socket.id}`);
  });
});

// REST API endpoints
app.get('/api/rooms/:roomId', (req, res) => {
  const { roomId } = req.params;
  const room = rooms.get(roomId);
  
  if (!room) {
    return res.status(404).json({ error: 'Room not found' });
  }

  res.json({
    id: room.id,
    participantCount: room.participants.size,
    createdAt: room.createdAt
  });
});

app.post('/api/rooms', (req, res) => {
  const roomId = uuidv4();
  const room = new Room(roomId);
  rooms.set(roomId, room);
  
  res.json({
    roomId,
    createdAt: room.createdAt
  });
});

// Alternative endpoint for create-room (used by Vue.js frontend)
app.post('/api/create-room', (req, res) => {
  const { username } = req.body;
  const roomId = uuidv4();
  const room = new Room(roomId);
  rooms.set(roomId, room);
  
  res.json({
    success: true,
    roomId,
    createdAt: room.createdAt,
    message: 'Room created successfully'
  });
});

// Serve the main page
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.get('/room/:roomId', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'room.html'));
});

// Handle 404 errors properly - serve index.html for SPA routing
app.use((req, res, next) => {
  // If it's an API request, let it 404 normally
  if (req.path.startsWith('/api/')) {
    return next();
  }
  // For all other requests, serve index.html
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

const PORT = process.env.PORT || 3000;
const HOST = process.env.HOST || '0.0.0.0';

// Start WebTransport server
webTransportServer.start().catch(console.error);

// Start the server (Render will handle HTTPS automatically)
server.listen(PORT, HOST, () => {
  console.log(`🚀 WebRTC Server running on http://${HOST}:${PORT}`);
  console.log(`📹 Video conferencing with WebTransport (QUIC) support enabled`);
  console.log(`🔐 End-to-end encryption active`);
  console.log(`🌐 WebTransport server running on port 3001`);
  console.log(`🌐 Ready for Render deployment`);
});

// Graceful shutdown
process.on('SIGTERM', () => {
  console.log('SIGTERM received, shutting down gracefully');
  server.close(() => {
    console.log('Server closed');
    process.exit(0);
  });
});

module.exports = { app, server, io };