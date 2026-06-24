const player = document.getElementById("player");
const socket = io();

const createRoomBtn = document.getElementById("createRoomBtn");
const joinRoomBtn = document.getElementById("joinRoomBtn");
const roomInput = document.getElementById("roomInput");
const roomInfo = document.getElementById("roomInfo");

let joinedRoom = false;

let x = 100;
let y = 100;
const speed = 5;

let dead = false;

const keys = {};
const otherPlayers = {};
const hpBars = {};

let myHp = 100;

// HP bar
const myHpBar = document.createElement("div");
myHpBar.style.width = "50px";
myHpBar.style.height = "6px";
myHpBar.style.background = "lime";
myHpBar.style.position = "absolute";
myHpBar.style.borderRadius = "3px";
document.body.appendChild(myHpBar);

// ================= KEY =================
document.addEventListener("keydown", (e) => keys[e.key.toLowerCase()] = true);
document.addEventListener("keyup", (e) => keys[e.key.toLowerCase()] = false);

// ================= MOVE =================
function gameLoop() {
    if (dead) return;
    if (!joinedRoom) {
        requestAnimationFrame(gameLoop);
        return;
    }

    if (keys["w"]) y -= speed;
    if (keys["s"]) y += speed;
    if (keys["a"]) x -= speed;
    if (keys["d"]) x += speed;

    player.style.left = x + "px";
    player.style.top = y + "px";

    myHpBar.style.left = x + "px";
    myHpBar.style.top = (y - 12) + "px";

    socket.emit("move", { x, y });

    requestAnimationFrame(gameLoop);
}
gameLoop();

// ================= BULLET =================
function createBullet(sx, sy, tx, ty, color) {
    const bullet = document.createElement("div");

    bullet.style.width = "10px";
    bullet.style.height = "10px";
    bullet.style.background = color;
    bullet.style.borderRadius = "50%";
    bullet.style.position = "absolute";

    bullet.style.left = sx + "px";
    bullet.style.top = sy + "px";

    document.body.appendChild(bullet);

    const dx = tx - sx;
    const dy = ty - sy;
    const len = Math.sqrt(dx * dx + dy * dy);

    const vx = (dx / len) * 10;
    const vy = (dy / len) * 10;

    function move() {
        let bx = parseFloat(bullet.style.left);
        let by = parseFloat(bullet.style.top);

        bx += vx;
        by += vy;

        bullet.style.left = bx + "px";
        bullet.style.top = by + "px";

        if (
            bx < -100 || bx > window.innerWidth + 100 ||
            by < -100 || by > window.innerHeight + 100
        ) {
            bullet.remove();
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

    const len = Math.sqrt(dx * dx + dy * dy);

    const vx = (dx / len) * 10;
    const vy = (dy / len) * 10;

    createBullet(sx, sy, e.clientX, e.clientY, "yellow");

    socket.emit("shoot", {
        startX: sx,
        startY: sy,
        vx,
        vy
    });
});

// ================= PLAYERS =================
socket.on("players", (players) => {

    for (const id in players) {
        if (id === socket.id) continue;

        if (!otherPlayers[id]) {
            const div = document.createElement("div");

            div.style.width = "50px";
            div.style.height = "50px";
            div.style.background = "lime";
            div.style.borderRadius = "50%";
            div.style.position = "absolute";

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
socket.on("hpUpdate", (hpData) => {
    if (hpData[socket.id] !== undefined) {
        myHp = hpData[socket.id];
        myHpBar.style.width = ((myHp / 100) * 50) + "px";
    }
});

// ================= ROOM =================
createRoomBtn.addEventListener("click", () => {
    socket.emit("createRoom");
});

joinRoomBtn.addEventListener("click", () => {
    const code = roomInput.value.trim();
    if (!code) return;

    socket.emit("joinRoom", code);
});

// 방 생성 성공
socket.on("roomCreated", (code) => {
    joinedRoom = true;
    roomInfo.innerHTML = "방 생성됨: " + code;
});

// 방 참가 성공
socket.on("roomJoined", (code) => {
    joinedRoom = true;
    roomInfo.innerHTML = "입장: " + code;
});

// 실패
socket.on("roomNotFound", () => {
    alert("방 없음");
});