const player = document.getElementById("player");
const socket = io();

const createRoomBtn = document.getElementById("createRoomBtn");
const joinRoomBtn = document.getElementById("joinRoomBtn");
const roomInput = document.getElementById("roomInput");
const menu = document.getElementById("menu");

// ================= LOBBY ELEMENTS =================
const lobby = document.getElementById("lobby");
const lobbyRoomCode = document.getElementById("lobbyRoomCode");
const characterSelect = document.getElementById("characterSelect");
const playerListItems = document.getElementById("playerListItems");
const startBtn = document.getElementById("startBtn");
const lobbyMessage = document.getElementById("lobbyMessage");

// 서버 CHARACTERS와 id가 일치해야 함 (표시용 정보)
const CHARACTER_DISPLAY = {
    warrior: { name: "전사", color: "crimson", statsText: "체력 120 · 속도 보통" },
    scout:   { name: "스카우트", color: "deepskyblue", statsText: "체력 80 · 속도 빠름" }
};

// ================= UI =================
const roomTop = document.createElement("div");
roomTop.style.position = "fixed";
roomTop.style.top = "10px";
roomTop.style.left = "10px";
roomTop.style.color = "white";
roomTop.style.fontSize = "20px";
roomTop.style.zIndex = "5";
document.body.appendChild(roomTop);

// ================= MAP / WORLD =================
let MAP_WIDTH = 2000;
let MAP_HEIGHT = 2000;
const PLAYER_SIZE = 50;

// 맵 경계를 보여주는 배경 요소 (월드 좌표 기준으로 그려진 큰 사각형)
const mapEl = document.createElement("div");
mapEl.style.position = "absolute";
mapEl.style.left = "0px";
mapEl.style.top = "0px";
mapEl.style.background = "#1a1a1a";
mapEl.style.border = "6px solid #555";
mapEl.style.boxSizing = "border-box";
mapEl.style.zIndex = "0";
mapEl.style.display = "none";
document.body.appendChild(mapEl);

// 카메라: 화면에 보이는 월드의 좌상단 좌표
let camX = 0;
let camY = 0;

function updateCamera() {
    camX = x + PLAYER_SIZE / 2 - window.innerWidth / 2;
    camY = y + PLAYER_SIZE / 2 - window.innerHeight / 2;
}

// 월드 좌표 → 화면 좌표 변환 후 엘리먼트에 적용
function placeAtWorld(el, worldX, worldY) {
    el.style.left = (worldX - camX) + "px";
    el.style.top = (worldY - camY) + "px";
}

// ================= STATE =================
let joinedRoom = false;   // 게임이 실제로 시작된 상태인지 (로비 X, 게임 O)
let dead = false;

let myRoomCode = null;
let isHost = false;
let selectedCharacter = null;
let myCharSpeed = 5;
let myMaxHp = 100;

// x, y는 "월드 좌표" (맵 안에서의 실제 위치)
let x = 100;
let y = 100;

let bulletSeq = 0;

const keys = {};
const otherPlayers = {};   // { id: { el, worldX, worldY } }
const hpBars = {};
const bullets = {};        // { id: { el, worldX, worldY, vx, vy } }

player.style.display = "none";
player.style.zIndex = "2";

// ================= HP =================
let myHp = 100;

const myHpBar = document.createElement("div");
myHpBar.style.width = "50px";
myHpBar.style.height = "6px";
myHpBar.style.background = "lime";
myHpBar.style.position = "absolute";
myHpBar.style.borderRadius = "3px";
myHpBar.style.display = "none";
myHpBar.style.zIndex = "3";
document.body.appendChild(myHpBar);

// ================= INPUT =================
document.addEventListener("keydown", e => keys[e.key.toLowerCase()] = true);
document.addEventListener("keyup", e => keys[e.key.toLowerCase()] = false);

// ================= LOOP =================
function loop() {
    requestAnimationFrame(loop);

    if (!joinedRoom || dead) return;

    if (keys["w"]) y -= myCharSpeed;
    if (keys["s"]) y += myCharSpeed;
    if (keys["a"]) x -= myCharSpeed;
    if (keys["d"]) x += myCharSpeed;

    // ⭐ 클라이언트 쪽에서도 맵 경계 밖으로 못 나가게 고정
    // (서버가 최종 권위를 갖지만, 로컬에서도 막아야 벽을 넘는 것처럼 보이는 깜빡임이 없음)
    x = Math.max(0, Math.min(MAP_WIDTH - PLAYER_SIZE, x));
    y = Math.max(0, Math.min(MAP_HEIGHT - PLAYER_SIZE, y));

    // ⭐ 카메라는 항상 나를 중심으로
    updateCamera();

    // 내 캐릭터는 항상 화면 중앙 근처 (카메라가 나를 따라가므로 결과적으로 고정된 위치)
    placeAtWorld(player, x, y);
    placeAtWorld(myHpBar, x, y - 12);

    // 맵 배경도 카메라에 맞춰 이동
    placeAtWorld(mapEl, 0, 0);

    // 다른 플레이어들도 카메라 변경에 맞춰 다시 위치 갱신
    for (const id in otherPlayers) {
        const op = otherPlayers[id];
        placeAtWorld(op.el, op.worldX, op.worldY);
        if (hpBars[id]) {
            placeAtWorld(hpBars[id], op.worldX, op.worldY - 12);
        }
    }

    // 총알들도 카메라 변경에 맞춰 다시 위치 갱신
    for (const id in bullets) {
        const b = bullets[id];
        placeAtWorld(b.el, b.worldX, b.worldY);
    }

    socket.emit("move", { x, y });
}
loop();

// ================= BULLET =================
function createBullet(id, startWorldX, startWorldY, targetWorldX, targetWorldY, color) {

    if (bullets[id]) return;

    const bulletEl = document.createElement("div");
    bulletEl.style.width = "10px";
    bulletEl.style.height = "10px";
    bulletEl.style.background = color;
    bulletEl.style.position = "absolute";
    bulletEl.style.borderRadius = "50%";
    bulletEl.style.zIndex = "1";

    document.body.appendChild(bulletEl);

    const dx = targetWorldX - startWorldX;
    const dy = targetWorldY - startWorldY;
    const len = Math.sqrt(dx * dx + dy * dy) || 1;

    const vx = (dx / len) * 10;
    const vy = (dy / len) * 10;

    const bulletState = {
        el: bulletEl,
        worldX: startWorldX,
        worldY: startWorldY,
        vx, vy
    };

    bullets[id] = bulletState;

    placeAtWorld(bulletEl, bulletState.worldX, bulletState.worldY);

    function move() {

        if (!bullets[id] || dead) return;

        bulletState.worldX += bulletState.vx;
        bulletState.worldY += bulletState.vy;

        placeAtWorld(bulletEl, bulletState.worldX, bulletState.worldY);

        // 맵 경계를 벗어나면 제거 (서버와 동일한 기준)
        if (
            bulletState.worldX < -50 || bulletState.worldX > MAP_WIDTH + 50 ||
            bulletState.worldY < -50 || bulletState.worldY > MAP_HEIGHT + 50
        ) {
            bulletEl.remove();
            delete bullets[id];
            return;
        }

        requestAnimationFrame(move);
    }

    move();
}

// ================= SHOOT =================
document.addEventListener("click", (e) => {

    if (!joinedRoom || dead) return;

    // 클릭한 화면 좌표 → 월드 좌표로 변환 (카메라 오프셋 더하기)
    const targetWorldX = e.clientX + camX;
    const targetWorldY = e.clientY + camY;

    const sx = x + 25;
    const sy = y + 25;

    const dx = targetWorldX - sx;
    const dy = targetWorldY - sy;

    const len = Math.sqrt(dx * dx + dy * dy) || 1;

    const id = socket.id + "_" + (bulletSeq++);

    createBullet(id, sx, sy, targetWorldX, targetWorldY, "yellow");

    socket.emit("shoot", {
        id,
        startX: sx,
        startY: sy,
        vx: (dx / len) * 10,
        vy: (dy / len) * 10
    });
});

// ================= REMOTE SHOOT (상대방 총알) =================
socket.on("shoot", (data) => {

    if (data.owner === socket.id) return;
    if (!joinedRoom || dead) return;

    const targetX = data.x + data.vx * 100;
    const targetY = data.y + data.vy * 100;

    createBullet(data.id, data.x, data.y, targetX, targetY, "red");
});

// ================= OTHER PLAYERS =================
socket.on("players", players => {

    if (!joinedRoom || dead) return;

    for (const id in players) {

        if (id === socket.id) continue;

        if (!otherPlayers[id]) {
            const div = document.createElement("div");
            div.style.width = "50px";
            div.style.height = "50px";
            div.style.background = "lime";
            div.style.position = "absolute";
            div.style.borderRadius = "50%";
            div.style.zIndex = "2";
            document.body.appendChild(div);
            otherPlayers[id] = { el: div, worldX: 0, worldY: 0 };
        }

        otherPlayers[id].worldX = players[id].x;
        otherPlayers[id].worldY = players[id].y;

        placeAtWorld(otherPlayers[id].el, players[id].x, players[id].y);
    }

    for (const id in otherPlayers) {
        if (!players[id]) {
            otherPlayers[id].el.remove();
            delete otherPlayers[id];
        }
    }
});

// ================= HP =================
socket.on("hpUpdate", hpData => {

    if (!joinedRoom || dead) return;

    if (hpData[socket.id] !== undefined) {
        myHp = hpData[socket.id];
        myHpBar.style.width = (myHp / myMaxHp) * 50 + "px";
    }

    for (const id in hpData) {

        if (id === socket.id) continue;

        if (!hpBars[id]) {
            const bar = document.createElement("div");
            bar.style.width = "50px";
            bar.style.height = "6px";
            bar.style.background = "red";
            bar.style.position = "absolute";
            bar.style.borderRadius = "3px";
            bar.style.zIndex = "3";
            document.body.appendChild(bar);
            hpBars[id] = bar;
        }

        hpBars[id].style.width = (hpData[id] / 100) * 50 + "px";

        if (otherPlayers[id]) {
            placeAtWorld(hpBars[id], otherPlayers[id].worldX, otherPlayers[id].worldY - 12);
        }
    }

    for (const id in hpBars) {
        if (hpData[id] === undefined) {
            hpBars[id].remove();
            delete hpBars[id];
        }
    }
});

// ================= LOBBY: 캐릭터 카드 렌더링 =================
function renderCharacterCards() {
    characterSelect.innerHTML = "";

    for (const charId in CHARACTER_DISPLAY) {
        const info = CHARACTER_DISPLAY[charId];

        const card = document.createElement("div");
        card.className = "char-card";
        card.dataset.charId = charId;

        card.innerHTML = `
            <div class="char-swatch" style="background:${info.color}"></div>
            <div class="char-name">${info.name}</div>
            <div class="char-stats">${info.statsText}</div>
        `;

        card.addEventListener("click", () => {
            selectedCharacter = charId;
            socket.emit("selectCharacter", charId);

            document.querySelectorAll(".char-card").forEach(c => c.classList.remove("selected"));
            card.classList.add("selected");
        });

        characterSelect.appendChild(card);
    }
}
renderCharacterCards();

// ================= LOBBY: 플레이어 목록 렌더링 =================
function renderPlayerList(hostId, players) {
    playerListItems.innerHTML = "";

    const ids = Object.keys(players);

    ids.forEach((id, index) => {
        const p = players[id];

        const row = document.createElement("div");
        row.className = "player-row";

        const label = id === socket.id ? "나" : `플레이어 ${index + 1}`;
        const hostTag = id === hostId ? `<span class="host-tag">방장</span>` : "";
        const charName = p.characterId ? CHARACTER_DISPLAY[p.characterId].name : "-";

        row.innerHTML = `
            <span>${label}${hostTag}</span>
            <span class="ready-tag ${p.ready ? "yes" : "no"}">${charName} ${p.ready ? "✓" : ""}</span>
        `;

        playerListItems.appendChild(row);
    });

    isHost = (socket.id === hostId);

    const allReady = ids.length >= 2 && ids.every(id => players[id].ready);

    if (isHost) {
        startBtn.style.display = "inline-block";
        startBtn.disabled = !allReady;
    } else {
        startBtn.style.display = "none";
    }
}

// ================= ROOM 생성/입장 =================
createRoomBtn.onclick = () => socket.emit("createRoom");

joinRoomBtn.onclick = () => {
    const code = roomInput.value.trim();
    if (!code) return;
    socket.emit("joinRoom", code);
};

function enterLobby(code) {
    myRoomCode = code;

    menu.style.display = "none";
    lobby.style.display = "flex";

    lobbyRoomCode.innerText = "ROOM: " + code;
    lobbyMessage.innerText = "";
}

socket.on("roomCreated", enterLobby);
socket.on("roomJoined", enterLobby);

socket.on("roomNotFound", () => {
    alert("존재하지 않는 방입니다.");
});

socket.on("roomFull", () => {
    alert("방 인원이 가득 찼습니다.");
});

socket.on("roomAlreadyStarted", () => {
    alert("이미 시작된 방입니다.");
});

socket.on("lobbyUpdate", ({ hostId, players }) => {
    renderPlayerList(hostId, players);
});

// ================= START GAME =================
startBtn.onclick = () => {
    socket.emit("startGame");
};

socket.on("startFailed", (reason) => {
    lobbyMessage.innerText = reason;
});

// ================= GAME STARTED =================
socket.on("gameStarted", (data) => {

    lobby.style.display = "none";

    // 맵 크기 반영
    if (data.map) {
        MAP_WIDTH = data.map.width;
        MAP_HEIGHT = data.map.height;
    }

    mapEl.style.width = MAP_WIDTH + "px";
    mapEl.style.height = MAP_HEIGHT + "px";
    mapEl.style.display = "block";

    player.style.display = "block";
    myHpBar.style.display = "block";

    const myData = data.players[socket.id];
    const myChar = data.characters[myData.characterId];

    myCharSpeed = myChar.speed;
    myMaxHp = myChar.hp;

    x = myData.x;
    y = myData.y;
    myHp = myData.hp;

    player.style.background = myChar.color;

    updateCamera();
    placeAtWorld(player, x, y);
    placeAtWorld(myHpBar, x, y - 12);
    placeAtWorld(mapEl, 0, 0);

    myHpBar.style.width = (myHp / myMaxHp) * 50 + "px";

    roomTop.innerText = "ROOM: " + myRoomCode;

    joinedRoom = true;
    dead = false;
});

// ================= GAME OVER =================
socket.on("gameOver", ({ winnerId }) => {

    joinedRoom = false;

    const isWinner = winnerId === socket.id;

    const screen = document.createElement("div");
    screen.style.position = "fixed";
    screen.style.inset = "0";
    screen.style.background = "rgba(0,0,0,0.9)";
    screen.style.color = "white";
    screen.style.display = "flex";
    screen.style.justifyContent = "center";
    screen.style.alignItems = "center";
    screen.style.flexDirection = "column";
    screen.style.fontSize = "40px";
    screen.style.zIndex = "30";

    screen.innerHTML = `
        <div>${isWinner ? "YOU WIN" : "GAME OVER"}</div>
        <button id="backToMenuBtn" style="margin-top:20px;padding:10px;font-size:18px;">
            메뉴로
        </button>
    `;

    document.body.appendChild(screen);

    document.getElementById("backToMenuBtn").onclick = () => location.reload();
});

// ================= DEAD =================
socket.on("dead", () => {

    if (dead) return;
    dead = true;
    joinedRoom = false;

    player.style.display = "none";
    mapEl.style.display = "none";
    myHpBar.remove();

    for (const id in hpBars) {
        hpBars[id].remove();
        delete hpBars[id];
    }

    for (const id in otherPlayers) {
        otherPlayers[id].el.remove();
        delete otherPlayers[id];
    }

    for (const id in bullets) {
        bullets[id].el.remove();
        delete bullets[id];
    }

    const screen = document.createElement("div");
    screen.style.position = "fixed";
    screen.style.inset = "0";
    screen.style.background = "rgba(0,0,0,0.9)";
    screen.style.color = "white";
    screen.style.display = "flex";
    screen.style.justifyContent = "center";
    screen.style.alignItems = "center";
    screen.style.flexDirection = "column";
    screen.style.fontSize = "40px";
    screen.style.zIndex = "30";

    screen.innerHTML = `
        <div>YOU DIED</div>
        <button id="respawnBtn" style="margin-top:20px;padding:10px;">
            Respawn
        </button>
    `;

    document.body.appendChild(screen);

    document.getElementById("respawnBtn").onclick = () => location.reload();
});