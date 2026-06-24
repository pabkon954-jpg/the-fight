const player = document.getElementById("player");
const socket = io();

const createRoomBtn = document.getElementById("createRoomBtn");
const joinRoomBtn = document.getElementById("joinRoomBtn");
const roomInput = document.getElementById("roomInput");
const menu = document.getElementById("menu");

// ================= ROOM UI =================
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

let myHp = 100;

// ================= HP BAR =================
const myHpBar = document.createElement("div");
myHpBar.style.width = "50px";
myHpBar.style.height = "6px";
myHpBar.style.background = "lime";
myHpBar.style.position = "absolute";
myHpBar.style.borderRadius = "3px";
document.body.appendChild(myHpBar);

// ================= INPUT =================
document.addEventListener("keydown", (e) => {
    keys[e.key.toLowerCase()] = true;
});

document.addEventListener("keyup", (e) => {
    keys[e.key.toLowerCase()] = false;
});

// ================= GAME LOOP =================
function gameLoop() {

    requestAnimationFrame(gameLoop);

    if (dead || !joinedRoom) return;

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

    // 내 체력
    if (hpData[socket.id] !== undefined) {
        myHp = hpData[socket.id];
        myHpBar.style.width = ((myHp / 100) * 50) + "px";
    }

    // 🔥 상대 HP 추가
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

        hpBars[id].style.width =
            ((hpData[id] / 100) * 50) + "px";

        if (otherPlayers[id]) {
            hpBars[id].style.left = otherPlayers[id].style.left;
            hpBars[id].style.top =
                (parseInt(otherPlayers[id].style.top) - 12) + "px";
        }
    }
});

// ================= ROOM =================
function enterRoomUI(code) {

    joinedRoom = true;

    menu.style.display = "none";
    roomTop.innerText = "ROOM: " + code;
}

createRoomBtn.addEventListener("click", () => {
    socket.emit("createRoom");
});

joinRoomBtn.addEventListener("click", () => {
    const code = roomInput.value.trim();
    if (!code) return;

    socket.emit("joinRoom", code);
});

// ================= EVENTS =================
socket.on("roomCreated", (code) => {
    enterRoomUI(code);
});

socket.on("roomJoined", (code) => {
    enterRoomUI(code);
});

socket.on("roomNotFound", () => {
    alert("방 없음");
});

// ================= DEAD =================
socket.on("dead", () => {

    if (dead) return;
    dead = true;

    myHpBar.remove(); // 🔥 이게 더 확실함

    for (const id in hpBars) {
        hpBars[id].remove();
    }

    for (const id in otherPlayers) {
        otherPlayers[id].remove();
    }

    const screen = document.createElement("div");
    screen.style.position = "fixed";
    screen.style.top = "0";
    screen.style.left = "0";
    screen.style.width = "100%";
    screen.style.height = "100%";
    screen.style.background = "rgba(0,0,0,0.9)";
    screen.style.color = "white";
    screen.style.display = "flex";
    screen.style.justifyContent = "center";
    screen.style.alignItems = "center";
    screen.style.flexDirection = "column";
    screen.style.fontSize = "40px";

    screen.innerHTML = `
        <div>YOU DIED</div>
        <button id="respawnBtn" style="margin-top:20px;font-size:20px;padding:10px;">
            Respawn
        </button>
    `;

    document.body.appendChild(screen);

    document.getElementById("respawnBtn").onclick = () => {
        location.reload();
    };
});