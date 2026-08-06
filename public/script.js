const socket = io();

const lobbyScreen = document.getElementById('lobby');
const gameScreen = document.getElementById('game-room');

const usernameInput = document.getElementById('username');
const difficultySelect = document.getElementById('difficulty');
const createRoomBtn = document.getElementById('create-room-btn');
const roomCodeInput = document.getElementById('room-code-input');
const joinRoomBtn = document.getElementById('join-room-btn');

const roomCodeDisplay = document.getElementById('room-code-display');
const difficultyDisplay = document.getElementById('difficulty-display');
const playerCountDisplay = document.getElementById('player-count');
const currentTurnDisplay = document.getElementById('current-turn-user');
const questionsLeftDisplay = document.getElementById('questions-left');
const chatWindow = document.getElementById('chat-window');
const questionInput = document.getElementById('question-input');
const sendBtn = document.getElementById('send-btn');
const restartBtn = document.getElementById('restart-btn');

// ✅ 신규: 힌트 박스 / 점수판 엘리먼트
const hintBox = document.getElementById('hint-box');
const scoreboard = document.getElementById('scoreboard');

const DIFFICULTY_MAP = {
    easy: '쉬움',
    normal: '보통',
    hard: '어려움',
    extreme: '극악'
};

if (createRoomBtn) {
    createRoomBtn.addEventListener('click', () => {
        const username = usernameInput ? usernameInput.value.trim() : '';
        if (!username) return alert('닉네임을 입력해 주세요.');
        const difficulty = difficultySelect ? difficultySelect.value : 'normal';
        socket.emit('createRoom', { username, difficulty });
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
    restartBtn.addEventListener('click', () => {
        socket.emit('restartGame');
    });
}

// ✅ 신규: 점수판 렌더링 함수
function renderScoreboard(users) {
    if (!scoreboard || !users) return;
    scoreboard.innerHTML = users
        .slice()
        .sort((a, b) => (b.score || 0) - (a.score || 0))
        .map(u => `<span class="score-chip">${u.username}: <strong>${u.score || 0}</strong>점</span>`)
        .join('');
}

// Socket 리스너

socket.on('roomCreated', ({ roomId, gameState }) => {
    enterGameRoom(roomId, gameState);
});

socket.on('roomJoined', ({ roomId, gameState }) => {
    enterGameRoom(roomId, gameState);
});

socket.on('errorMessage', (msg) => {
    alert(msg);
});

socket.on('updateGameState', ({ users, difficulty, currentTurnUser }) => {
    if (playerCountDisplay) playerCountDisplay.textContent = users.length;
    if (difficultyDisplay && difficulty) difficultyDisplay.textContent = DIFFICULTY_MAP[difficulty] || difficulty;
    if (currentTurnDisplay && currentTurnUser) currentTurnDisplay.textContent = currentTurnUser;
    renderScoreboard(users);
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

    // ✅ 정답을 맞혀서 점수가 갱신된 경우, 서버가 users 배열을 함께 보내줌
    if (users) renderScoreboard(users);

    if (isGameOver) {
        if (questionInput) questionInput.disabled = true;
        if (sendBtn) sendBtn.disabled = true;
        if (restartBtn) restartBtn.classList.remove('hidden');
    }
});

// ✅ 신규: 힌트 수신 리스너 — 이게 빠져있어서 힌트가 화면에 안 보였던 부분
socket.on('hint', ({ hintText, hintsGiven }) => {
    // 채팅창에도 힌트를 시스템 메시지 형태로 남김
    if (chatWindow) {
        const hintDiv = document.createElement('div');
        hintDiv.className = 'system-message hint-message';
        hintDiv.textContent = hintText;
        chatWindow.appendChild(hintDiv);
        chatWindow.scrollTop = chatWindow.scrollHeight;
    }

    // 상단 힌트 박스에도 최신 힌트를 강조 표시
    if (hintBox) {
        hintBox.textContent = `${hintText} (${hintsGiven}/3)`;
        hintBox.classList.remove('hidden');
        hintBox.classList.add('hint-pulse');
        setTimeout(() => hintBox.classList.remove('hint-pulse'), 600);
    }
});

socket.on('gameRestarted', ({ gameState, currentTurnUser }) => {
    if (chatWindow) chatWindow.innerHTML = '<div class="system-message">새 라운드가 시작되었습니다!</div>';
    if (questionsLeftDisplay) questionsLeftDisplay.textContent = 20;
    if (questionInput) questionInput.disabled = false;
    if (sendBtn) sendBtn.disabled = false;
    if (restartBtn) restartBtn.classList.add('hidden');
    if (currentTurnDisplay && currentTurnUser) currentTurnDisplay.textContent = currentTurnUser;
    if (hintBox) {
        hintBox.textContent = '';
        hintBox.classList.add('hidden');
    }
    if (gameState && gameState.users) renderScoreboard(gameState.users);
});

function enterGameRoom(roomId, gameState) {
    if (lobbyScreen) lobbyScreen.classList.add('hidden');
    if (gameScreen) gameScreen.classList.remove('hidden');
    if (roomCodeDisplay) roomCodeDisplay.textContent = roomId;
    if (difficultyDisplay && gameState.difficulty) {
        difficultyDisplay.textContent = DIFFICULTY_MAP[gameState.difficulty] || gameState.difficulty;
    }
    if (playerCountDisplay) playerCountDisplay.textContent = gameState.users.length;

    if (currentTurnDisplay && gameState.users[gameState.currentTurnIndex]) {
        currentTurnDisplay.textContent = gameState.users[gameState.currentTurnIndex].username;
    }

    if (hintBox) {
        hintBox.textContent = '';
        hintBox.classList.add('hidden');
    }

    renderScoreboard(gameState.users);
}