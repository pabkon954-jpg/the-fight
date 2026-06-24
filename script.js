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

// 클라이언트 쪽 캐릭터 표시 정보 (서버 스탯과 매칭되는 id 사용)
// 서버의 CHARACTERS 객체와 id가 일치해야 함
const CHARACTER_DISPLAY = {
    warrior: { name: "전사", color: "crimson", statsText: "체력 120 · 속도 보통" },
    scout:   { name: "스카우트", color: "deepskyblue", statsText: "체력 80 · 속도 빠름" }
};

let myRoomCode = null;
let isHost = false;
let selectedCharacter = null;

// 게임 화면(player div)은 로비/메뉴 단계에서는 숨김
player.style.display = "none";

// ================= UI 초기화: 캐릭터 카드 렌더링 =================
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

// ================= 로비 플레이어 목록 렌더링 =================
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

    // 시작 버튼: 방장만, 그리고 (편의상) 2명 이상 + 전원 ready일 때만 활성화 표시
    // 최종 검증은 서버에서 한 번 더 하므로 여기는 UX용
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

// ================= LOBBY UPDATE (서버 → 클라이언트) =================
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

// ================= GAME STARTED (다음 단계에서 게임 화면 로직과 연결) =================
socket.on("gameStarted", (data) => {
    lobby.style.display = "none";
    player.style.display = "block";

    // 여기서부터는 기존 게임 로직(이동/슈팅/충돌)이 이어집니다.
    // 캐릭터 스탯(data.characters[내캐릭터].speed 등)을 이동 속도에 반영하는 부분은
    // 게임 화면 로직을 연결할 때 함께 작업하면 됩니다.
    console.log("게임 시작!", data);
});