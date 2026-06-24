const player = document.getElementById("player");
const socket = io();

const createRoomBtn = document.getElementById("createRoomBtn");
const joinRoomBtn = document.getElementById("joinRoomBtn");
const roomInput = document.getElementById("roomInput");
const menu = document.getElementById("menu");

// ================= STATE =================
let joinedRoom = false;
let dead = false;

let myRoomCode = null;

let x = 100;
let y = 100;

let myCharSpeed = 5;
let myMaxHp = 100;
let myHp = 100;

let bulletSeq = 0;

const keys = {};
const otherPlayers = {};
const hpBars = {};
const bullets = {};

// ================= 🔥 FIX 1: 노란 원(플레이어 잔상) 제거 =================
player.style.display = "none";
player.style.position = "absolute";
player.style.width = "50px";
player.style.height = "50px";
player.style.background = "lime";
player.style.left = "100px";
player.style.top = "100px";

// ================= HP BAR =================
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

// ================= REMOTE SHOOT =================
socket.on("shoot", (data) => {

    if (!joinedRoom || dead) return;
    if (data.owner === socket.id) return;

    createBullet(
        data.id,
        data.x,
        data.y,
        data.x + data.vx * 80,
        data.y + data.vy * 80,
        "red"
    );
});

// ================= PLAYERS =================
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
});

// ================= 🔥 FIX 2: 방 생성/입장 문제 해결 =================
function enterRoom(code) {
    myRoomCode = code;

    menu.style.display = "none";

    player.style.display = "block";
    myHpBar.style.display = "block";

    joinedRoom = true;
}

createRoomBtn.onclick = () => socket.emit("createRoom");
joinRoomBtn.onclick = () => {
    const code = roomInput.value.trim();
    if (!code) return;
    socket.emit("joinRoom", code);
};

// 🔥 서버 응답 없으면 “방 안 만들어진 것처럼 보임” 문제 해결
socket.on("roomCreated", enterRoom);
socket.on("roomJoined", enterRoom);

// ================= DEAD =================
socket.on("dead", () => {

    if (dead) return;

    dead = true;
    joinedRoom = false;

    player.style.display = "none";
    myHpBar.remove();

    for (const id in hpBars) hpBars[id].remove();
    for (const id in otherPlayers) otherPlayers[id].remove();
    for (const id in bullets) bullets[id].remove();

    const screen = document.createElement("div");
    screen.style.position = "fixed";
    screen.style.inset = "0";
    screen.style.background = "rgba(0,0,0,0.9)";
    screen.style.color = "white";
    screen.style.display = "flex";
    screen.style.justifyContent = "center";
    screen.style.alignItems = "center";
    screen.style.fontSize = "40px";

    screen.innerHTML = `
        <div>YOU DIED</div>
        <button onclick="location.reload()">Respawn</button>
    `;

    document.body.appendChild(screen);
});