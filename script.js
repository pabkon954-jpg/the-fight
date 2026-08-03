const socket = io();

// DOM 요소
const menuDiv = document.getElementById('menu');
const lobbyDiv = document.getElementById('lobby');
const gameDiv = document.getElementById('game');

const nicknameInput = document.getElementById('nickname-input');
const roomInput = document.getElementById('room-input');
const createBtn = document.getElementById('create-btn');
const joinBtn = document.getElementById('join-btn');

const roomCodeDisplay = document.getElementById('room-code-display');
const playerList = document.getElementById('player-list');
const startGameBtn = document.getElementById('start-game-btn');

const chatBox = document.getElementById('chat-box');
const questionInput = document.getElementById('question-input');
const sendBtn = document.getElementById('send-btn');
const turnInfo = document.getElementById('turn-info');

let currentRoomCode = '';

// 방 만들기
createBtn.addEventListener('click', () => {
  const name = nicknameInput.value.trim() || '플레이어';
  socket.emit('createRoom', { name });
});

// 방 참가
joinBtn.addEventListener('click', () => {
  const name = nicknameInput.value.trim() || '플레이어';
  const roomCode = roomInput.value.trim();
  if (roomCode) {
    socket.emit('joinRoom', { name, roomCode });
  }
});

// 게임 시작 버튼 클릭 이벤트 (★ 이 부분이 클릭을 감지합니다)
startGameBtn.addEventListener('click', () => {
  console.log('게임 시작 버튼 클릭됨!');
  socket.emit('startGame', { roomCode: currentRoomCode });
});

// 질문/정답 전송
sendBtn.addEventListener('click', sendQuestion);
questionInput.addEventListener('keypress', (e) => {
  if (e.key === 'Enter') sendQuestion();
});

function sendQuestion() {
  const text = questionInput.value.trim();
  if (text) {
    socket.emit('sendQuestion', { roomCode: currentRoomCode, text });
    questionInput.value = '';
  }
}

// Socket 이벤트 수신
socket.on('roomCreated', ({ roomCode, players }) => {
  currentRoomCode = roomCode;
  roomCodeDisplay.innerText = `ROOM: ${roomCode}`;
  updatePlayerList(players);
  menuDiv.classList.add('hidden');
  lobbyDiv.classList.remove('hidden');
});

socket.on('roomJoined', ({ roomCode, players }) => {
  currentRoomCode = roomCode;
  roomCodeDisplay.innerText = `ROOM: ${roomCode}`;
  updatePlayerList(players);
  menuDiv.classList.add('hidden');
  lobbyDiv.classList.remove('hidden');
});

socket.on('updatePlayers', ({ players }) => {
  updatePlayerList(players);
});

socket.on('gameStarted', ({ currentTurnPlayer }) => {
  lobbyDiv.classList.add('hidden');
  gameDiv.classList.remove('hidden');
  appendMessage('SYSTEM', '게임이 시작되었습니다! AI가 비밀 단어를 선택했습니다.');
  updateTurn(currentTurnPlayer);
});

socket.on('newMessage', ({ sender, text }) => {
  appendMessage(sender, text);
});

socket.on('updateTurn', ({ currentTurnPlayer }) => {
  updateTurn(currentTurnPlayer);
});

socket.on('errorMsg', (msg) => {
  alert(msg);
});

function updatePlayerList(players) {
  playerList.innerHTML = '';
  players.forEach(p => {
    const li = document.createElement('li');
    li.innerText = p.name;
    playerList.appendChild(li);
  });
}

function updateTurn(player) {
  if (player.id === socket.id) {
    turnInfo.innerText = '★ 당신의 차례입니다! (질문 또는 정답을 입력하세요)';
  } else {
    turnInfo.innerText = `${player.name} 님의 차례입니다...`;
  }
}

function appendMessage(sender, text) {
  const p = document.createElement('p');
  p.style.margin = '4px 0';
  p.innerHTML = `<strong>${sender}:</strong> ${text}`;
  chatBox.appendChild(p);
  chatBox.scrollTop = chatBox.scrollHeight;
}