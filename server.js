const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const { GoogleGenAI } = require('@google/genai');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

app.use(express.static(__dirname));

const rooms = {};

function generateRoomCode() {
  return Math.floor(1000 + Math.random() * 9000).toString();
}

io.on('connection', (socket) => {
  console.log('플레이어 접속:', socket.id);

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

  socket.on('joinRoom', ({ name, roomCode }) => {
    const room = rooms[roomCode];
    if (!room) return socket.emit('errorMsg', '방이 존재하지 않습니다.');
    if (room.isPlaying) return socket.emit('errorMsg', '이미 게임이 진행 중입니다.');

    room.players.push({ id: socket.id, name });
    socket.join(roomCode);
    socket.emit('roomJoined', { roomCode, players: room.players });
    io.to(roomCode).emit('updatePlayers', { players: room.players });
  });

  socket.on('startGame', async ({ roomCode }) => {
    const room = rooms[roomCode];
    if (!room) return;

    try {
      // Gemini API를 사용하여 정답 단어 선정
      const response = await ai.models.generateContent({
    model: 'gemini-1.5-flash',
    contents: '스무고개 게임용 단어를 딱 1개만 정해줘. 한국어로 된 쉬운 명사여야 하고 (예: 사과, 호랑이, 냉장고), 오직 단어 이름만 출력해.'
  });
      
      room.secretWord = response.text.trim();
      room.isPlaying = true;
      room.currentTurnIndex = 0;
      room.history = [];

      console.log(`[${roomCode}] 선택된 단어:`, room.secretWord);

      io.to(roomCode).emit('gameStarted', {
        currentTurnPlayer: room.players[room.currentTurnIndex]
      });
    } catch (err) {
      console.error('Gemini API Error:', err);
      socket.emit('errorMsg', 'AI 단어 생성 실패. GEMINI_API_KEY를 확인하세요.');
    }
  });

  socket.on('sendQuestion', async ({ roomCode, text }) => {
    const room = rooms[roomCode];
    if (!room || !room.isPlaying) return;

    const currentPlayer = room.players[room.currentTurnIndex];
    if (currentPlayer.id !== socket.id) {
      return socket.emit('errorMsg', '당신의 차례가 아닙니다!');
    }

    io.to(roomCode).emit('newMessage', { sender: currentPlayer.name, text });

    // AI 답변 생성
    try {
      const prompt = `
        너는 스무고개 게임의 AI 사회자야.
        비밀 단어: "${room.secretWord}"
        
        플레이어 질문/정답시도: "${text}"
        
        규칙:
        1. 질문이라면 '네', '아니오', '관련없음' 중 하나로 답변하고 1문장으로 짧게 설명을 붙여줘.
        2. 플레이어가 정답을 정확히 맞췄다면 "정답입니다!"라고 말해줘.
      `;

     const response = await ai.models.generateContent({
    model: 'gemini-1.5-flash',
    contents: prompt
  });
      const aiReply = response.text.trim();
      io.to(roomCode).emit('newMessage', { sender: 'AI 사회자', text: aiReply });

      if (aiReply.includes('정답입니다')) {
        io.to(roomCode).emit('newMessage', { sender: 'SYSTEM', text: `축하합니다! 정답은 [${room.secretWord}] 이었습니다!` });
        room.isPlaying = false;
      } else {
        // 다음 순번으로 변경
        room.currentTurnIndex = (room.currentTurnIndex + 1) % room.players.length;
        io.to(roomCode).emit('updateTurn', { currentTurnPlayer: room.players[room.currentTurnIndex] });
      }
    } catch (err) {
      console.error('AI Reply Error:', err);
    }
  });

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
server.listen(PORT, () => console.log(`서버가 실행되었습니다: port ${PORT}`));