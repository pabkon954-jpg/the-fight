const socket = io();

const lobbyScreen = document.getElementById('lobby-screen');
const gameScreen = document.getElementById('game-screen');
const usernameInput = document.getElementById('username-input');
const roomIdInput = document.getElementById('room-id-input');
const createRoomBtn = document.getElementById('create-room-btn');
const joinRoomBtn = document.getElementById('join-room-btn');

const displayRoomId = document.getElementById('display-room-id');
const playerList = document.getElementById('player-list');
const chatHistory = document.getElementById('chat-history');
const questionInput = document.getElementById('question-input');
const sendQuestionBtn = document.getElementById('send-question-btn');
const questionCountText = document.getElementById('question-count');

// 1. 방 만들기
createRoomBtn.addEventListener('click', () => {
  const username = usernameInput.value.trim();
  if (!username) return alert('닉네임을 입력해주세요!');
  socket.emit('createRoom', { username });
});

// 2. 방 참가하기
joinRoomBtn.addEventListener('click', () => {
  const username = usernameInput.value.trim();
  const roomId = roomIdInput.value.trim();
  if (!username) return alert('닉네임을 입력해주세요!');
  if (!roomId) return alert('방 번호를 입력해주세요!');
  socket.emit('joinRoom', { roomId, username });
});

// 3. 질문 보내기
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

// 소켓 수신 이벤트
socket.on('roomCreated', ({ roomId, gameState }) => enterGame(roomId, gameState));
socket.on('roomJoined', ({ roomId, gameState }) => enterGame(roomId, gameState));

socket.on('userJoined', (data) => {
  if (data && data.users) updatePlayerList(data.users);
});

socket.on('userLeft', (data) => {
  if (data && data.users) updatePlayerList(data.users);
});

socket.on('newAnswer', (data) => {
  appendMessage(data);
  if (questionCountText) {
    questionCountText.textContent = `${data.questionCount} / 20`;
  }
});

socket.on('errorMessage', (msg) => alert(msg));

// UI 헬퍼 함수
function enterGame(roomId, gameState) {
  if (lobbyScreen) lobbyScreen.style.display = 'none';
  if (gameScreen) gameScreen.style.display = 'block';
  if (displayRoomId) displayRoomId.textContent = roomId;
  
  if (gameState) {
    updatePlayerList(gameState.users || []);
    if (gameState.history) {
      chatHistory.innerHTML = '';
      gameState.history.forEach(item => appendMessage(item));
    }
  }
}

// ⚠️ 핵심 방어 로직: users 데이터가 없거나 배열이 아니어도 터지지 않음
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
    <span style="color: #4CAF50; font-weight: bold;">└ AI: ${data.answer}</span>
  `;
  chatHistory.appendChild(msgDiv);
  chatHistory.scrollTop = chatHistory.scrollHeight;
}