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
});

socket.on('newAnswer', (resultData) => {
    const { questionCount, user, question, answer, isGameOver, currentTurnUser } = resultData;

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

    if (isGameOver) {
        if (questionInput) questionInput.disabled = true;
        if (sendBtn) sendBtn.disabled = true;
        if (restartBtn) restartBtn.classList.remove('hidden');
    }
});

socket.on('gameRestarted', ({ gameState, currentTurnUser }) => {
    if (chatWindow) chatWindow.innerHTML = '<div class="system-message">새 라운드가 시작되었습니다!</div>';
    if (questionsLeftDisplay) questionsLeftDisplay.textContent = 20;
    if (questionInput) questionInput.disabled = false;
    if (sendBtn) sendBtn.disabled = false;
    if (restartBtn) restartBtn.classList.add('hidden');
    if (currentTurnDisplay && currentTurnUser) currentTurnDisplay.textContent = currentTurnUser;
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
}