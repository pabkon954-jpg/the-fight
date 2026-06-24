const express = require("express");
const app = express();
const http = require("http").createServer(app);
const io = require("socket.io")(http);

app.use(express.static(__dirname));

// Render용 필수
app.get("/", (req, res) => {
    res.sendFile(__dirname + "/index.html");
});

const rooms = {};

// ================= ROOM CODE =================
function createRoomCode() {
    return Math.floor(1000 + Math.random() * 9000).toString();
}

// ================= SOCKET =================
io.on("connection", (socket) => {

    socket.roomCode = null;

    // ===== CREATE ROOM =====
    socket.on("createRoom", () => {

        let code;
        do {
            code = createRoomCode();
        } while (rooms[code]);

        rooms[code] = {
            players: {},
            hp: {},
            bullets: {}
        };

        socket.join(code);
        socket.roomCode = code;

        rooms[code].players[socket.id] = { x: 100, y: 100 };
        rooms[code].hp[socket.id] = 100;

        socket.emit("roomCreated", code);

        io.to(code).emit("players", rooms[code].players);
        io.to(code).emit("hpUpdate", rooms[code].hp);
    });

    // ===== JOIN ROOM =====
    socket.on("joinRoom", (code) => {

        const room = rooms[code];

        if (!room) {
            socket.emit("roomNotFound");
            return;
        }

        socket.join(code);
        socket.roomCode = code;

        room.players[socket.id] = { x: 100, y: 100 };
        room.hp[socket.id] = 100;

        socket.emit("roomJoined", code);

        io.to(code).emit("players", room.players);
        io.to(code).emit("hpUpdate", room.hp);
    });

    // ===== MOVE =====
    socket.on("move", (data) => {

        const room = rooms[socket.roomCode];
        if (!room) return;
        if (!room.players[socket.id]) return;

        room.players[socket.id] = data;

        io.to(socket.roomCode).emit("players", room.players);
    });

    // ===== SHOOT =====
    socket.on("shoot", (data) => {

        const room = rooms[socket.roomCode];
        if (!room) return;

        const id = socket.id + Date.now();

        room.bullets[id] = {
            owner: socket.id,
            x: data.startX,
            y: data.startY,
            vx: data.vx,
            vy: data.vy
        };

        socket.to(socket.roomCode).emit("shoot", data);
    });

    // ===== DISCONNECT =====
    socket.on("disconnect", () => {

        const code = socket.roomCode;
        const room = rooms[code];

        if (!room) return;

        delete room.players[socket.id];
        delete room.hp[socket.id];

        if (Object.keys(room.players).length === 0) {
            delete rooms[code];
            return;
        }

        io.to(code).emit("players", room.players);
        io.to(code).emit("hpUpdate", room.hp);
    });
});

// ================= GAME LOOP =================
setInterval(() => {

    for (const code in rooms) {

        const room = rooms[code];

        for (const bid in room.bullets) {

            const b = room.bullets[bid];

            b.x += b.vx;
            b.y += b.vy;

            for (const pid in room.players) {

                if (pid === b.owner) continue;

                const p = room.players[pid];

                const dx = (p.x + 25) - b.x;
                const dy = (p.y + 25) - b.y;

                const dist = Math.sqrt(dx * dx + dy * dy);

                if (dist < 20) {

                    room.hp[pid] -= 10;
                    delete room.bullets[bid];

                    if (room.hp[pid] <= 0) {
                        io.to(pid).emit("dead");
                        delete room.players[pid];
                        delete room.hp[pid];
                    }

                    break;
                }
            }
        }

        io.to(code).emit("hpUpdate", room.hp);
    }

}, 50);

// ================= START =================
const PORT = process.env.PORT || 3000;

http.listen(PORT, () => {
    console.log("Server running on " + PORT);
});