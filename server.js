const express = require("express");
const app = express();
const http = require("http").createServer(app);
const io = require("socket.io")(http);

app.use(express.static(__dirname));

app.get("/", (req, res) => {
    res.sendFile(__dirname + "/index.html");
});

// ================= CHARACTERS (서버 기준 스탯) =================
const CHARACTERS = {
    warrior: { name: "전사", hp: 120, speed: 4, bulletSpeed: 8, color: "crimson", attackDamage: 10 },
    scout:   { name: "스카우트", hp: 80, speed: 7, bulletSpeed: 12, color: "deepskyblue", attackDamage: 10 },
    monkey:  { name: "원숭이", hp: 400, speed: 8, bulletSpeed: 9, color: "#8a5a2b", attackDamage: 10 }
};

const MAX_PLAYERS = 4;

// ================= MAP =================
const MAP_WIDTH = 2000;
const MAP_HEIGHT = 2000;
const PLAYER_SIZE = 50;

// ================= GAME RULES =================
const STARTING_LIVES = 3;
const COUNTDOWN_SECONDS = 3;
const ROUND_END_DELAY_MS = 3000; // 라운드 종료 후 결과 보여주는 시간

const rooms = {};

function createRoomCode() {
    return Math.floor(1000 + Math.random() * 9000).toString();
}

function randomSpawnPoint() {
    const margin = 100; // 벽에 너무 붙어서 스폰되지 않도록 여유
    return {
        x: margin + Math.random() * (MAP_WIDTH - margin * 2 - PLAYER_SIZE),
        y: margin + Math.random() * (MAP_HEIGHT - margin * 2 - PLAYER_SIZE)
    };
}

// 클라이언트로 보낼 로비용 플레이어 목록
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

// 현재 방 플레이어들의 公개용 상태 스냅샷
function getPlayersSnapshot(room) {
    const snap = {};
    for (const id in room.players) {
        const p = room.players[id];
        snap[id] = {
            x: p.x,
            y: p.y,
            hp: p.hp,
            maxHp: p.maxHp,
            lives: p.lives,
            alive: p.alive,           // 이번 라운드에서 살아있는지
            eliminated: p.eliminated, // 목숨 0 -> 게임에서 완전 탈락
            characterId: p.characterId // ⭐ 누락되어 있던 필드 추가
        };
    }
    return snap;
}

function broadcastPlayers(code) {
    const room = rooms[code];
    if (!room) return;
    io.to(code).emit("players", getPlayersSnapshot(room));
}

// ================= ROUND START =================
function startRound(code) {
    const room = rooms[code];
    if (!room) return;

    room.bullets = {};
    room.roundPhase = "countdown"; // "countdown" | "fighting" | "roundEnd"

    const activeIds = Object.keys(room.players).filter(id => !room.players[id].eliminated);

    activeIds.forEach(id => {
        const p = room.players[id];
        const charData = CHARACTERS[p.characterId];
        const spawn = randomSpawnPoint();

        p.x = spawn.x;
        p.y = spawn.y;
        p.hp = charData.hp;
        p.maxHp = charData.hp;
        p.alive = true;
    });

    io.to(code).emit("roundStarting", {
        players: getPlayersSnapshot(room),
        countdown: COUNTDOWN_SECONDS
    });

    let remaining = COUNTDOWN_SECONDS;

    if (room.countdownTimer) clearInterval(room.countdownTimer);

    room.countdownTimer = setInterval(() => {
        remaining -= 1;

        if (remaining > 0) {
            io.to(code).emit("countdownTick", remaining);
        } else {
            clearInterval(room.countdownTimer);
            room.countdownTimer = null;
            room.roundPhase = "fighting";
            io.to(code).emit("roundFightStart");
        }
    }, 1000);
}

// ================= ROUND END CHECK =================
function checkRoundEnd(code) {
    const room = rooms[code];
    if (!room || room.roundPhase !== "fighting") return;

    const activeIds = Object.keys(room.players).filter(id => !room.players[id].eliminated);
    const aliveIds = activeIds.filter(id => room.players[id].alive);

    if (aliveIds.length > 1) return; // 아직 라운드 진행 중

    room.roundPhase = "roundEnd";

    // 이 라운드의 승자 (혼자 살아남은 사람, 또는 동시에 0명이면 없음)
    const roundWinnerId = aliveIds[0] || null;

    // 목숨 0이 된 사람 확인 -> 게임에서 완전 탈락 처리
    activeIds.forEach(id => {
        const p = room.players[id];
        if (p.lives <= 0) {
            p.eliminated = true;
        }
    });

    const remainingPlayers = Object.keys(room.players).filter(id => !room.players[id].eliminated);

    io.to(code).emit("roundEnd", {
        roundWinnerId,
        players: getPlayersSnapshot(room)
    });

    // 게임 전체 종료 조건: 탈락하지 않은 사람이 1명 이하
    if (remainingPlayers.length <= 1) {
        room.state = "ended";
        setTimeout(() => {
            io.to(code).emit("gameOver", {
                winnerId: remainingPlayers[0] || null
            });
        }, ROUND_END_DELAY_MS);
        return;
    }

    // 다음 라운드 자동 시작
    setTimeout(() => {
        if (rooms[code] && rooms[code].state === "playing") {
            startRound(code);
        }
    }, ROUND_END_DELAY_MS);
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
            roundPhase: null,  // "countdown" | "fighting" | "roundEnd"
            hostId: socket.id,
            players: {},
            bullets: {},
            countdownTimer: null
        };

        socket.join(code);
        socket.roomCode = code;

        rooms[code].players[socket.id] = {
            x: MAP_WIDTH / 2, y: MAP_HEIGHT / 2,
            hp: 100,
            maxHp: 100,
            characterId: null,
            ready: false,
            lives: STARTING_LIVES,
            alive: true,
            eliminated: false
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
            maxHp: 100,
            characterId: null,
            ready: false,
            lives: STARTING_LIVES,
            alive: true,
            eliminated: false
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

        if (!CHARACTERS[characterId]) return;

        player.characterId = characterId;
        player.ready = true;

        broadcastLobby(socket.roomCode);
    });

    // ================= START GAME =================
    socket.on("startGame", () => {

        const room = rooms[socket.roomCode];
        if (!room || room.state !== "waiting") return;

        if (socket.id !== room.hostId) return;

        const ids = Object.keys(room.players);

        if (ids.length < 2) {
            return socket.emit("startFailed", "최소 2명이 필요합니다.");
        }

        const allReady = ids.every(id => room.players[id].ready);
        if (!allReady) {
            return socket.emit("startFailed", "모든 플레이어가 캐릭터를 선택해야 합니다.");
        }

        room.state = "playing";

        // 목숨/탈락 상태 초기화
        ids.forEach(id => {
            const p = room.players[id];
            p.lives = STARTING_LIVES;
            p.eliminated = false;
            p.alive = true;
        });

        io.to(socket.roomCode).emit("gameStarted", {
            players: getPlayersSnapshot(room),
            characters: CHARACTERS,
            map: { width: MAP_WIDTH, height: MAP_HEIGHT },
            startingLives: STARTING_LIVES
        });

        // 약간의 여유를 두고 첫 라운드 시작 (클라이언트가 화면 전환할 시간)
        setTimeout(() => startRound(socket.roomCode), 300);
    });

    // ================= MOVE =================
    socket.on("move", (data) => {

        const room = rooms[socket.roomCode];
        if (!room || room.state !== "playing") return;
        if (room.roundPhase !== "fighting") return; // ⭐ 카운트다운 중에는 이동 무시

        const p = room.players[socket.id];
        if (!p || !p.alive || p.eliminated) return;

        const clampedX = Math.max(0, Math.min(MAP_WIDTH - PLAYER_SIZE, data.x));
        const clampedY = Math.max(0, Math.min(MAP_HEIGHT - PLAYER_SIZE, data.y));

        p.x = clampedX;
        p.y = clampedY;

        broadcastPlayers(socket.roomCode);
    });

    // ================= SHOOT =================
    socket.on("shoot", (data) => {

        const room = rooms[socket.roomCode];
        if (!room || room.state !== "playing") return;
        if (room.roundPhase !== "fighting") return; // ⭐ 카운트다운 중에는 발사 무시

        const shooter = room.players[socket.id];
        if (!shooter || !shooter.alive || shooter.eliminated) return;

        const id = data.id;
        const charData = CHARACTERS[shooter.characterId];
        const damage = (charData && charData.attackDamage) || 10;

        room.bullets[id] = {
            owner: socket.id,
            x: data.startX,
            y: data.startY,
            vx: data.vx,
            vy: data.vy,
            damage: damage
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

        const wasInRoom = !!room.players[socket.id];
        delete room.players[socket.id];

        if (Object.keys(room.players).length === 0) {
            if (room.countdownTimer) clearInterval(room.countdownTimer);
            delete rooms[code];
            return;
        }

        if (room.hostId === socket.id) {
            room.hostId = Object.keys(room.players)[0];
        }

        if (room.state === "waiting") {
            broadcastLobby(code);
        } else if (room.state === "playing") {
            broadcastPlayers(code);
            if (wasInRoom && room.roundPhase === "fighting") {
                checkRoundEnd(code);
            }
        }
    });
});


// ================= GAME LOOP (PLAYING 상태 + 전투 중인 방만 처리) =================
setInterval(() => {

    for (const code in rooms) {

        const room = rooms[code];
        if (room.state !== "playing" || room.roundPhase !== "fighting") continue;

        let hit = false;

        for (const bid in room.bullets) {

            const b = room.bullets[bid];

            b.x += b.vx;
            b.y += b.vy;

            if (b.x < 0 || b.x > MAP_WIDTH || b.y < 0 || b.y > MAP_HEIGHT) {
                delete room.bullets[bid];
                continue;
            }

            for (const pid in room.players) {

                const p = room.players[pid];

                if (pid === b.owner) continue;
                if (!p.alive || p.eliminated) continue;

                const dx = (p.x + 25) - b.x;
                const dy = (p.y + 25) - b.y;

                const dist = Math.sqrt(dx * dx + dy * dy);

                if (dist < 20) {

                    p.hp -= (b.damage || 10);

                    delete room.bullets[bid];
                    hit = true;

                    if (p.hp <= 0) {
                        p.alive = false;
                        p.lives -= 1;
                        io.to(pid).emit("dead", { livesLeft: p.lives });
                    }

                    break;
                }
            }
        }

        if (hit) {
            broadcastPlayers(code);
            checkRoundEnd(code);
        } else {
            broadcastPlayers(code);
        }
    }

}, 16);

const PORT = process.env.PORT || 3000;
http.listen(PORT, () => console.log("Server running on " + PORT));