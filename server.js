const express = require('express');
const http = require('http');
const path = require('path');
const { Server } = require('socket.io');

const app = express();
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: "*" } });

app.use(express.static(path.join(__dirname)));

app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'MTG html.html'));
});

let gameState = {
    currentPlayer: 0,
    players: {}
};

const voiceRoster = {};

io.on('connection', (socket) => {
    socket.on('join_game', (data) => {
        gameState.players[socket.id] = {
            name: data.name,
            icon: data.icon,
            pos: 0,
            cash: 15000
        };
        io.emit('sync_state', gameState);
    });

    socket.on('request_roll', () => {
        const roll = Math.floor(Math.random() * 6) + 1 + Math.floor(Math.random() * 6) + 1;
        const player = gameState.players[socket.id];
        if (player) {
            player.pos = (player.pos + roll) % 40;
            io.emit('announce_roll', { id: socket.id, roll, newPos: player.pos });
        }
    });

    // ── Voice Chat (server-relay) ─────────────────────────────
    socket.on('voice-join', (meta) => {
        voiceRoster[socket.id] = { ...meta, speaking: false };
        socket.emit('voice-init', { roster: { ...voiceRoster }, myId: socket.id });
        socket.broadcast.emit('voice-user-joined', { id: socket.id, meta: voiceRoster[socket.id] });
    });

    socket.on('voice-leave', () => {
        delete voiceRoster[socket.id];
        io.emit('voice-user-left', socket.id);
    });

    // Relay raw PCM audio chunks to every other connected client
    socket.on('voice-chunk', (buf) => {
        socket.broadcast.emit('voice-chunk', { from: socket.id, buf });
    });

    // Relay chat messages to all other clients
    socket.on('chat-msg', (payload) => {
        socket.broadcast.emit('chat-msg', payload);
    });

    // ── Trade relay ───────────────────────────────────────────
    socket.on('trade-offer', (offer) => {
        socket.broadcast.emit('trade-offer', offer);
    });
    socket.on('trade-response', (payload) => {
        socket.broadcast.emit('trade-response', payload);
    });

    socket.on('voice-speaking', (speaking) => {
        if (voiceRoster[socket.id]) voiceRoster[socket.id].speaking = speaking;
        socket.broadcast.emit('voice-speaking', { id: socket.id, speaking });
    });

    // ─────────────────────────────────────────────────────────
    socket.on('disconnect', () => {
        delete gameState.players[socket.id];
        io.emit('sync_state', gameState);
        if (voiceRoster[socket.id]) {
            delete voiceRoster[socket.id];
            io.emit('voice-user-left', socket.id);
        }
    });
});

const PORT = process.env.PORT || 5000;
server.listen(PORT, '0.0.0.0', () => {
    console.log(`Malik Sahab Tycoon running on port ${PORT}`);
});
