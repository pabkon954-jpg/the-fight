const express = require("express");
const app = express();
const http = require("http").createServer(app);
const io = require("socket.io")(http);

app.use(express.static(__dirname));

const players = {};
const bullets = {};
const HP = {};

const MAX_HP = 100;

// ======================
// 플레이어 연결
// ======================
io.on("connection", (socket) => {

    players[socket.id] = { x: 100, y: 100 };
    HP[socket.id] = MAX_HP;

    socket.emit("hpUpdate", HP);
    io.emit("players", players);

    // 이동
    socket.on("move", (data) => {
        players[socket.id] = data;
    });

    // 발사
    socket.on("shoot", (data) => {

        const bulletId = socket.id + "_" + Date.now();

        bullets[bulletId] = {
            owner: socket.id,
            x: data.startX,
            y: data.startY,
            vx: data.vx,
            vy: data.vy
        };

        socket.broadcast.emit("shoot", data);
    });

    // 나가기
    socket.on("disconnect", () => {
        delete players[socket.id];
        delete HP[socket.id];

        io.emit("players", players);
        io.emit("hpUpdate", HP);
    });
});


// ======================
// 게임 루프 (핵심)
// ======================
setInterval(() => {

    for (const id in bullets) {

        const b = bullets[id];

        b.x += b.vx;
        b.y += b.vy;

        for (const pid in players) {

            if (pid === b.owner) continue;

            const p = players[pid];

            // 플레이어 중심 보정
            const px = p.x + 25;
            const py = p.y + 25;

            const dx = px - b.x;
            const dy = py - b.y;

            const dist = Math.sqrt(dx * dx + dy * dy);

            if (dist < 20) {

                HP[pid] -= 10;

                delete bullets[id];

                // 죽음 처리
                if (HP[pid] <= 0) {
                    HP[pid] = 0;

                    delete players[pid];
                    delete HP[pid];

                    io.to(pid).emit("dead");
                }

                break;
            }
        }

        // 화면 밖 제거
        if (
            b.x < -100 || b.x > 3000 ||
            b.y < -100 || b.y > 3000
        ) {
            delete bullets[id];
        }
    }

    io.emit("players", players);
    io.emit("hpUpdate", HP);

}, 16);


// ======================
// 서버 시작 (Render 필수)
// ======================
const PORT = process.env.PORT || 3000;

http.listen(PORT, () => {
    console.log("Server running on port " + PORT);
});