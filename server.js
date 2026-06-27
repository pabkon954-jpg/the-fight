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
    monkey:  {
        name: "원숭이", hp: 400, speed: 8, bulletSpeed: 9, color: "#8a5a2b", attackDamage: 10,
        passive: { wallSpeedBonus: 12 }, // 벽에 붙어있을 때 적용되는 이동속도 (기존 8 -> 12)
        skills: {
            skill1: { cooldown: 5000, damage: 50, blindChance: 0.2, blindDuration: 2000, projectileSpeed: 9 },
            skill2: { cooldown: 7000, stunDuration: 1200, trapLifetime: 8000, trapRadius: 22 },
            skill3: { cooldown: 20000, damage: 150, dashDistance: 220, dashDurationMs: 200, hitRadius: 40 }
        }
    }
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

// 점(px, py)과 선분(x1,y1)-(x2,y2) 사이의 최단 거리 (스킬3 돌진 판정용)
function pointToSegmentDistance(px, py, x1, y1, x2, y2) {
    const dx = x2 - x1;
    const dy = y2 - y1;
    const lenSq = dx * dx + dy * dy;

    if (lenSq === 0) {
        return Math.sqrt((px - x1) ** 2 + (py - y1) ** 2);
    }

    let t = ((px - x1) * dx + (py - y1) * dy) / lenSq;
    t = Math.max(0, Math.min(1, t));

    const closestX = x1 + t * dx;
    const closestY = y1 + t * dy;

    return Math.sqrt((px - closestX) ** 2 + (py - closestY) ** 2);
}

function createNewPlayer() {
    return {
        x: MAP_WIDTH / 2, y: MAP_HEIGHT / 2,
        hp: 100,
        maxHp: 100,
        characterId: null,
        ready: false,
        lives: STARTING_LIVES,
        alive: true,
        eliminated: false,
        // ===== 스킬 관련 상태 =====
        cooldowns: {},          // { skill1: timestamp(쿨 끝나는 시각), ... }
        stunnedUntil: 0,        // 이 시각까지 기절 상태
        currentSpeed: null      // null이면 캐릭터 기본 속도 사용, 패시브 등으로 덮어쓸 때 사용
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
    const now = Date.now();
    const snap = {};
    for (const id in room.players) {
        const p = room.players[id];

        const cooldownRemaining = {};
        for (const skillKey in p.cooldowns) {
            cooldownRemaining[skillKey] = Math.max(0, p.cooldowns[skillKey] - now);
        }

        snap[id] = {
            x: p.x,
            y: p.y,
            hp: p.hp,
            maxHp: p.maxHp,
            lives: p.lives,
            alive: p.alive,
            eliminated: p.eliminated,
            characterId: p.characterId,
            cooldowns: cooldownRemaining,             // ms 단위 남은 쿨타임
            stunned: now < p.stunnedUntil,              // 기절 중인지
            currentSpeed: p.currentSpeed                // 패시브 등으로 변경된 속도 (null이면 기본 속도)
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
    room.traps = {};
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
        p.cooldowns = {};
        p.stunnedUntil = 0;
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
            traps: {},
            countdownTimer: null
        };

        socket.join(code);
        socket.roomCode = code;

        rooms[code].players[socket.id] = createNewPlayer();

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

        room.players[socket.id] = createNewPlayer();

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
        if (Date.now() < p.stunnedUntil) return; // ⭐ 기절 중에는 이동 무시

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
        if (Date.now() < shooter.stunnedUntil) return; // ⭐ 기절 중에는 발사 무시

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

    // ================= USE SKILL (스킬1/2/3 공용) =================
    socket.on("useSkill", (data) => {

        const room = rooms[socket.roomCode];
        if (!room || room.state !== "playing" || room.roundPhase !== "fighting") return;

        const player = room.players[socket.id];
        if (!player || !player.alive || player.eliminated) return;
        if (Date.now() < player.stunnedUntil) return;

        const charData = CHARACTERS[player.characterId];
        if (!charData || !charData.skills) return;

        const skillKey = data.skillKey; // "skill1" | "skill2" | "skill3"
        const skillDef = charData.skills[skillKey];
        if (!skillDef) return;

        const now = Date.now();
        const cooldownEnd = player.cooldowns[skillKey] || 0;
        if (now < cooldownEnd) return; // 아직 쿨타임

        player.cooldowns[skillKey] = now + skillDef.cooldown;

        if (skillKey === "skill1") {
            // 바나나 투척: 데미지 + 일정 확률로 시야 방해
            const id = "skill1_" + socket.id + "_" + now;

            room.bullets[id] = {
                owner: socket.id,
                x: data.startX,
                y: data.startY,
                vx: data.vx,
                vy: data.vy,
                damage: skillDef.damage,
                isSkill1: true,
                blindChance: skillDef.blindChance,
                blindDuration: skillDef.blindDuration
            };

            io.to(socket.roomCode).emit("shoot", {
                id,
                ...room.bullets[id]
            });

        } else if (skillKey === "skill2") {
            // 바나나 트랩 설치
            const trapId = "trap_" + socket.id + "_" + now;

            room.traps[trapId] = {
                owner: socket.id,
                x: data.x,
                y: data.y,
                expiresAt: now + skillDef.trapLifetime,
                radius: skillDef.trapRadius,
                stunDuration: skillDef.stunDuration
            };

            io.to(socket.roomCode).emit("trapPlaced", {
                id: trapId,
                x: data.x,
                y: data.y
            });

        } else if (skillKey === "skill3") {
            // 돌진 할퀴기: 즉시 데미지 판정 (방향상 dashDistance 안에 있는 적 전부 타격)
            const dx = data.dirX;
            const dy = data.dirY;
            const len = Math.sqrt(dx * dx + dy * dy) || 1;
            const ndx = dx / len;
            const ndy = dy / len;

            const startX = player.x;
            const startY = player.y;

            const endX = Math.max(0, Math.min(MAP_WIDTH - PLAYER_SIZE, startX + ndx * skillDef.dashDistance));
            const endY = Math.max(0, Math.min(MAP_HEIGHT - PLAYER_SIZE, startY + ndy * skillDef.dashDistance));

            // 플레이어 위치를 돌진 끝점으로 이동 (서버 권위)
            player.x = endX;
            player.y = endY;

            const hitIds = [];

            for (const pid in room.players) {
                if (pid === socket.id) continue;
                const target = room.players[pid];
                if (!target.alive || target.eliminated) continue;

                // 돌진 경로(시작점~끝점) 선분과 타겟 사이 거리로 판정
                const distToPath = pointToSegmentDistance(
                    target.x + 25, target.y + 25,
                    startX + 25, startY + 25,
                    endX + 25, endY + 25
                );

                if (distToPath < skillDef.hitRadius) {
                    target.hp -= skillDef.damage;
                    hitIds.push(pid);

                    if (target.hp <= 0) {
                        target.alive = false;
                        target.lives -= 1;
                        io.to(pid).emit("dead", { livesLeft: target.lives });
                    }
                }
            }

            io.to(socket.roomCode).emit("skill3Dash", {
                playerId: socket.id,
                startX, startY, endX, endY,
                hitIds
            });

            broadcastPlayers(socket.roomCode);
            if (hitIds.length > 0) checkRoundEnd(socket.roomCode);
        }

        // 쿨타임 갱신 사실을 알리기 위해 플레이어 상태 브로드캐스트
        broadcastPlayers(socket.roomCode);
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

    const now = Date.now();

    for (const code in rooms) {

        const room = rooms[code];
        if (room.state !== "playing" || room.roundPhase !== "fighting") continue;

        let hit = false;

        // ----- 투사체(기본공격 + 스킬1 바나나) 처리 -----
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

                    // 스킬1: 일정 확률로 시야 방해(블라인드) 부여
                    if (b.isSkill1 && Math.random() < b.blindChance) {
                        io.to(pid).emit("blinded", { duration: b.blindDuration });
                    }

                    if (p.hp <= 0) {
                        p.alive = false;
                        p.lives -= 1;
                        io.to(pid).emit("dead", { livesLeft: p.lives });
                    }

                    break;
                }
            }
        }

        // ----- 트랩(스킬2 바나나 설치) 처리 -----
        for (const tid in room.traps) {

            const trap = room.traps[tid];

            if (now > trap.expiresAt) {
                delete room.traps[tid];
                io.to(code).emit("trapExpired", { id: tid });
                continue;
            }

            for (const pid in room.players) {

                if (pid === trap.owner) continue; // 설치자 본인은 안 밟힘

                const p = room.players[pid];
                if (!p.alive || p.eliminated) continue;
                if (now < p.stunnedUntil) continue; // 이미 기절 중이면 중복 트리거 방지

                const dx = (p.x + 25) - trap.x;
                const dy = (p.y + 25) - trap.y;
                const dist = Math.sqrt(dx * dx + dy * dy);

                if (dist < trap.radius) {
                    p.stunnedUntil = now + trap.stunDuration;
                    io.to(code).emit("playerStunned", {
                        playerId: pid,
                        duration: trap.stunDuration
                    });

                    delete room.traps[tid]; // 한 번 밟으면 트랩 소모
                    hit = true;
                    break;
                }
            }
        }

        // ----- 패시브: 벽에 붙어있는지 체크해서 현재 속도 갱신 -----
        for (const pid in room.players) {
            const p = room.players[pid];
            if (!p.alive || p.eliminated || !p.characterId) continue;

            const charData = CHARACTERS[p.characterId];
            if (!charData || !charData.passive || !charData.passive.wallSpeedBonus) {
                p.currentSpeed = null;
                continue;
            }

            const atWall = (
                p.x <= 0 || p.x >= MAP_WIDTH - PLAYER_SIZE ||
                p.y <= 0 || p.y >= MAP_HEIGHT - PLAYER_SIZE
            );

            p.currentSpeed = atWall ? charData.passive.wallSpeedBonus : null;
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