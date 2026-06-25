const express = require("express");
const app = express();
const http = require("http").createServer(app);
const io = require("socket.io")(http);

app.use(express.static(__dirname));

app.get("/", (req, res) => {
    res.sendFile(__dirname + "/index.html");
});

// ⭐ 디버그용 임시 라우트: 서버가 실제로 보고 있는 파일 목록을 확인
app.get("/debug-files", (req, res) => {
    const fs = require("fs");
    try {
        const files = fs.readdirSync(__dirname);
        res.json({
            dirname: __dirname,
            files: files
        });
    } catch (err) {
        res.json({ error: err.message });
    }
});

// ================= CHARACTERS (서버 기준 스탯) =================
const CHARACTERS = {
    warrior: { name: "전사", hp: 120, speed: 4, bulletSpeed: 8, color: "crimson" },
    scout:   { name: "스카우트", hp: 80, speed: 7, bulletSpeed: 12, color: "deepskyblue" }
};

const MAX_PLAYERS = 4;

// ================= MAP =================
const MAP_WIDTH = 2000;
const MAP_HEIGHT = 2000;
const PLAYER_SIZE = 50; // 플레이어 div 한 변 길이 (px)

const rooms = {};

function createRoomCode() {
    return Math.floor(1000 + Math.random() * 9000).toString();
}

// 클라이언트로 보낼 로비용 플레이어 목록 (필요한 정보만 추려서)
function getLobbyPlayers(room) {
    const list = {};
    for (const id in room.players) {
        const p = room.players[id];
        list[id] = {
            characterId: p.characterId,
            ready: p.ready,
            isHost: id === room.hostId
        };
    }
    return list;
}

function broadcastLobby(code) {
    const room = rooms[code];
    if (!room) return;

    io.to(code).emit("lobbyUpdate", {
        hostId: room.hostId,
        players: getLobbyPlayers(room)
    });
}

io.on("connection", (socket) => {

    socket.roomCode = null;

    // ================= CREATE ROOM =================
    socket.on("createRoom", () => {

        let code;
        do {
            code = createRoomCode();
        } while (rooms[code]);

        rooms[code] = {
            state: "waiting", // "waiting" | "playing" | "ended"
            hostId: socket.id,
            players: {},
            bullets: {}
        };

        socket.join(code);
        socket.roomCode = code;

        rooms[code].players[socket.id] = {
            x: MAP_WIDTH / 2, y: MAP_HEIGHT / 2,
            hp: 100,
            characterId: null,
            ready: false
        };

        socket.emit("roomCreated", code);
        broadcastLobby(code);
    });

    // ================= JOIN ROOM =================
    socket.on("joinRoom", (code) => {

        const room = rooms[code];
        if (!room) return socket.emit("roomNotFound");
        if (room.state !== "waiting") return socket.emit("roomAlreadyStarted");

        if (Object.keys(room.players).length >= MAX_PLAYERS) {
            return socket.emit("roomFull");
        }

        socket.join(code);
        socket.roomCode = code;

        room.players[socket.id] = {
            x: MAP_WIDTH / 2, y: MAP_HEIGHT / 2,
            hp: 100,
            characterId: null,
            ready: false
        };

        socket.emit("roomJoined", code);
        broadcastLobby(code);
    });

    // ================= SELECT CHARACTER =================
    socket.on("selectCharacter", (characterId) => {

        const room = rooms[socket.roomCode];
        if (!room || room.state !== "waiting") return;

        const player = room.players[socket.id];
        if (!player) return;

        if (!CHARACTERS[characterId]) return; // 존재하지 않는 캐릭터 id 방어

        player.characterId = characterId;
        player.ready = true;

        broadcastLobby(socket.roomCode);
    });

    // ================= START GAME =================
    socket.on("startGame", () => {

        const room = rooms[socket.roomCode];
        if (!room || room.state !== "waiting") return;

        // 방장만 시작 가능
        if (socket.id !== room.hostId) return;

        const ids = Object.keys(room.players);

        // 최소 2명 이상
        if (ids.length < 2) {
            return socket.emit("startFailed", "최소 2명이 필요합니다.");
        }

        // 전원 캐릭터 선택 완료 확인
        const allReady = ids.every(id => room.players[id].ready);
        if (!allReady) {
            return socket.emit("startFailed", "모든 플레이어가 캐릭터를 선택해야 합니다.");
        }

        room.state = "playing";

        // 스탯 기반으로 초기화 (맵 중앙 근처에 서로 겹치지 않게 배치)
        ids.forEach((id, index) => {
            const p = room.players[id];
            const charData = CHARACTERS[p.characterId];

            p.x = MAP_WIDTH / 2 + index * 100 - 150;
            p.y = MAP_HEIGHT / 2;
            p.hp = charData.hp;
            p.maxHp = charData.hp;
        });

        io.to(socket.roomCode).emit("gameStarted", {
            players: room.players,
            characters: CHARACTERS,
            map: { width: MAP_WIDTH, height: MAP_HEIGHT }
        });
    });

    // ================= MOVE =================
    socket.on("move", (data) => {

        const room = rooms[socket.roomCode];
        if (!room || room.state !== "playing" || !room.players[socket.id]) return;

        // ⭐ 맵 경계 안으로 좌표 고정 (clamp)
        const clampedX = Math.max(0, Math.min(MAP_WIDTH - PLAYER_SIZE, data.x));
        const clampedY = Math.max(0, Math.min(MAP_HEIGHT - PLAYER_SIZE, data.y));

        room.players[socket.id].x = clampedX;
        room.players[socket.id].y = clampedY;

        io.to(socket.roomCode).emit("players", room.players);
    });

    // ================= SHOOT =================
    socket.on("shoot", (data) => {

        const room = rooms[socket.roomCode];
        if (!room || room.state !== "playing") return;

        const id = data.id; // 클라이언트가 만든 id를 그대로 사용

        room.bullets[id] = {
            owner: socket.id,
            x: data.startX,
            y: data.startY,
            vx: data.vx,
            vy: data.vy
        };

        io.to(socket.roomCode).emit("shoot", {
            id,
            ...room.bullets[id]
        });
    });

    // ================= DISCONNECT =================
    socket.on("disconnect", () => {

        const code = socket.roomCode;
        const room = rooms[code];
        if (!room) return;

        delete room.players[socket.id];

        if (Object.keys(room.players).length === 0) {
            delete rooms[code];
            return;
        }

        // 방장이 나가면 다음 사람에게 방장 위임
        if (room.hostId === socket.id) {
            room.hostId = Object.keys(room.players)[0];
        }

        if (room.state === "waiting") {
            broadcastLobby(code);
        } else if (room.state === "playing") {
            io.to(code).emit("players", room.players);
        }
    });
});


// ================= GAME LOOP (PLAYING 상태인 방만 처리) =================
setInterval(() => {

    for (const code in rooms) {

        const room = rooms[code];
        if (room.state !== "playing") continue;

        for (const bid in room.bullets) {

            const b = room.bullets[bid];

            b.x += b.vx;
            b.y += b.vy;

            // ⭐ 총알이 맵 밖으로 나가면 제거
            if (b.x < 0 || b.x > MAP_WIDTH || b.y < 0 || b.y > MAP_HEIGHT) {
                delete room.bullets[bid];
                continue;
            }

            for (const pid in room.players) {

                if (pid === b.owner) continue;

                const p = room.players[pid];

                const dx = (p.x + 25) - b.x;
                const dy = (p.y + 25) - b.y;

                const dist = Math.sqrt(dx * dx + dy * dy);

                if (dist < 20) {

                    p.hp -= 10;

                    delete room.bullets[bid];

                    if (p.hp <= 0) {
                        io.to(pid).emit("dead");
                        delete room.players[pid];
                    }

                    break;
                }
            }
        }

        const hpData = {};
        for (const pid in room.players) hpData[pid] = room.players[pid].hp;
        io.to(code).emit("hpUpdate", hpData);

        // 마지막 생존자 1명이면 게임 종료
        const remaining = Object.keys(room.players);
        if (room.state === "playing" && remaining.length <= 1) {
            room.state = "ended";
            io.to(code).emit("gameOver", {
                winnerId: remaining[0] || null
            });
        }
    }

}, 16);

const PORT = process.env.PORT || 3000;
http.listen(PORT, () => console.log("Server running on " + PORT));