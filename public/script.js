const socket = io();

// ─────────────────────────────────────────────
// 카테고리 목록 (서버 EXTENDED_CATEGORIES와 동일하게 유지)
// ─────────────────────────────────────────────
const CATEGORIES = [
  "음식/요리", "디저트/음료", "전자기기/가전", "동물/곤충", "해양생물",
  "식물/꽃/나무", "직업/전문가", "악기/음악용품", "운동/스포츠", "우주/천체",
  "자연현상/기후", "영화/만화/캐릭터", "세계 랜드마크/건축물", "의류/패션잡화", "학용품/문구",
  "주방용품/식기", "교통수단/탈것", "신체부위/장기", "취미/보드게임", "신화/전설/환상종",
  "역사적 인물", "가구/인테리어", "계절/절기", "전통문화/유물", "의료/건강용품",
  "캠핑/야외용품", "도서/학문분야", "무기/방어구", "도시/국가", "마법/판타지요소"
];

function populateCategorySelect(selectEl) {
    if (!selectEl) return;
    CATEGORIES.forEach(cat => {
        const opt = document.createElement('option');
        opt.value = cat;
        opt.textContent = cat;
        selectEl.appendChild(opt);
    });
}

const lobbyScreen = document.getElementById('lobby');
const gameScreen = document.getElementById('game-room');

const usernameInput = document.getElementById('username');
const difficultySelect = document.getElementById('difficulty');
const categorySelect = document.getElementById('category');
const createRoomBtn = document.getElementById('create-room-btn');
const roomCodeInput = document.getElementById('room-code-input');
const joinRoomBtn = document.getElementById('join-room-btn');

const roomCodeDisplay = document.getElementById('room-code-display');
const difficultyDisplay = document.getElementById('difficulty-display');
const categoryDisplay = document.getElementById('category-display');
const playerCountDisplay = document.getElementById('player-count');
const currentTurnDisplay = document.getElementById('current-turn-user');
const questionsLeftDisplay = document.getElementById('questions-left');
const chatWindow = document.getElementById('chat-window');
const questionInput = document.getElementById('question-input');
const sendBtn = document.getElementById('send-btn');
const restartBtn = document.getElementById('restart-btn');
const backToSettingsBtn = document.getElementById('back-to-settings-btn');
const postGameActions = document.getElementById('post-game-actions');

const hintBox = document.getElementById('hint-box');
const scoreboard = document.getElementById('scoreboard');

const prePanel = document.getElementById('pre-game-panel');
const playPanel = document.getElementById('play-panel');
const hostSettingsPanel = document.getElementById('host-settings');
const guestWaitingPanel = document.getElementById('guest-waiting');
const editDifficultySelect = document.getElementById('edit-difficulty');
const editCategorySelect = document.getElementById('edit-category');
const startGameBtn = document.getElementById('start-game-btn');
const waitingDifficultyDisplay = document.getElementById('waiting-difficulty');
const waitingCategoryDisplay = document.getElementById('waiting-category');

populateCategorySelect(categorySelect);
populateCategorySelect(editCategorySelect);

const DIFFICULTY_MAP = { easy: '쉬움', normal: '보통', hard: '어려움', extreme: '극악' };

let myId = null;
let isHost = false;

socket.on('connect', () => { myId = socket.id; });

if (createRoomBtn) {
    createRoomBtn.addEventListener('click', () => {
        const username = usernameInput ? usernameInput.value.trim() : '';
        if (!username) return alert('닉네임을 입력해 주세요.');
        const difficulty = difficultySelect ? difficultySelect.value : 'normal';
        const category = categorySelect ? categorySelect.value : '랜덤';
        socket.emit('createRoom', { username, difficulty, category });
    });
}

if (joinRoomBtn) {
    joinRoomBtn.addEventListener('click', () => {
        const username = usernameInput ? usernameInput.value.trim() : '';
        const roomId = roomCodeInput ? roomCodeInput.value.trim() : '';
        if (!username) return alert('닉네임을 입력해 주세요.');
        if (!roomId) return alert('방 코드를 입력해 주세요.');
        socket.emit('joinRoom', { roomId, username });
    });
}

function sendQuestion() {
    if (!questionInput) return;
    const question = questionInput.value.trim();
    if (!question) return;
    socket.emit('sendQuestion', { question });
    questionInput.value = '';
}

if (sendBtn) sendBtn.addEventListener('click', sendQuestion);
if (questionInput) {
    questionInput.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') sendQuestion();
    });
}

if (restartBtn) {
    restartBtn.addEventListener('click', () => socket.emit('restartGame'));
}

if (backToSettingsBtn) {
    backToSettingsBtn.addEventListener('click', () => socket.emit('backToSettings'));
}

if (startGameBtn) {
    startGameBtn.addEventListener('click', () => socket.emit('startGame'));
}

// 방장이 설정을 바꿀 때마다(select onchange) 실시간으로 서버에 반영
if (editDifficultySelect) {
    editDifficultySelect.addEventListener('change', () => {
        socket.emit('updateSettings', { difficulty: editDifficultySelect.value });
    });
}
if (editCategorySelect) {
    editCategorySelect.addEventListener('change', () => {
        socket.emit('updateSettings', { category: editCategorySelect.value });
    });
}

function renderScoreboard(users) {
    if (!scoreboard || !users) return;
    scoreboard.innerHTML = users
        .slice()
        .sort((a, b) => (b.score || 0) - (a.score || 0))
        .map(u => `<span class="score-chip">${u.username}: <strong>${u.score || 0}</strong>점</span>`)
        .join('');
}

// 대기실(설정) 화면과 실제 플레이 화면을 gameStarted 여부에 따라 토글
function renderRoomPanels(gameState) {
    if (!gameState) return;
    isHost = gameState.hostId === myId;

    if (difficultyDisplay) difficultyDisplay.textContent = DIFFICULTY_MAP[gameState.difficulty] || gameState.difficulty;
    if (categoryDisplay) categoryDisplay.textContent = gameState.category || '랜덤';
    if (playerCountDisplay) playerCountDisplay.textContent = gameState.users.length;
    renderScoreboard(gameState.users);

    if (!gameState.gameStarted) {
        // 대기실 모드
        if (prePanel) prePanel.classList.remove('hidden');
        if (playPanel) playPanel.classList.add('hidden');

        if (isHost) {
            if (hostSettingsPanel) hostSettingsPanel.classList.remove('hidden');
            if (guestWaitingPanel) guestWaitingPanel.classList.add('hidden');
            if (editDifficultySelect) editDifficultySelect.value = gameState.difficulty;
            if (editCategorySelect) editCategorySelect.value = gameState.category;
        } else {
            if (hostSettingsPanel) hostSettingsPanel.classList.add('hidden');
            if (guestWaitingPanel) guestWaitingPanel.classList.remove('hidden');
            if (waitingDifficultyDisplay) waitingDifficultyDisplay.textContent = DIFFICULTY_MAP[gameState.difficulty] || gameState.difficulty;
            if (waitingCategoryDisplay) waitingCategoryDisplay.textContent = gameState.category || '랜덤';
        }
    } else {
        // 게임 플레이 모드
        if (prePanel) prePanel.classList.add('hidden');
        if (playPanel) playPanel.classList.remove('hidden');
    }
}

// ── Socket 리스너 ──────────────────────────────

socket.on('roomCreated', ({ roomId, gameState }) => enterGameRoom(roomId, gameState));
socket.on('roomJoined', ({ roomId, gameState }) => enterGameRoom(roomId, gameState));

socket.on('errorMessage', (msg) => alert(msg));

socket.on('updateGameState', (gameState) => {
    renderRoomPanels(gameState);
    if (currentTurnDisplay && gameState.users[gameState.currentTurnIndex]) {
        currentTurnDisplay.textContent = gameState.users[gameState.currentTurnIndex].username;
    }
});

socket.on('settingsUpdated', ({ difficulty, category }) => {
    if (difficultyDisplay && difficulty) difficultyDisplay.textContent = DIFFICULTY_MAP[difficulty] || difficulty;
    if (categoryDisplay && category) categoryDisplay.textContent = category;
    if (waitingDifficultyDisplay && difficulty) waitingDifficultyDisplay.textContent = DIFFICULTY_MAP[difficulty] || difficulty;
    if (waitingCategoryDisplay && category) waitingCategoryDisplay.textContent = category;
});

socket.on('gameStarted', ({ gameState, currentTurnUser }) => {
    renderRoomPanels(gameState);
    if (chatWindow) chatWindow.innerHTML = '<div class="system-message">게임이 시작되었습니다! 첫 질문을 입력해보세요.</div>';
    if (questionsLeftDisplay) questionsLeftDisplay.textContent = 20;
    if (questionInput) { questionInput.disabled = false; questionInput.value = ''; }
    if (sendBtn) sendBtn.disabled = false;
    if (postGameActions) postGameActions.classList.add('hidden');
    if (currentTurnDisplay && currentTurnUser) currentTurnDisplay.textContent = currentTurnUser;
    if (hintBox) { hintBox.textContent = ''; hintBox.classList.add('hidden'); }
});

socket.on('settingsReopened', ({ gameState }) => {
    renderRoomPanels(gameState);
});

socket.on('newAnswer', (resultData) => {
    const { questionCount, user, question, answer, isGameOver, currentTurnUser, users } = resultData;

    if (questionsLeftDisplay) questionsLeftDisplay.textContent = 20 - questionCount;

    if (chatWindow) {
        const msgDiv = document.createElement('div');
        msgDiv.className = 'chat-message';
        msgDiv.innerHTML = `
            <p><strong>[질문 ${questionCount}] ${user}:</strong> ${question}</p>
            <p class="ai-answer" style="color:#10b981; margin-top:3px;"><strong>🤖 AI:</strong> ${answer}</p>
        `;
        chatWindow.appendChild(msgDiv);
        chatWindow.scrollTop = chatWindow.scrollHeight;
    }

    if (currentTurnDisplay && currentTurnUser) currentTurnDisplay.textContent = currentTurnUser;
    if (users) renderScoreboard(users);

    if (isGameOver) {
        if (questionInput) questionInput.disabled = true;
        if (sendBtn) sendBtn.disabled = true;
        if (postGameActions) postGameActions.classList.remove('hidden');
        if (backToSettingsBtn) {
            if (isHost) backToSettingsBtn.classList.remove('hidden');
            else backToSettingsBtn.classList.add('hidden');
        }
    }
});

socket.on('hint', ({ hintText, hintsGiven, penalty }) => {
    if (chatWindow) {
        const hintDiv = document.createElement('div');
        hintDiv.className = 'system-message hint-message';
        hintDiv.textContent = hintText;
        chatWindow.appendChild(hintDiv);
        chatWindow.scrollTop = chatWindow.scrollHeight;
    }
    if (hintBox) {
        hintBox.textContent = `${hintText} (${hintsGiven}/3, 힌트 누적 차감 -${penalty}점)`;
        hintBox.classList.remove('hidden');
        hintBox.classList.add('hint-pulse');
        setTimeout(() => hintBox.classList.remove('hint-pulse'), 600);
    }
});

socket.on('gameRestarted', ({ gameState, currentTurnUser }) => {
    renderRoomPanels(gameState);
    if (chatWindow) chatWindow.innerHTML = '<div class="system-message">새 라운드가 시작되었습니다!</div>';
    if (questionsLeftDisplay) questionsLeftDisplay.textContent = 20;
    if (questionInput) questionInput.disabled = false;
    if (sendBtn) sendBtn.disabled = false;
    if (postGameActions) postGameActions.classList.add('hidden');
    if (currentTurnDisplay && currentTurnUser) currentTurnDisplay.textContent = currentTurnUser;
    if (hintBox) { hintBox.textContent = ''; hintBox.classList.add('hidden'); }
});

function enterGameRoom(roomId, gameState) {
    if (lobbyScreen) lobbyScreen.classList.add('hidden');
    if (gameScreen) gameScreen.classList.remove('hidden');
    if (roomCodeDisplay) roomCodeDisplay.textContent = roomId;

    renderRoomPanels(gameState);

    if (currentTurnDisplay && gameState.users[gameState.currentTurnIndex]) {
        currentTurnDisplay.textContent = gameState.users[gameState.currentTurnIndex].username;
    }
}