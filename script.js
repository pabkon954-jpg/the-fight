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

// ================= TOP UI (방 코드) =================
const roomTop = document.createElement("div");
roomTop.style.position = "fixed";
roomTop.style.top = "10px";
roomTop.style.left = "10px";
roomTop.style.color = "white";
roomTop.style.fontSize = "20px";
roomTop.style.zIndex = "5";
document.body.appendChild(roomTop);

// ================= LIVES (하트) UI =================
const livesBar = document.createElement("div");
livesBar.style.position = "fixed";
livesBar.style.top = "10px";
livesBar.style.left = "50%";
livesBar.style.transform = "translateX(-50%)";
livesBar.style.fontSize = "32px";
livesBar.style.zIndex = "5";
livesBar.style.display = "none";
livesBar.style.letterSpacing = "4px";
document.body.appendChild(livesBar);

let myLives = 3;
let startingLives = 3;

function renderLives() {
    let hearts = "";
    for (let i = 0; i < startingLives; i++) {
        hearts += i < myLives ? "❤️" : "🖤";
    }
    livesBar.innerText = hearts;
}

// ================= COUNTDOWN UI =================
const countdownEl = document.createElement("div");
countdownEl.style.position = "fixed";
countdownEl.style.inset = "0";
countdownEl.style.display = "none";
countdownEl.style.justifyContent = "center";
countdownEl.style.alignItems = "center";
countdownEl.style.fontSize = "120px";
countdownEl.style.color = "white";
countdownEl.style.fontWeight = "bold";
countdownEl.style.textShadow = "0 0 20px rgba(0,0,0,0.8)";
countdownEl.style.zIndex = "25";
countdownEl.style.pointerEvents = "none";
document.body.appendChild(countdownEl);

// ================= ROUND RESULT UI =================
const roundResultEl = document.createElement("div");
roundResultEl.style.position = "fixed";
roundResultEl.style.top = "70px";
roundResultEl.style.left = "50%";
roundResultEl.style.transform = "translateX(-50%)";
roundResultEl.style.fontSize = "24px";
roundResultEl.style.color = "white";
roundResultEl.style.background = "rgba(0,0,0,0.6)";
roundResultEl.style.padding = "10px 20px";
roundResultEl.style.borderRadius = "8px";
roundResultEl.style.display = "none";
roundResultEl.style.zIndex = "5";
document.body.appendChild(roundResultEl);

// ================= SPECTATOR UI =================
const spectatorEl = document.createElement("div");
spectatorEl.style.position = "fixed";
spectatorEl.style.bottom = "20px";
spectatorEl.style.left = "50%";
spectatorEl.style.transform = "translateX(-50%)";
spectatorEl.style.fontSize = "20px";
spectatorEl.style.color = "white";
spectatorEl.style.background = "rgba(0,0,0,0.6)";
spectatorEl.style.padding = "8px 16px";
spectatorEl.style.borderRadius = "8px";
spectatorEl.style.display = "none";
spectatorEl.style.zIndex = "5";
spectatorEl.innerText = "관전 중... 다음 라운드를 기다려주세요";
document.body.appendChild(spectatorEl);

// ================= MAP / WORLD =================
let MAP_WIDTH = 2000;
let MAP_HEIGHT = 2000;
const PLAYER_SIZE = 50;

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

let camX = 0;
let camY = 0;

function updateCamera() {
    camX = x + PLAYER_SIZE / 2 - window.innerWidth / 2;
    camY = y + PLAYER_SIZE / 2 - window.innerHeight / 2;
}

function placeAtWorld(el, worldX, worldY) {
    el.style.left = (worldX - camX) + "px";
    el.style.top = (worldY - camY) + "px";
}

// ================= STATE =================
let joinedRoom = false;     // 게임이 시작된 상태(로비 X)
let canMove = false;        // 카운트다운이 끝나고 전투 중인지
let isAlive = true;         // 이번 라운드에서 살아있는지 (죽으면 관전)
let isEliminated = false;   // 목숨 0 -> 게임에서 완전 탈락

let myRoomCode = null;
let isHost = false;
let selectedCharacter = null;
let myCharSpeed = 5;
let myMaxHp = 100;

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

    if (!joinedRoom) return;

    // ⭐ 카운트다운 중이거나 죽어서 관전 중이면 이동 불가
    if (canMove && isAlive && !isEliminated) {
        if (keys["w"]) y -= myCharSpeed;
        if (keys["s"]) y += myCharSpeed;
        if (keys["a"]) x -= myCharSpeed;
        if (keys["d"]) x += myCharSpeed;

        x = Math.max(0, Math.min(MAP_WIDTH - PLAYER_SIZE, x));
        y = Math.max(0, Math.min(MAP_HEIGHT - PLAYER_SIZE, y));

        socket.emit("move", { x, y });
    }

    updateCamera();

    placeAtWorld(player, x, y);
    placeAtWorld(myHpBar, x, y - 12);
    placeAtWorld(mapEl, 0, 0);

    for (const id in otherPlayers) {
        const op = otherPlayers[id];
        placeAtWorld(op.el, op.worldX, op.worldY);
        if (hpBars[id]) {
            placeAtWorld(hpBars[id], op.worldX, op.worldY - 12);
        }
    }

    for (const id in bullets) {
        const b = bullets[id];
        placeAtWorld(b.el, b.worldX, b.worldY);
    }
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

        if (!bullets[id]) return;

        bulletState.worldX += bulletState.vx;
        bulletState.worldY += bulletState.vy;

        placeAtWorld(bulletEl, bulletState.worldX, bulletState.worldY);

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

function clearAllBullets() {
    for (const id in bullets) {
        bullets[id].el.remove();
        delete bullets[id];
    }
}

// ================= SHOOT =================
document.addEventListener("click", (e) => {

    if (!joinedRoom || !canMove || !isAlive || isEliminated) return;

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
    if (!joinedRoom) return;

    const targetX = data.x + data.vx * 100;
    const targetY = data.y + data.vy * 100;

    createBullet(data.id, data.x, data.y, targetX, targetY, "red");
});

// ================= PLAYERS (위치 + 체력 + 목숨 + 생존 상태 통합) =================
socket.on("players", players => {

    if (!joinedRoom) return;

    const myData = players[socket.id];
    if (myData) {
        myHp = myData.hp;
        myMaxHp = myData.maxHp || myMaxHp;
        myHpBar.style.width = Math.max(0, (myHp / myMaxHp) * 50) + "px";

        if (myData.lives !== myLives) {
            myLives = myData.lives;
            renderLives();
        }
    }

    for (const id in players) {

        if (id === socket.id) continue;

        const pdata = players[id];

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

        otherPlayers[id].worldX = pdata.x;
        otherPlayers[id].worldY = pdata.y;

        // 죽었거나(관전 중) 탈락한 상대는 화면에서 숨김
        const shouldShow = pdata.alive && !pdata.eliminated;
        otherPlayers[id].el.style.display = shouldShow ? "block" : "none";

        if (shouldShow) {
            placeAtWorld(otherPlayers[id].el, pdata.x, pdata.y);
        }

        // 체력바
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

        hpBars[id].style.display = shouldShow ? "block" : "none";

        if (shouldShow) {
            const maxHp = pdata.maxHp || 100;
            hpBars[id].style.width = Math.max(0, (pdata.hp / maxHp) * 50) + "px";
            placeAtWorld(hpBars[id], pdata.x, pdata.y - 12);
        }
    }

    for (const id in otherPlayers) {
        if (!players[id]) {
            otherPlayers[id].el.remove();
            delete otherPlayers[id];
            if (hpBars[id]) {
                hpBars[id].remove();
                delete hpBars[id];
            }
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

// ================= GAME STARTED (맵/캐릭터 초기 세팅, 아직 라운드 시작 전) =================
socket.on("gameStarted", (data) => {

    lobby.style.display = "none";

    if (data.map) {
        MAP_WIDTH = data.map.width;
        MAP_HEIGHT = data.map.height;
    }

    startingLives = data.startingLives || 3;
    myLives = startingLives;

    mapEl.style.width = MAP_WIDTH + "px";
    mapEl.style.height = MAP_HEIGHT + "px";
    mapEl.style.display = "block";

    player.style.display = "block";
    myHpBar.style.display = "block";
    livesBar.style.display = "block";

    const myData = data.players[socket.id];

    if (!myData || !myData.characterId || !data.characters[myData.characterId]) {
        console.error("gameStarted: 내 캐릭터 정보를 찾을 수 없습니다.", myData, data.characters);
        return;
    }

    const myChar = data.characters[myData.characterId];

    myCharSpeed = myChar.speed;
    myMaxHp = myChar.hp;

    player.style.background = myChar.color;

    roomTop.innerText = "ROOM: " + myRoomCode;

    renderLives();

    joinedRoom = true;
    canMove = false;
    isAlive = true;
    isEliminated = false;
});

// ================= ROUND STARTING (위치 리셋 + 카운트다운 시작) =================
socket.on("roundStarting", (data) => {

    canMove = false;
    isAlive = true;
    spectatorEl.style.display = "none";
    roundResultEl.style.display = "none";

    clearAllBullets();

    const myData = data.players[socket.id];

    if (myData) {
        x = myData.x;
        y = myData.y;
        myHp = myData.hp;
        myMaxHp = myData.maxHp;
        isEliminated = !!myData.eliminated;

        myHpBar.style.width = (myHp / myMaxHp) * 50 + "px";

        updateCamera();
        placeAtWorld(player, x, y);
        placeAtWorld(myHpBar, x, y - 12);
        placeAtWorld(mapEl, 0, 0);

        player.style.display = isEliminated ? "none" : "block";
        myHpBar.style.display = isEliminated ? "none" : "block";

        if (isEliminated) {
            spectatorEl.innerText = "탈락했습니다. 게임 종료까지 관전합니다.";
            spectatorEl.style.display = "block";
        }
    }

    countdownEl.style.display = "flex";
    countdownEl.innerText = data.countdown;
});

socket.on("countdownTick", (remaining) => {
    countdownEl.innerText = remaining > 0 ? remaining : "";
});

socket.on("roundFightStart", () => {
    countdownEl.style.display = "none";
    canMove = true;
});

// ================= ROUND END =================
socket.on("roundEnd", (data) => {

    canMove = false;

    const winnerLabel = data.roundWinnerId === socket.id ? "당신이 이 라운드에서 승리했습니다!" :
                         data.roundWinnerId ? "이 라운드는 다른 플레이어가 승리했습니다." :
                         "이 라운드는 무승부입니다.";

    roundResultEl.innerText = winnerLabel;
    roundResultEl.style.display = "block";

    const myData = data.players[socket.id];
    if (myData) {
        isEliminated = !!myData.eliminated;
        if (myData.lives !== myLives) {
            myLives = myData.lives;
            renderLives();
        }
    }
});

// ================= GAME OVER =================
socket.on("gameOver", ({ winnerId }) => {

    joinedRoom = false;
    canMove = false;

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

// ================= DEAD (이번 라운드에서 죽음 -> 관전 전환) =================
socket.on("dead", ({ livesLeft }) => {

    isAlive = false;
    myLives = livesLeft;
    renderLives();

    player.style.display = "none";
    myHpBar.style.display = "none";

    spectatorEl.innerText = "관전 중... 다음 라운드를 기다려주세요";
    spectatorEl.style.display = "block";
});