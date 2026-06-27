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

// 캐릭터 얼굴을 표현하는 SVG (게임 화면의 원형 캐릭터 위에도 동일하게 사용)
function monkeyFaceSVG() {
    return `
        <svg viewBox="0 0 100 100" width="100%" height="100%" preserveAspectRatio="xMidYMid meet">
            <circle cx="50" cy="50" r="48" fill="#8a5a2b"/>
            <circle cx="20" cy="32" r="14" fill="#8a5a2b"/>
            <circle cx="80" cy="32" r="14" fill="#8a5a2b"/>
            <circle cx="20" cy="32" r="8" fill="#caa172"/>
            <circle cx="80" cy="32" r="8" fill="#caa172"/>
            <ellipse cx="50" cy="62" rx="30" ry="26" fill="#e8c9a0"/>
            <circle cx="36" cy="48" r="6" fill="#2b1a0f"/>
            <circle cx="64" cy="48" r="6" fill="#2b1a0f"/>
            <ellipse cx="50" cy="68" rx="10" ry="7" fill="#caa172"/>
            <path d="M 40 76 Q 50 84 60 76" stroke="#2b1a0f" stroke-width="3" fill="none" stroke-linecap="round"/>
        </svg>
    `;
}

// 서버 CHARACTERS와 id가 일치해야 함 (표시용 정보)
const CHARACTER_DISPLAY = {
    warrior: { name: "전사", color: "crimson", statsText: "체력 120 · 속도 보통" },
    scout:   { name: "스카우트", color: "deepskyblue", statsText: "체력 80 · 속도 빠름" },
    monkey:  {
        name: "원숭이", color: "#8a5a2b", statsText: "체력 400 · 속도 매우 빠름", faceSVG: monkeyFaceSVG,
        skillUI: {
            skill1: { key: "Q", icon: "🍌", cooldownSec: 5 },
            skill2: { key: "E", icon: "🍌", cooldownSec: 7 },
            skill3: { key: "R", icon: "🐾", cooldownSec: 20 }
        }
    }
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

const mapEl = document.getElementById("mapBackground");

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

// 캐릭터 div에 색/SVG 얼굴을 적용 (내 캐릭터 + 상대 캐릭터 공용)
function applyCharacterAppearance(el, characterId) {
    const info = CHARACTER_DISPLAY[characterId];
    if (!info) return;

    if (info.faceSVG) {
        el.style.background = "#222";
        el.innerHTML = info.faceSVG();
    } else {
        el.style.background = info.color;
        el.innerHTML = "";
    }
}

// ================= SKILL BAR UI =================
const skillBarEl = document.getElementById("skillBar");

function setupSkillBarUI(characterId) {

    skillBarEl.innerHTML = "";
    for (const key in skillSlotEls) delete skillSlotEls[key];

    const info = CHARACTER_DISPLAY[characterId];

    if (!info || !info.skillUI) {
        skillBarEl.style.display = "none";
        return;
    }

    skillBarEl.style.display = "flex";

    for (const skillKey in info.skillUI) {
        const skill = info.skillUI[skillKey];

        const slot = document.createElement("div");
        slot.className = "skill-slot";

        const keyLabel = document.createElement("div");
        keyLabel.className = "key-label";
        keyLabel.innerText = skill.key;

        const icon = document.createElement("div");
        icon.className = "skill-icon";
        icon.innerText = skill.icon;

        const overlay = document.createElement("div");
        overlay.className = "cooldown-overlay";

        const text = document.createElement("div");
        text.className = "cooldown-text";

        slot.appendChild(keyLabel);
        slot.appendChild(icon);
        slot.appendChild(overlay);
        slot.appendChild(text);
        skillBarEl.appendChild(slot);

        skillSlotEls[skillKey] = { root: slot, overlay, text, cooldownSec: skill.cooldownSec };
    }
}

function updateSkillCooldownUI(cooldowns) {
    for (const skillKey in skillSlotEls) {
        const slotInfo = skillSlotEls[skillKey];
        const remainingMs = cooldowns[skillKey] || 0;

        if (remainingMs > 0) {
            const pct = Math.min(100, (remainingMs / (slotInfo.cooldownSec * 1000)) * 100);
            slotInfo.overlay.style.height = pct + "%";
            slotInfo.text.style.display = "block";
            slotInfo.text.innerText = Math.ceil(remainingMs / 1000);
        } else {
            slotInfo.overlay.style.height = "0%";
            slotInfo.text.style.display = "none";
        }
    }
}

// ================= STATE =================
let joinedRoom = false;     // 게임이 시작된 상태(로비 X)
let canMove = false;        // 카운트다운이 끝나고 전투 중인지
let isAlive = true;         // 이번 라운드에서 살아있는지 (죽으면 관전)
let isEliminated = false;   // 목숨 0 -> 게임에서 완전 탈락

let myRoomCode = null;
let isHost = false;
let selectedCharacter = null;
let myCharacterId = null;
let myCharSpeed = 5;
let myBaseSpeed = 5;   // 패시브 적용 전 기본 속도 (서버 currentSpeed가 null일 때 사용)
let myMaxHp = 100;

// ===== 스킬 관련 상태 =====
let myStunnedUntil = 0;       // 클라이언트 로컬 기준 기절 종료 시각(서버 값과 동기화됨)
let isBlinded = false;
let blindTimeoutHandle = null;
const skillSlotEls = {};      // { skill1: { root, overlay, text }, ... }

let x = 100;
let y = 100;

let bulletSeq = 0;

const keys = {};
const otherPlayers = {};   // { id: { el, worldX, worldY } }
const hpBars = {};
const bullets = {};        // { id: { el, worldX, worldY, vx, vy } }
const traps = {};          // { id: { el } } - 스킬2 바나나 트랩 표시용
const stunIcons = {};      // { playerId: el } - 기절 이펙트 표시용

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

// ⭐ 창/탭 포커스를 잃거나 다시 얻을 때 키 상태를 전부 초기화
// (클릭으로 포커스가 옮겨가서 keyup이 누락되면 키가 "눌린 채로 고정"되는 버그 방지)
function resetAllKeys() {
    for (const k in keys) keys[k] = false;
}

window.addEventListener("blur", resetAllKeys);
document.addEventListener("visibilitychange", () => {
    if (document.hidden) resetAllKeys();
});
window.addEventListener("focus", resetAllKeys);

// ================= SKILL USE (Q/E/R) =================
function canUseSkillsNow() {
    return joinedRoom && canMove && isAlive && !isEliminated && Date.now() >= myStunnedUntil;
}

function useSkill(skillKey) {

    if (!canUseSkillsNow()) return;
    if (myCharacterId !== "monkey") return; // 스킬은 원숭이 전용

    const targetWorldX = lastMouseX + camX;
    const targetWorldY = lastMouseY + camY;

    const sx = x + 25;
    const sy = y + 25;

    const dx = targetWorldX - sx;
    const dy = targetWorldY - sy;
    const len = Math.sqrt(dx * dx + dy * dy) || 1;
    const ndx = dx / len;
    const ndy = dy / len;

    if (skillKey === "skill1") {
        // 바나나 투척 (서버가 데미지/효과 처리, 클라이언트는 투사체 표시만)
        const id = "skill1_" + socket.id + "_" + Date.now();
        createBullet(id, sx, sy, targetWorldX, targetWorldY, "#f5d547");

        socket.emit("useSkill", {
            skillKey,
            startX: sx,
            startY: sy,
            vx: ndx * 9,
            vy: ndy * 9
        });

    } else if (skillKey === "skill2") {
        // 바나나 트랩 설치 (내 위치에 설치)
        socket.emit("useSkill", {
            skillKey,
            x: sx,
            y: sy
        });

    } else if (skillKey === "skill3") {
        // 돌진 할퀴기 (마우스 방향으로 돌진)
        socket.emit("useSkill", {
            skillKey,
            dirX: ndx,
            dirY: ndy
        });
    }
}

document.addEventListener("keydown", (e) => {
    const k = e.key.toLowerCase();
    if (k === "q") useSkill("skill1");
    else if (k === "e") useSkill("skill2");
    else if (k === "r") useSkill("skill3");
});

// ================= LOOP =================
function loop() {
    requestAnimationFrame(loop);

    if (!joinedRoom) return;

    // ⭐ 카운트다운 중이거나 죽어서 관전 중이거나 기절 중이면 이동 불가
    const stunned = Date.now() < myStunnedUntil;

    if (canMove && isAlive && !isEliminated && !stunned) {
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

    for (const id in traps) {
        placeAtWorld(traps[id].el, traps[id].worldX, traps[id].worldY);
    }

    for (const pid in stunIcons) {
        const target = pid === socket.id
            ? { worldX: x, worldY: y }
            : otherPlayers[pid];
        if (target) {
            placeAtWorld(stunIcons[pid], target.worldX, target.worldY - 30);
        }
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

// ================= MOUSE TRACKING (스킬 방향 계산용) =================
let lastMouseX = window.innerWidth / 2;
let lastMouseY = window.innerHeight / 2;

document.addEventListener("mousemove", (e) => {
    lastMouseX = e.clientX;
    lastMouseY = e.clientY;
});

// ================= SHOOT (기본공격) =================
document.addEventListener("click", (e) => {

    if (!joinedRoom || !canMove || !isAlive || isEliminated) return;
    if (Date.now() < myStunnedUntil) return;

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

    const color = data.isSkill1 ? "#f5d547" : "red";

    createBullet(data.id, data.x, data.y, targetX, targetY, color);
});

// ================= TRAP (스킬2 바나나 설치) =================
function createTrapVisual(id, worldX, worldY) {

    const el = document.createElement("div");
    el.style.width = "26px";
    el.style.height = "20px";
    el.style.position = "absolute";
    el.style.zIndex = "1";
    el.style.fontSize = "20px";
    el.style.lineHeight = "20px";
    el.style.textAlign = "center";
    el.innerText = "🍌";

    document.body.appendChild(el);

    traps[id] = { el, worldX, worldY };
    placeAtWorld(el, worldX, worldY);
}

function removeTrapVisual(id) {
    if (traps[id]) {
        traps[id].el.remove();
        delete traps[id];
    }
}

socket.on("trapPlaced", (data) => {
    createTrapVisual(data.id, data.x, data.y);
});

socket.on("trapExpired", (data) => {
    removeTrapVisual(data.id);
});

// ================= STUN (기절 이펙트) =================
function showStunIcon(playerId, duration) {

    if (stunIcons[playerId]) {
        stunIcons[playerId].remove();
        delete stunIcons[playerId];
    }

    const el = document.createElement("div");
    el.className = "stun-icon";
    el.innerText = "💫";
    document.body.appendChild(el);
    stunIcons[playerId] = el;

    setTimeout(() => {
        if (stunIcons[playerId] === el) {
            el.remove();
            delete stunIcons[playerId];
        }
    }, duration);
}

socket.on("playerStunned", (data) => {

    showStunIcon(data.playerId, data.duration);

    if (data.playerId === socket.id) {
        myStunnedUntil = Date.now() + data.duration;
    }
});

// ================= BLIND (시야 방해) =================
const blindOverlay = document.getElementById("blindOverlay");

socket.on("blinded", (data) => {

    isBlinded = true;
    blindOverlay.style.display = "block";

    if (blindTimeoutHandle) clearTimeout(blindTimeoutHandle);

    blindTimeoutHandle = setTimeout(() => {
        isBlinded = false;
        blindOverlay.style.display = "none";
    }, data.duration);
});

// ================= SKILL3 DASH (돌진 할퀴기) =================
socket.on("skill3Dash", (data) => {

    // 돌진 주체가 나라면 내 좌표도 서버 값으로 맞춰줌 (서버 권위)
    if (data.playerId === socket.id) {
        x = data.endX;
        y = data.endY;
    } else if (otherPlayers[data.playerId]) {
        otherPlayers[data.playerId].worldX = data.endX;
        otherPlayers[data.playerId].worldY = data.endY;
    }

    // 돌진 경로를 잠깐 보여주는 잔상 이펙트
    const trail = document.createElement("div");
    trail.style.position = "absolute";
    trail.style.zIndex = "1";
    trail.style.background = "rgba(255,255,255,0.5)";
    trail.style.height = "6px";
    trail.style.borderRadius = "3px";
    trail.style.transformOrigin = "0 50%";

    const dx = data.endX - data.startX;
    const dy = data.endY - data.startY;
    const dist = Math.sqrt(dx * dx + dy * dy);
    const angle = Math.atan2(dy, dx) * (180 / Math.PI);

    trail.style.width = dist + "px";
    trail.style.transform = `rotate(${angle}deg)`;

    document.body.appendChild(trail);
    placeAtWorld(trail, data.startX + 25, data.startY + 25);

    setTimeout(() => trail.remove(), 250);
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

        // ⭐ 패시브 등으로 서버가 계산한 현재 속도를 반영 (null이면 캐릭터 기본 속도 사용)
        myCharSpeed = (myData.currentSpeed != null) ? myData.currentSpeed : myBaseSpeed;

        // ⭐ 기절 상태 동기화 (서버 값 기준)
        if (myData.stunned) {
            // 서버가 기절 중이라고 하면, 최소한 다음 틱까지는 기절 유지되도록 보정
            myStunnedUntil = Math.max(myStunnedUntil, Date.now() + 100);
        }

        // ⭐ 스킬 쿨타임 UI 갱신
        if (myData.cooldowns) {
            updateSkillCooldownUI(myData.cooldowns);
        }
    }

    for (const id in players) {

        if (id === socket.id) continue;

        const pdata = players[id];

        if (!otherPlayers[id]) {
            const div = document.createElement("div");
            div.style.width = "50px";
            div.style.height = "50px";
            div.style.position = "absolute";
            div.style.borderRadius = "50%";
            div.style.zIndex = "2";
            div.style.overflow = "hidden";
            document.body.appendChild(div);
            otherPlayers[id] = { el: div, worldX: 0, worldY: 0, characterId: null };
        }

        // 캐릭터 정보가 처음 도착했거나 바뀐 경우에만 외형 갱신 (매 프레임 innerHTML 재설정 방지)
        if (pdata.characterId && otherPlayers[id].characterId !== pdata.characterId) {
            applyCharacterAppearance(otherPlayers[id].el, pdata.characterId);
            otherPlayers[id].characterId = pdata.characterId;
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

        const swatchInner = info.faceSVG ? info.faceSVG() : "";
        const swatchStyle = info.faceSVG ? "" : `style="background:${info.color}"`;

        card.innerHTML = `
            <div class="char-swatch" ${swatchStyle}>${swatchInner}</div>
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

    myCharacterId = myData.characterId;
    myCharSpeed = myChar.speed;
    myBaseSpeed = myChar.speed;
    myMaxHp = myChar.hp;

    applyCharacterAppearance(player, myData.characterId);
    setupSkillBarUI(myData.characterId);

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

    // ⭐ 스킬 관련 상태도 라운드 시작 시 초기화
    myStunnedUntil = 0;
    isBlinded = false;
    blindOverlay.style.display = "none";
    if (blindTimeoutHandle) {
        clearTimeout(blindTimeoutHandle);
        blindTimeoutHandle = null;
    }

    for (const id in traps) removeTrapVisual(id);
    for (const pid in stunIcons) {
        stunIcons[pid].remove();
        delete stunIcons[pid];
    }

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