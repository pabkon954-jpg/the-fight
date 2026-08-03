import express from 'express';
import { createServer } from 'http';
import { Server } from 'socket.io';
import Groq from 'groq-sdk';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const httpServer = createServer(app);
const io = new Server(httpServer, {
  cors: { origin: "*", methods: ["GET", "POST"] }
});

app.use(express.static(path.join(__dirname, 'public')));

const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });
const rooms = {};

// 🎯 Groq AI를 활용해 완전 무작위 명사 단어 1개 뽑기
async function generateRandomWordFromAI() {
  try {
    const completion = await groq.chat.completions.create({
      messages: [{ 
        role: 'user', 
        content: '스무고개 게임용 한국어 명사 단어(예: 호랑이, 세탁기, 은하수, 비행기, 떡볶이 등) 하나만 무작위로 출력하세요. 다른 부연 설명, 공백, 특수문자 없이 단어만 한 단어로 출력하세요.' 
      }],
      model: 'llama-3.1-8b-instant',
      temperature: 1.0 // 창의성/무작위성 극대화
    });
    
    // 특수문자 및 공백 제거 후 순수 단어만 추출
    const word = completion.choices[0]?.message?.content?.trim().replace(/[^가-힣a-zA-A0-9]/g, '');
    return word || "사과";
  } catch (e) {
    console.error('단어 생성 중 오류 발생:', e.message);
    return "바나나";
  }
}

// 🤖 AI 답변 생성 (네/아니오)
async function askAI(targetWord, userQuestion) {
  try {
    const prompt = `
당신은 스무고개 게임의 AI 출제자입니다.
현재 정답 단어: "${targetWord}"
플레이어의 질문: "${userQuestion}"

규칙:
1. 답변은 반드시 "예", "아니오", 또는 "관련 없음/알 수 없음" 중 하나로 시작하세요.
2. 부연 설명이 필요하다면 한 문장 이내로 아주 짧게 덧붙이세요.
3. 정답 단어를 직접적으로 언급하지 마세요.
`;

    const completion = await groq.chat.completions.create({
      messages: [{ role: 'user', content: prompt }],
      model: 'llama-3.1-8b-instant',
      temperature: 0.2,
      max_tokens: 150
    });

    return completion.choices[0]?.message?.content?.trim() || "네/아니오로 답변하기 어렵습니다.";
  } catch (error) {
    console.error('Groq API Error:', error.message);
    return "관련이 없거나 알 수 없습니다.";
  }
}

io.on('connection', (socket) => {

  // 1. 방 만들기 (AI가 랜덤 단어 설정)
  socket.on('createRoom', async ({ username }) => {
    const roomId = Math.floor(1000 + Math.random() * 9000).toString();
    const selectedWord = await generateRandomWordFromAI(); 
    
    rooms[roomId] = {
      targetWord: selectedWord,
      questionCount: 0,
      maxQuestions: 20,
      isGameOver: false,
      users: [{ id: socket.id, username }],
      currentTurnIndex: 0,
      history: []
    };

    socket.join(roomId);
    socket.roomId = roomId;
    socket.username = username;

    console.log(`[방 생성] 코드: ${roomId} | 생성된 정답: ${selectedWord}`);
    socket.emit('roomCreated', { roomId, gameState: rooms[roomId] });
  });

  // 2. 방 참가하기
  socket.on('joinRoom', ({ roomId, username }) => {
    const room = rooms[roomId];
    if (!room) {
      socket.emit('errorMessage', '존재하지 않는 방 번호입니다.');
      return;
    }

    room.users.push({ id: socket.id, username });
    socket.join(roomId);
    socket.roomId = roomId;
    socket.username = username;

    socket.emit('roomJoined', { roomId, gameState: room });
    io.to(roomId).emit('updateGameState', { 
      users: room.users, 
      currentTurnUser: room.users[room.currentTurnIndex]?.username 
    });
  });

  // 3. 질문/정답 전송 및 턴 관리
  socket.on('sendQuestion', async ({ question }) => {
    const roomId = socket.roomId;
    const room = rooms[roomId];

    if (!room || room.isGameOver) return;

    // 현재 턴 유저 체크
    const currentTurnUser = room.users[room.currentTurnIndex];
    if (currentTurnUser.id !== socket.id) {
      socket.emit('errorMessage', `지금은 ${currentTurnUser.username} 님의 턴입니다!`);
      return;
    }

    const userQuestion = question.trim();
    if (!userQuestion) return;

    room.questionCount += 1;

    // 정답을 맞춘 경우
    if (userQuestion === room.targetWord) {
      room.isGameOver = true;
      const resultData = {
        questionCount: room.questionCount,
        user: socket.username || '익명',
        question: userQuestion,
        answer: `🎉 정답입니다! 정답은 [${room.targetWord}]였습니다!`,
        isGameOver: true,
        currentTurnUser: null
      };
      room.history.push(resultData);
      io.to(roomId).emit('newAnswer', resultData);
      return;
    }

    // AI 답변
    const aiAnswer = await askAI(room.targetWord, userQuestion);
    if (room.questionCount >= room.maxQuestions) room.isGameOver = true;

    // 턴 넘기기
    room.currentTurnIndex = (room.currentTurnIndex + 1) % room.users.length;
    const nextTurnUser = room.users[room.currentTurnIndex].username;

    const turnResult = {
      questionCount: room.questionCount,
      user: socket.username || '익명',
      question: userQuestion,
      answer: aiAnswer,
      isGameOver: room.isGameOver,
      currentTurnUser: nextTurnUser
    };

    room.history.push(turnResult);
    io.to(roomId).emit('newAnswer', turnResult);
  });

  // 접속 종료 처리
  socket.on('disconnect', () => {
    const roomId = socket.roomId;
    if (roomId && rooms[roomId]) {
      rooms[roomId].users = rooms[roomId].users.filter(u => u.id !== socket.id);
      if (rooms[roomId].users.length === 0) {
        delete rooms[roomId];
      } else {
        rooms[roomId].currentTurnIndex %= rooms[roomId].users.length;
        io.to(roomId).emit('updateGameState', { 
          users: rooms[roomId].users, 
          currentTurnUser: rooms[roomId].users[rooms[roomId].currentTurnIndex]?.username 
        });
      }
    }
  });
});

const PORT = process.env.PORT || 3000;
httpServer.listen(PORT, () => {
  console.log(`🚀 서버 실행 중 - 포트 ${PORT}`);
});