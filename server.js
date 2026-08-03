const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const { GoogleGenAI } = require('@google/genai');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

// Gemini API 초기화
const apiKey = process.env.GEMINI_API_KEY;
const ai = new GoogleGenAI({ apiKey: apiKey });

app.use(express.static(__dirname));

const rooms = {};

// 비상용 단어 리스트 (API 장애 시 사용)
const fallbackWords = ['사과', '바나나', '호랑이', '냉장고', '자전거', '피아노', '컴퓨터', '비행기'];

function generateRoomCode() {
  return Math.floor(1000 + Math.random() * 9000).toString();
}

io.on('connection', (socket) => {
  console.log('플레이어 접속:', socket.id);

  // 방 생성
  socket.on('createRoom', ({ name }) => {
    const roomCode = generateRoomCode();
    rooms[roomCode] = {
      players: [{ id: socket.id, name }],
      isPlaying: false,
      secretWord: '',
      history: [],
      currentTurnIndex: 0
    };
    socket.join(roomCode);
    socket.emit('roomCreated', { roomCode, players: rooms[roomCode].players });
  });

  // 방 참가
  socket.on('joinRoom', ({ name, roomCode }) => {
    const room = rooms[roomCode];
    if (!room) return socket.emit('errorMsg', '방이 존재하지 않습니다.');
    if (room.isPlaying) return socket.emit('errorMsg', '이미 게임이 진행 중입니다.');

    room.players.push({ id: socket.id, name });
    socket.join(roomCode);
    socket.emit('roomJoined', { roomCode, players: room.players });
    io.to(roomCode).emit('updatePlayers', { players: room.players });
  });

  // 게임 시작
  socket.on('startGame', async ({ roomCode }) => {
    console.log('서버 startGame 수신, roomCode:', roomCode);
    const room = rooms[roomCode];
    if (!room) return socket.emit('errorMsg', '방을 찾을 수 없습니다.');

    // 랜덤 기본 단어 세팅 (API 에러 대비)
    let secretWord = fallbackWords[Math.floor(Math.random() * fallbackWords.length)];

    try {
      console.log('Gemini API 단어 생성 시도 중...');
      const response = await ai.models.generateContent({
        model: 'gemini-2.0-flash',
        contents: '스무고개 게임용 단어를 딱 1개만 정해줘. 한국어로 된 쉬운 명사여야 하고 (예: 사과, 호랑이, 냉장고), 오직 단어 이름만 출력해.'
      });
      
      if (response && response.text) {
        const cleanText = response.text.trim().replace(/[^가-힣a-zA-Z0-9]/g, '');
        if (cleanText) secretWord = cleanText;
      }
    } catch (err) {
      console.error('Gemini API Start Error:', err.message || err);
    }

    room.secretWord = secretWord;
    room.isPlaying = true;
    room.currentTurnIndex = 0;
    room.history = [];

    console.log(`[${roomCode}] 게임 시작! 선택된 비밀 단어:`, room.secretWord);

    io.to(roomCode).emit('gameStarted', {
      currentTurnPlayer: room.players[room.currentTurnIndex]
    });
  });

  // 질문 및 정답 처리
  socket.on('sendQuestion', async ({ roomCode, text }) => {
    const room = rooms[roomCode];
    if (!room || !room.isPlaying) return;

    const currentPlayer = room.players[room.currentTurnIndex];
    if (currentPlayer.id !== socket.id) {
      return socket.emit('errorMsg', '당신의 차례가 아닙니다!');
    }

    // 플레이어 질문 메시지 방송
    io.to(roomCode).emit('newMessage', { sender: currentPlayer.name, text });

    let aiReply = '';

    try {
      const prompt = `
        너는 스무고개 게임의 AI 사회자야.
        비밀 단어: "${room.secretWord}"
        
        플레이어 질문/정답시도: "${text}"
        
        규칙:
        1. 질문이라면 '네', '아니오', '관련없음' 중 하나로 답변하고 1문장으로 짧게 설명을 붙여줘.
        2. 플레이어가 정답을 정확히 맞췄다면 "정답입니다!"라고 정확히 말해줘.
      `;

      const response = await ai.models.generateContent({
        model: 'gemini-2.0-flash',
        contents: prompt
      });

      if (response && response.text) {
        aiReply = response.text.trim();
      }
    } catch (err) {
      console.error('AI Reply Error Details:', err.message || err);
      
      // API 연결 실패 시 백엔드 자체 폴백 로직 (게임이 멈추지 않음)
      if (text.includes(room.secretWord)) {
        aiReply = "정답입니다!";
      } else {
        aiReply = "아니오 (AI 상태 불안정으로 기본 답변됩니다)";
      }
    }

    // AI 사회자 답변 방송
    io.to(roomCode).emit('newMessage', { sender: 'AI 사회자', text: aiReply });

    // 정답 확인 및 턴 넘김 처리
    if (aiReply.includes('정답입니다')) {
      io.to(roomCode).emit('newMessage', { sender: 'SYSTEM', text: `🎉 축하합니다! 정답은 [${room.secretWord}] 이었습니다!` });
      room.isPlaying = false;
    } else {
      room.currentTurnIndex = (room.currentTurnIndex + 1) % room.players.length;
      io.to(roomCode).emit('updateTurn', { currentTurnPlayer: room.players[room.currentTurnIndex] });
    }
  });

  // 접속 종료
  socket.on('disconnect', () => {
    for (const roomCode in rooms) {
      const room = rooms[roomCode];
      room.players = room.players.filter(p => p.id !== socket.id);
      if (room.players.length === 0) {
        delete rooms[roomCode];
      } else {
        io.to(roomCode).emit('updatePlayers', { players: room.players });
      }
    }
  });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log(`서버 실행 완료: 포트 ${PORT}`));