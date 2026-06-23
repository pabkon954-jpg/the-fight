const player = document.getElementById("player");
const socket = io();

let x = 100;
let y = 100;
const speed = 5;

const keys = {};
const otherPlayers = {};
const hpBars = {};

// 키 입력
document.addEventListener("keydown", (e) => {
    keys[e.key.toLowerCase()] = true;
});

document.addEventListener("keyup", (e) => {
    keys[e.key.toLowerCase()] = false;
});

// 이동
function gameLoop() {

    if (keys["w"]) y -= speed;
    if (keys["s"]) y += speed;
    if (keys["a"]) x -= speed;
    if (keys["d"]) x += speed;

    player.style.left = x + "px";
    player.style.top = y + "px";

    socket.emit("move", { x, y });

    requestAnimationFrame(gameLoop);
}
gameLoop();

// 총알
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
            bx < 0 || bx > window.innerWidth ||
            by < 0 || by > window.innerHeight
        ) {
            bullet.remove();
            return;
        }

        requestAnimationFrame(move);
    }

    move();
}

// 발사
document.addEventListener("click", (e) => {

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

// 플레이어
socket.on("players", (players) => {

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

            if (hpBars[id]) {
                hpBars[id].remove();
                delete hpBars[id];
            }
        }
    }
});

// HP
socket.on("hpUpdate", (hpData) => {

    for (const id in hpData) {

        if (id === socket.id) continue;

        if (!hpBars[id]) {

            const bar = document.createElement("div");

            bar.style.width = "50px";
            bar.style.height = "5px";
            bar.style.background = "red";
            bar.style.position = "absolute";

            document.body.appendChild(bar);

            hpBars[id] = bar;
        }

        hpBars[id].style.width = hpData[id] + "%";
    }
});

// 총알 다른 사람
socket.on("shoot", (data) => {
    createBullet(
        data.startX,
        data.startY,
        data.startX + data.vx * 10,
        data.startY + data.vy * 10,
        "orange"
    );
});

// 죽음
socket.on("dead", () => {
    alert("You Died!");
    location.reload();
});