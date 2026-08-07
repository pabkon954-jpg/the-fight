const socket = io();

const CATEGORIES = [
  "음식/요리", "디저트/음료", "전자기기/가전", "동물/곤충", "해양생물",
  "식물/꽃/나무", "직업/전문가", "악기/음악용품", "운동/스포츠", "우주/천체",
  "자연현상/기후", "영화/만화/캐릭터", "세계 랜드마크/건축물", "의류/패션잡화", "학용품/문구",
  "주방용품/식기", "교통수단/탈것", "신체부위/장기", "취미/보드게임", "신화/전설/환상종",
  "역사적 인물", "가구/인테리어", "계절/절기", "전통문화/유물", "의료/건강용품",
  "캠핑/야외용품", "도서/학문분야", "무기/방어구", "도시/국가", "마법/판타지요소"
];

// ✅ 카테고리 체크박스(복수 선택) 렌더링
function renderCategoryGrid(containerEl, idPrefix) {
    if (!containerEl) return;
    containerEl.innerHTML = CATEGORIES.map((cat, i) => `
        <label class="category-checkbox">
            <input type="checkbox" value="${cat}" id="${idPrefix}-${i}">
            <span>${cat}</span>
        </label>
    `).join('');
}

function getCheckedCategories(containerEl) {
    if (!containerEl) return [];
    return Array.from(containerEl.querySelectorAll('input[type="checkbox"]:checked')).map(el => el.value);
}

function setCheckedCategories(containerEl, categories) {
    if (!containerEl) return;
    const selected = new Set(categories || []);
    containerEl.querySelectorAll('input[type="checkbox"]').forEach(el => {
        el.checked = selected.has(el.value);
    });
}

function formatCategories(categories) {
    if (!categories || categories.length === 0) return '랜덤(전체)';
    if (categories.length > 4) return `${categories.slice(0, 4).join(', ')} 외 ${categories.length - 4}개`;
    return categories.join(', ');
}

const lobbyScreen = document.getElementById('lobby');
const gameScreen = document.getElementById('game-room');

const usernameInput = document.getElementById('username');
const difficultySelect = document.getElementById('difficulty');
const categoryGrid = document.getElementById('category-grid');
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
const editCategoryGrid = document.getElementById('edit-category-grid');
const startGameBtn = document.getElementById('start-game-btn');
const waitingDifficultyDisplay = document.getElementById('waiting-difficulty');
const waitingCategoryDisplay = document.getElementById('waiting-category');

renderCategoryGrid(categoryGrid, 'lobby-cat');
renderCategoryGrid(editCategoryGrid, 'edit-cat');

// 전체 선택 / 전체 해제 버튼 (이벤트 위임)
document.addEventListener('click', (e) => {
    const btn = e.target.closest('.link-btn');
    if (!btn) return;
    const target = document.getElementById(btn.dataset.target);
    if (!target) return;
    const checkAll = btn.dataset.action === 'all';
    target.querySelectorAll('input[type="checkbox"]').forEach(el => { el.checked = checkAll; });
    // 방장이 대기실에서 누른 경우 서버에도 즉시 반영
    if (target === editCategoryGrid) {
        socket.emit('updateSettings', { categories: getCheckedCategories(editCategoryGrid) });
    }
});

const DIFFICULTY_MAP = { easy: '쉬움', normal: '보통', hard: '어려움', extreme: '극악' };

let myId = null;
let isHost = false;

socket.on('connect', () => { myId = socket.id; });

if (createRoomBtn) {
    createRoomBtn.addEventListener('click', () => {
        const username = usernameInput ? usernameInput.value.trim() : '';
        if (!username) return alert('닉네임을 입력해 주세요.');
        const difficulty = difficultySelect ? difficultySelect.value : 'normal';
        const categories = getCheckedCategories(categoryGrid);
        socket.emit('createRoom', { username, difficulty, categories });
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

// ✅ AI 응답을 기다리는 동안 중복 전송을 막기 위한 상태 (렉으로 인한 질문 밀림 방지)
let waitingForAI = false;
let typingIndicatorEl = null;

function setWaitingState(isWaiting) {
    waitingForAI = isWaiting;
    if (questionInput) questionInput.disabled = isWaiting;
    if (sendBtn) sendBtn.disabled = isWaiting;

    if (isWaiting) {
        if (chatWindow && !typingIndicatorEl) {
            typingIndicatorEl = document.createElement('div');
            typingIndicatorEl.className = 'system-message typing-indicator';
            typingIndicatorEl.textContent = '🤖 AI가 답변을 생각하는 중...';
            chatWindow.appendChild(typingIndicatorEl);
            chatWindow.scrollTop = chatWindow.scrollHeight;
        }
    } else {
        if (typingIndicatorEl) {
            typingIndicatorEl.remove();
            typingIndicatorEl = null;
        }
        if (questionInput) questionInput.focus();
    }
}

function sendQuestion() {
    if (!questionInput) return;
    if (waitingForAI) return; // 응답 대기 중이면 추가 전송을 막아서 질문이 밀리지 않게 함
    const question = questionInput.value.trim();
    if (!question) return;

    setWaitingState(true);
    socket.emit('sendQuestion', { question });
    questionInput.value = '';
}

if (sendBtn) sendBtn.addEventListener('click', sendQuestion);
if (questionInput) {
    // ✅ 초성(ㅇ, ㅁ 등)을 포함한 모든 입력을 그대로 전송 가능 (한글 조합 여부와 무관하게 Enter로 전송)
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

if (editDifficultySelect) {
    editDifficultySelect.addEventListener('change', () => {
        socket.emit('updateSettings', { difficulty: editDifficultySelect.value });
    });
}

if (editCategoryGrid) {
    editCategoryGrid.addEventListener('change', () => {
        socket.emit('updateSettings', { categories: getCheckedCategories(editCategoryGrid) });
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

function renderRoomPanels(gameState) {
    if (!gameState) return;
    isHost = gameState.hostId === myId;

    if (difficultyDisplay) difficultyDisplay.textContent = DIFFICULTY_MAP[gameState.difficulty] || gameState.difficulty;
    if (categoryDisplay) categoryDisplay.textContent = formatCategories(gameState.categories);
    if (playerCountDisplay) playerCountDisplay.textContent = gameState.users.length;
    renderScoreboard(gameState.users);

    if (!gameState.gameStarted) {
        if (prePanel) prePanel.classList.remove('hidden');
        if (playPanel) playPanel.classList.add('hidden');

        if (isHost) {
            if (hostSettingsPanel) hostSettingsPanel.classList.remove('hidden');
            if (guestWaitingPanel) guestWaitingPanel.classList.add('hidden');
            if (editDifficultySelect) editDifficultySelect.value = gameState.difficulty;
            setCheckedCategories(editCategoryGrid, gameState.categories);
        } else {
            if (hostSettingsPanel) hostSettingsPanel.classList.add('hidden');
            if (guestWaitingPanel) guestWaitingPanel.classList.remove('hidden');
            if (waitingDifficultyDisplay) waitingDifficultyDisplay.textContent = DIFFICULTY_MAP[gameState.difficulty] || gameState.difficulty;
            if (waitingCategoryDisplay) waitingCategoryDisplay.textContent = formatCategories(gameState.categories);
        }
    } else {
        if (prePanel) prePanel.classList.add('hidden');
        if (playPanel) playPanel.classList.remove('hidden');
    }
}

// ── Socket 리스너 ──────────────────────────────

socket.on('roomCreated', ({ roomId, gameState }) => enterGameRoom(roomId, gameState));
socket.on('roomJoined', ({ roomId, gameState }) => enterGameRoom(roomId, gameState));

socket.on('errorMessage', (msg) => {
    setWaitingState(false);
    alert(msg);
});

socket.on('updateGameState', (gameState) => {
    renderRoomPanels(gameState);
    if (currentTurnDisplay && gameState.users[gameState.currentTurnIndex]) {
        currentTurnDisplay.textContent = gameState.users[gameState.currentTurnIndex].username;
    }
});

socket.on('settingsUpdated', ({ difficulty, categories }) => {
    if (difficultyDisplay && difficulty) difficultyDisplay.textContent = DIFFICULTY_MAP[difficulty] || difficulty;
    if (categoryDisplay && categories) categoryDisplay.textContent = formatCategories(categories);
    if (waitingDifficultyDisplay && difficulty) waitingDifficultyDisplay.textContent = DIFFICULTY_MAP[difficulty] || difficulty;
    if (waitingCategoryDisplay && categories) waitingCategoryDisplay.textContent = formatCategories(categories);
});

socket.on('gameStarted', ({ gameState, currentTurnUser }) => {
    renderRoomPanels(gameState);
    if (chatWindow) chatWindow.innerHTML = '<div class="system-message">게임이 시작되었습니다! 첫 질문을 입력해보세요.</div>';
    if (questionsLeftDisplay) questionsLeftDisplay.textContent = 20;
    typingIndicatorEl = null;
    setWaitingState(false);
    if (questionInput) questionInput.value = '';
    if (postGameActions) postGameActions.classList.add('hidden');
    if (currentTurnDisplay && currentTurnUser) currentTurnDisplay.textContent = currentTurnUser;
    if (hintBox) { hintBox.textContent = ''; hintBox.classList.add('hidden'); }
});

socket.on('settingsReopened', ({ gameState }) => {
    renderRoomPanels(gameState);
});

socket.on('newAnswer', (resultData) => {
    const { questionCount, user, question, answer, isGameOver, currentTurnUser, users } = resultData;

    setWaitingState(false);

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
    typingIndicatorEl = null;
    setWaitingState(false);
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