const socket = io();

const lobbyScreen = document.getElementById('lobby-screen');
const gameScreen = document.getElementById('game-screen');
const usernameInput = document.getElementById('username-input');
const difficultySelect = document.getElementById('difficulty-select');
const roomIdInput = document.getElementById('room-id-input');
const createRoomBtn = document.getElementById('create-room-btn');
const joinRoomBtn = document.getElementById('join-room-btn');

const displayRoomId = document.getElementById('display-room-id');
const playerList = document.getElementById('player-list');
const chatHistory = document.getElementById('chat-history');
const questionInput = document.getElementById('question-input');
const sendQuestionBtn = document.getElementById('send-question-btn');
const questionCountText = document.getElementById('question-count');
const restartBtn = document.getElementById('restart-btn');

let turnNotice = document.getElementById('turn-notice');
if (!turnNotice) {
  turnNotice = document.createElement('div');
  turnNotice.id = 'turn-notice';
  turnNotice.style.cssText = 'color: #ffca28; font-weight: bold; margin-bottom: 12px; font-size: 1rem; padding: 8px; background: #2a2a2a; border-radius: 6px; text-align: center;';
  document.querySelector('.player-section').after(turnNotice);
}

// 1. 방 만들기
createRoomBtn.addEventListener('click', () => {
  const username = usernameInput.value.trim();
  const difficulty = difficultySelect.value;
  if (!username) return alert('닉네임을 입력해주세요!');
  socket.emit('createRoom', { username, difficulty });
});

// 2. 방 참가하기
joinRoomBtn.addEventListener('click', () => {
  const username = usernameInput.value.trim();
  const roomId = roomIdInput.value.trim();
  if (!username) return alert('닉네임을 입력해주세요!');
  if (!roomId) return alert('방 번호를 입력해주세요!');
  socket.emit('joinRoom', { roomId, username });
});

// 3. 질문 전송
function handleSendQuestion() {
  const question = questionInput.value.trim();
  if (!question) return;
  socket.emit('sendQuestion', { question });
  questionInput.value = '';
}

sendQuestionBtn.addEventListener('click', handleSendQuestion);
questionInput.addEventListener('keypress', (e) => {
  if (e.key === 'Enter') handleSendQuestion();
});

// 4. 게임 다시하기 버튼 클릭
restartBtn.addEventListener('click', () => {
  socket.emit('restartGame');
});

// Socket 이벤트 처리
socket.on('roomCreated', ({ roomId, gameState }) => enterGame(roomId, gameState));
socket.on('roomJoined', ({ roomId, gameState }) => enterGame(roomId, gameState));

socket.on('updateGameState', ({ users, currentTurnUser }) => {
  updatePlayerList(users);
  updateTurnNotice(currentTurnUser);
});

socket.on('newAnswer', (data) => {
  appendMessage(data);
  if (questionCountText) {
    questionCountText.textContent = `${data.questionCount} / 20`;
  }
  
  if (data.isGameOver) {
    turnNotice.textContent = "🎮 게임이 종료되었습니다!";
    restartBtn.style.display = 'block'; // 다시하기 버튼 표시
  } else if (data.currentTurnUser) {
    updateTurnNotice(data.currentTurnUser);
  }
});

// 게임 다시하기 이벤트
socket.on('gameRestarted', ({ gameState, currentTurnUser }) => {
  chatHistory.innerHTML = '';
  questionCountText.textContent = '0 / 20';
  restartBtn.style.display = 'none';
  updateTurnNotice(currentTurnUser);
  alert('새 라운드가 시작되었습니다!');
});

socket.on('errorMessage', (msg) => alert(msg));

// UI 도우미 함수들
function enterGame(roomId, gameState) {
  if (lobbyScreen) lobbyScreen.style.display = 'none';
  if (gameScreen) gameScreen.style.display = 'block';
  if (displayRoomId) displayRoomId.textContent = roomId;
  
  if (gameState) {
    updatePlayerList(gameState.users || []);
    const turnUser = gameState.users[gameState.currentTurnIndex]?.username;
    updateTurnNotice(turnUser);

    if (gameState.history) {
      chatHistory.innerHTML = '';
      gameState.history.forEach(item => appendMessage(item));
    }
  }
}

function updateTurnNotice(turnUsername) {
  if (turnNotice && turnUsername) {
    turnNotice.textContent = `🎲 [ ${turnUsername} ] 님의 질문 차례입니다!`;
  }
}

function updatePlayerList(users) {
  if (!playerList) return;
  playerList.innerHTML = '';
  
  const userArray = Array.isArray(users) ? users : [];
  userArray.forEach(u => {
    const li = document.createElement('li');
    li.textContent = u.username || '익명';
    playerList.appendChild(li);
  });
}

function appendMessage(data) {
  if (!chatHistory) return;
  const msgDiv = document.createElement('div');
  msgDiv.className = 'chat-item';
  msgDiv.style.marginBottom = '10px';
  msgDiv.innerHTML = `
    <strong>[질문 ${data.questionCount}] ${data.user}:</strong> ${data.question}<br>
    <span style="color: #4CAF50; font-weight: bold;">└ AI: ${data.answer.replace(/\n/g, '<br>')}</span>
  `;
  chatHistory.appendChild(msgDiv);
  chatHistory.scrollTop = chatHistory.scrollHeight;
}