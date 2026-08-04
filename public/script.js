const socket = io();

// DOM 요소 가져오기
const lobbyScreen = document.getElementById('lobby');
const gameScreen = document.getElementById('game-room');

const usernameInput = document.getElementById('username');
const difficultySelect = document.getElementById('difficulty');
const createRoomBtn = document.getElementById('create-room-btn');
const roomCodeInput = document.getElementById('room-code-input');
const joinRoomBtn = document.getElementById('join-room-btn');

const roomCodeDisplay = document.getElementById('room-code-display');
const playerCountDisplay = document.getElementById('player-count');
const currentTurnDisplay = document.getElementById('current-turn-user');
const questionsLeftDisplay = document.getElementById('questions-left');
const chatWindow = document.getElementById('chat-window');
const questionInput = document.getElementById('question-input');
const sendBtn = document.getElementById('send-btn');
const restartBtn = document.getElementById('restart-btn');

// --- 1. 방 만들기 ---
createRoomBtn.addEventListener('click', () => {
    const username = usernameInput.value.trim();
    if (!username) {
        alert('닉네임을 입력해 주세요.');
        return;
    }
    const difficulty = difficultySelect.value;
    socket.emit('createRoom', { username, difficulty });
});

// --- 2. 방 참가하기 ---
joinRoomBtn.addEventListener('click', () => {
    const username = usernameInput.value.trim();
    const roomId = roomCodeInput.value.trim();

    if (!username) {
        alert('닉네임을 입력해 주세요.');
        return;
    }
    if (!roomId) {
        alert('방 코드를 입력해 주세요.');
        return;
    }

    socket.emit('joinRoom', { roomId, username });
});

// --- 3. 질문 / 정답 전송 ---
function sendQuestion() {
    const question = questionInput.value.trim();
    if (!question) return;

    socket.emit('sendQuestion', { question });
    questionInput.value = '';
}

sendBtn.addEventListener('click', sendQuestion);
questionInput.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') sendQuestion();
});

// --- 4. 게임 다시하기 ---
restartBtn.addEventListener('click', () => {
    socket.emit('restartGame');
});

// --- Socket Event Listeners ---

// 방 생성 성공
socket.on('roomCreated', ({ roomId, gameState }) => {
    enterGameRoom(roomId, gameState);
});

// 방 참가 성공
socket.on('roomJoined', ({ roomId, gameState }) => {
    enterGameRoom(roomId, gameState);
});

// 오류 메시지 처리
socket.on('errorMessage', (msg) => {
    alert(msg);
});

// 게임 상태 및 턴/참여자 업데이트
socket.on('updateGameState', ({ users, currentTurnUser }) => {
    playerCountDisplay.textContent = users.length;
    if (currentTurnUser) {
        currentTurnDisplay.textContent = currentTurnUser;
    }
});

// 답변 받기 (채팅창 출력)
socket.on('newAnswer', (resultData) => {
    const { questionCount, user, question, answer, isGameOver, currentTurnUser } = resultData;

    // 남은 질문 수 계산
    questionsLeftDisplay.textContent = 20 - questionCount;

    // 질문/답변 메시지 노출
    const msgDiv = document.createElement('div');
    msgDiv.className = 'chat-message';
    msgDiv.innerHTML = `
        <p><strong>[질문 ${questionCount}] ${user}:</strong> ${question}</p>
        <p class="ai-answer"><strong>🤖 AI:</strong> ${answer}</p>
    `;
    chatWindow.appendChild(msgDiv);
    chatWindow.scrollTop = chatWindow.scrollHeight;

    // 턴 업데이트
    if (currentTurnUser) {
        currentTurnDisplay.textContent = currentTurnUser;
    }

    // 게임 오버 처리
    if (isGameOver) {
        questionInput.disabled = true;
        sendBtn.disabled = true;
        restartBtn.classList.remove('hidden');
    }
});

// 게임 재시작 처리
socket.on('gameRestarted', ({ gameState, currentTurnUser }) => {
    chatWindow.innerHTML = '<div class="system-message">새로운 라운드가 시작되었습니다!</div>';
    questionsLeftDisplay.textContent = 20;
    questionInput.disabled = false;
    sendBtn.disabled = false;
    restartBtn.classList.add('hidden');
    if (currentTurnUser) {
        currentTurnDisplay.textContent = currentTurnUser;
    }
});

// 대기실 -> 게임룸 화면 전환 함수
function enterGameRoom(roomId, gameState) {
    lobbyScreen.classList.add('hidden');
    gameScreen.classList.remove('hidden');
    roomCodeDisplay.textContent = roomId;
    playerCountDisplay.textContent = gameState.users.length;
    
    if (gameState.users[gameState.currentTurnIndex]) {
        currentTurnDisplay.textContent = gameState.users[gameState.currentTurnIndex].username;
    }
}