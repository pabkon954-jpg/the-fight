const socket = io();

// UI 엘리먼트
const menuDiv = document.getElementById('menu');
const lobbyDiv = document.getElementById('lobby');
const gameDiv = document.getElementById('game');

const createRoomBtn = document.getElementById('createRoomBtn');
const joinRoomBtn = document.getElementById('joinRoomBtn');
const roomInput = document.getElementById('roomInput');

const lobbyRoomCode = document.getElementById('lobbyRoomCode');
const playerListItems = document.getElementById('playerListItems');
const startBtn = document.getElementById('startBtn');

// 이벤트 리스너: 방 만들기
createRoomBtn.addEventListener('click', () => {
    socket.emit('createRoom');
});

// 이벤트 리스너: 입장하기
joinRoomBtn.addEventListener('click', () => {
    const code = roomInput.value.trim();
    if (code.length === 4) {
        socket.emit('joinRoom', code);
    } else {
        alert('4자리 방 코드를 입력하세요.');
    }
});

// [Socket 이벤트] 방 생성 성공
socket.on('roomCreated', (data) => {
    menuDiv.style.display = 'none';
    lobbyDiv.style.display = 'flex';
    lobbyRoomCode.innerText = `ROOM: ${data.roomCode}`;
    updatePlayerList(data.players);
    startBtn.disabled = false; // 방장은 시작 가능
});

// [Socket 이벤트] 방 입장 성공
socket.on('roomJoined', (data) => {
    menuDiv.style.display = 'none';
    lobbyDiv.style.display = 'flex';
    lobbyRoomCode.innerText = `ROOM: ${data.roomCode}`;
    updatePlayerList(data.players);
    startBtn.disabled = true; // 일반 플레이어는 시작 불가
});

// [Socket 이벤트] 플레이어 목록 업데이트
socket.on('playerJoined', (data) => {
    updatePlayerList(data.players);
});

// [Socket 이벤트] 에러 메시지
socket.on('errorMsg', (msg) => {
    alert(msg);
});

function updatePlayerList(players) {
    playerListItems.innerHTML = '';
    players.forEach(p => {
        const div = document.createElement('div');
        div.className = 'player-row';
        div.innerText = p.name;
        playerListItems.appendChild(div);
    });
}