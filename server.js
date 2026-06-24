const express = require("express");
const app = express();
const http = require("http").createServer(app);
const io = require("socket.io")(http);

app.use(express.static(__dirname));

const rooms = {};

// ======================
// 방 코드 생성
// ======================
function createRoomCode() {
    return Math.floor(1000 + Math.random() * 9000).toString();
}

// ======================
// 연결
// ======================
io.on("connection", (socket) => {

    socket.roomCode = null;

    // ======================
    // 방 생성
    // ======================
    socket.on("createRoom", () => {

        let roomCode;

        do {
            roomCode = createRoomCode();
        } while (rooms[roomCode]);

        rooms[roomCode] = {
            players: {},
            hp: {},
            bullets: {}
        };

        socket.join(roomCode);
        socket.roomCode = roomCode;

        rooms[roomCode].players[socket.id] = { x: 100, y: 100 };
        rooms[roomCode].hp[socket.id] = 100;

        socket.emit("roomCreated", roomCode);

        io.to(roomCode).emit("players", rooms[roomCode].players);
        io.to(roomCode).emit("hpUpdate", rooms[roomCode].hp);
    });

    // ======================
    // 방 참가
    // ======================
    socket.on("joinRoom", (roomCode) => {

        const room = rooms[roomCode];

        if (!room) {
            socket.emit("roomNotFound");
            return;
        }

        socket.join(roomCode);
        socket.roomCode = roomCode;

        room.players[socket.id] = { x: 100, y: 100 };
        room.hp[socket.id] = 100;

        socket.emit("roomJoined", roomCode);

        io.to(roomCode).emit("players", room.players);
        io.to(roomCode).emit("hpUpdate", room.hp);
    });

    // ======================
    // 이동 (데이터만 저장)
    // ======================
    socket.on("move", (data) => {

        const room = rooms[socket.roomCode];
        if (!room) return;

        room.players[socket.id] = data;
    });

    // ======================
    // 발사
    // ======================
    socket.on("shoot", (data) => {

        const room = rooms[socket.roomCode];
        if (!room) return;

        const bulletId = socket.id + "_" + Date.now();

        room.bullets[bulletId] = {
            owner: socket.id,
            x: data.startX,
            y: data.startY,
            vx: data.vx,
            vy: data.vy
        };

        socket.to(socket.roomCode).emit("shoot", data);
    });

    // ======================
    // disconnect
    // ======================
    socket.on("disconnect", () => {

        const roomCode = socket.roomCode;
        const room = rooms[roomCode];

        if (!room) return;

        delete room.players[socket.id];
        delete room.hp[socket.id];

        if (Object.keys(room.players).length === 0) {
            delete rooms[roomCode];
            return;
        }

        io.to(roomCode).emit("players", room.players);
        io.to(roomCode).emit("hpUpdate", room.hp);
    });

});

// ======================
// 게임 루프 (핵심 동기화)
// ======================
setInterval(() => {

    for (const roomCode in rooms) {

        const room = rooms[roomCode];

        // ======================
        // 총알 이동 + 충돌
        // ======================
        for (const bulletId in room.bullets) {

            const b = room.bullets[bulletId];

            b.x += b.vx;
            b.y += b.vy;

            for (const pid in room.players) {

                if (pid === b.owner) continue;

                const p = room.players[pid];

                const px = p.x + 25;
                const py = p.y + 25;

                const dx = px - b.x;
                const dy = py - b.y;

                const dist = Math.sqrt(dx * dx + dy * dy);

                if (dist < 20) {

                    room.hp[pid] -= 10;
                    delete room.bullets[bulletId];

                    if (room.hp[pid] <= 0) {
                        io.to(pid).emit("dead");
                        delete room.players[pid];
                        delete room.hp[pid];
                    }

                    break;
                }
            }

            // 화면 밖 제거
            if (
                b.x < -200 || b.x > 5000 ||
                b.y < -200 || b.y > 5000
            ) {
                delete room.bullets[bulletId];
            }
        }

        // ======================
        // 🔥 핵심: 여기서만 동기화
        // ======================
        io.to(roomCode).emit("players", room.players);
        io.to(roomCode).emit("hpUpdate", room.hp);
    }

}, 50); // 🔥 20fps (안정 핵심)

// ======================
const PORT = process.env.PORT || 3000;

http.listen(PORT, () => {
    console.log("Server running on port " + PORT);
});