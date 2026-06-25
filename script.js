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
roomTop.style.position = "absolute";
roomTop.style.top = "10px";
roomTop.style.left = "10px";
roomTop.style.color = "white";
roomTop.style.fontSize = "20px";
roomTop.style.zIndex = "5";
document.body.appendChild(roomTop);

// ================= STATE =================
let joinedRoom = false;   // 게임이 실제로 시작된 상태인지 (로비 X, 게임 O)
let dead = false;

let myRoomCode = null;
let isHost = false;
let selectedCharacter = null;
let myCharSpeed = 5;  // 캐릭터 스탯 반영 전 기본값
let myMaxHp = 100;     // 캐릭터 스탯 반영 전 기본값 (※ 사용 전에 미리 선언)

let x = 100;
let y = 100;

let bulletSeq = 0; // 총알 고유 id를 위한 카운터

const keys = {};
const otherPlayers = {};
const hpBars = {};
const bullets = {};

// 게임 화면 요소들은 로비/메뉴 단계에서는 보이지 않도록 처음에 숨김
player.style.display = "none";

// ================= HP =================
let myHp = 100;

const myHpBar = document.createElement("div");
myHpBar.style.width = "50px";
myHpBar.style.height = "6px";
myHpBar.style.background = "lime";
myHpBar.style.position = "absolute";
myHpBar.style.borderRadius = "3px";
myHpBar.style.display = "none";
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

    player.style.left = x + "px";
    player.style.top = y + "px";

    myHpBar.style.left = x + "px";
    myHpBar.style.top = (y - 12) + "px";

    socket.emit("move", { x, y });
}
loop();

// ================= BULLET =================
function createBullet(id, sx, sy, tx, ty, color) {

    if (bullets[id]) return;

    const bullet = document.createElement("div");
    bullet.style.width = "10px";
    bullet.style.height = "10px";
    bullet.style.background = color;
    bullet.style.position = "absolute";
    bullet.style.borderRadius = "50%";

    document.body.appendChild(bullet);

    const dx = tx - sx;
    const dy = ty - sy;
    const len = Math.sqrt(dx * dx + dy * dy) || 1;

    const vx = (dx / len) * 10;
    const vy = (dy / len) * 10;

    bullets[id] = bullet;

    let bx = sx;
    let by = sy;

    function move() {

        if (!bullets[id] || dead) return;

        bx += vx;
        by += vy;

        bullet.style.left = bx + "px";
        bullet.style.top = by + "px";

        if (
            bx < -100 || bx > window.innerWidth + 100 ||
            by < -100 || by > window.innerHeight + 100
        ) {
            bullet.remove();
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

    const sx = x + 25;
    const sy = y + 25;

    const dx = e.clientX - sx;
    const dy = e.clientY - sy;

    const len = Math.sqrt(dx * dx + dy * dy) || 1;

    const id = socket.id + "_" + (bulletSeq++);

    createBullet(id, sx, sy, e.clientX, e.clientY, "yellow");

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
            document.body.appendChild(div);
            otherPlayers[id] = div;
        }

        otherPlayers[id].style.left = players[id].x + "px";
        otherPlayers[id].style.top = players[id].y + "px";
    }

    for (const id in otherPlayers) {
        if (!players[id]) {
            otherPlayers[id].remove();
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
            document.body.appendChild(bar);
            hpBars[id] = bar;
        }

        hpBars[id].style.width = (hpData[id] / 100) * 50 + "px";

        if (otherPlayers[id]) {
            hpBars[id].style.left = otherPlayers[id].style.left;
            hpBars[id].style.top =
                (parseInt(otherPlayers[id].style.top) - 12) + "px";
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

    player.style.display = "block";
    myHpBar.style.display = "block";

    const myData = data.players[socket.id];
    const myChar = data.characters[myData.characterId];

    // 캐릭터 스탯 반영
    myCharSpeed = myChar.speed;
    myMaxHp = myChar.hp;

    x = myData.x;
    y = myData.y;
    myHp = myData.hp;

    player.style.background = myChar.color;
    player.style.left = x + "px";
    player.style.top = y + "px";

    myHpBar.style.width = (myHp / myMaxHp) * 50 + "px";
    myHpBar.style.left = x + "px";
    myHpBar.style.top = (y - 12) + "px";

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
    joinedRoom = false; // 업데이트 차단

    player.style.display = "none";
    myHpBar.remove();

    for (const id in hpBars) {
        hpBars[id].remove();
        delete hpBars[id];
    }

    for (const id in otherPlayers) {
        otherPlayers[id].remove();
        delete otherPlayers[id];
    }

    for (const id in bullets) {
        bullets[id].remove();
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