const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

// static 파일 제공 (index.html, script.js 등)
app.use(express.static(path.join(__dirname, '/')));

// 방 상태 저장
const rooms = {};

// 4자리 랜덤 방 코드 생성
function generateRoomCode() {
    return Math.floor(1000 + Math.random() * 9000).toString();
}

io.on('connection', (socket) => {
    console.log('플레이어 접속:', socket.id);

    // 방 만들기
    socket.on('createRoom', () => {
        const roomCode = generateRoomCode();
        rooms[roomCode] = {
            host: socket.id,
            players: [{ id: socket.id, name: `플레이어 1` }],
            questionCount: 20,
            currentTurnIndex: 0,
            targetWord: "사과", // 임시 정답 (추후 AI API 연동)
            isPlaying: false
        };

        socket.join(roomCode);
        socket.roomCode = roomCode;

        socket.emit('roomCreated', {
            roomCode: roomCode,
            players: rooms[roomCode].players,
            isHost: true
        });
    });

    // 방 입장하기
    socket.on('joinRoom', (roomCode) => {
        const room = rooms[roomCode];
        if (!room) {
            socket.emit('errorMsg', '존재하지 않는 방 번호입니다.');
            return;
        }

        const playerNum = room.players.length + 1;
        room.players.push({ id: socket.id, name: `플레이어 ${playerNum}` });

        socket.join(roomCode);
        socket.roomCode = roomCode;

        // 방 전체에 업데이트 전달
        io.to(roomCode).emit('playerJoined', {
            players: room.players
        });

        socket.emit('roomJoined', {
            roomCode: roomCode,
            players: room.players,
            isHost: false
        });
    });

    // 접속 해제
    socket.on('disconnect', () => {
        const roomCode = socket.roomCode;
        if (roomCode && rooms[roomCode]) {
            rooms[roomCode].players = rooms[roomCode].players.filter(p => p.id !== socket.id);
            if (rooms[roomCode].players.length === 0) {
                delete rooms[roomCode];
            } else {
                io.to(roomCode).emit('playerJoined', { players: rooms[roomCode].players });
            }
        }
    });
});

const PORT = 3000;
server.listen(PORT, () => {
    console.log(`✅ 서버가 실행되었습니다: http://localhost:${PORT}`);
});