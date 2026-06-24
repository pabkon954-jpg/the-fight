const player = document.getElementById("player");
const socket = io();

const createRoomBtn = document.getElementById("createRoomBtn");
const joinRoomBtn = document.getElementById("joinRoomBtn");
const roomInput = document.getElementById("roomInput");
const menu = document.getElementById("menu");

const roomTop = document.createElement("div");
roomTop.style.position = "absolute";
roomTop.style.top = "10px";
roomTop.style.left = "10px";
roomTop.style.color = "white";
roomTop.style.fontSize = "20px";
document.body.appendChild(roomTop);

// ================= STATE =================
let joinedRoom = false;
let dead = false;

let x = 100;
let y = 100;
const speed = 5;

const keys = {};
const otherPlayers = {};
const hpBars = {};
const bullets = {};

// ================= HP =================
let myHp = 100;

const myHpBar = document.createElement("div");
myHpBar.style.width = "50px";
myHpBar.style.height = "6px";
myHpBar.style.background = "lime";
myHpBar.style.position = "absolute";
document.body.appendChild(myHpBar);

// ================= INPUT =================
document.addEventListener("keydown", e => keys[e.key.toLowerCase()] = true);
document.addEventListener("keyup", e => keys[e.key.toLowerCase()] = false);

// ================= LOOP =================
function loop() {
    requestAnimationFrame(loop);

    if (!joinedRoom || dead) return;

    if (keys["w"]) y -= speed;
    if (keys["s"]) y += speed;
    if (keys["a"]) x -= speed;
    if (keys["d"]) x += speed;

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
        if (!bullets[id]) return;

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

    const id = socket.id + "_" + Date.now();

    createBullet(id, sx, sy, e.clientX, e.clientY, "yellow");

    socket.emit("shoot", {
        startX: sx,
        startY: sy,
        vx: (dx / len) * 10,
        vy: (dy / len) * 10
    });
});
// ================= REMOTE SHOOT (상대방 총알) =================
socket.on("shoot", (data) => {

    // 내가 쏜 총알은 이미 클라이언트에서 직접 그렸으므로 중복 생성 방지
    if (data.owner === socket.id) return;

    if (!joinedRoom || dead) return;

    // 서버에서 받은 vx, vy로 목표 지점을 역산해서 createBullet에 맞춰 호출
    const targetX = data.x + data.vx * 100;
    const targetY = data.y + data.vy * 100;

    createBullet(data.id, data.x, data.y, targetX, targetY, "red");
});
// ================= PLAYERS =================
socket.on("players", players => {

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

    if (dead) return;

    if (hpData[socket.id] !== undefined) {
        myHp = hpData[socket.id];
        myHpBar.style.width = (myHp / 100) * 50 + "px";
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
    // ⭐ 추가: hpData에 더 이상 없는 플레이어의 hpBar 제거
    for (const id in hpBars) {
        if (hpData[id] === undefined) {
            hpBars[id].remove();
            delete hpBars[id];
        }
    }
});

// ================= ROOM =================
function enterRoom(code) {
    joinedRoom = true;
    dead = false;
    menu.style.display = "none";
    roomTop.innerText = "ROOM: " + code;
}

createRoomBtn.onclick = () => socket.emit("createRoom");

joinRoomBtn.onclick = () => {
    const code = roomInput.value.trim();
    if (!code) return;
    socket.emit("joinRoom", code);
};

socket.on("roomCreated", enterRoom);
socket.on("roomJoined", enterRoom);

// ================= DEAD =================
socket.on("dead", () => {

    if (dead) return;
    dead = true;
    joinedRoom = false;

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
    screen.style.flexDirection = "column";
    screen.style.fontSize = "40px";

    screen.innerHTML = `
        <div>YOU DIED</div>
        <button id="respawnBtn" style="margin-top:20px;padding:10px;">
            Respawn
        </button>
    `;

    document.body.appendChild(screen);

    document.getElementById("respawnBtn").onclick = () => location.reload();
});