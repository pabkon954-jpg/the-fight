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
  // 방 만들기
  socket.on('createRoom', ({ username }) => {
    const roomId = Math.floor(1000 + Math.random() * 9000).toString();
    rooms[roomId] = {
      targetWord: "사과",
      questionCount: 0,
      maxQuestions: 20,
      isGameOver: false,
      users: [{ id: socket.id, username }],
      history: []
    };

    socket.join(roomId);
    socket.roomId = roomId;
    socket.username = username;

    socket.emit('roomCreated', { roomId, gameState: rooms[roomId] });
  });

  // 방 참가하기
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
    // 모든 플레이어에게 전달할 때 users 배열 전체를 확실히 넘겨줍니다.
    io.to(roomId).emit('userJoined', { username, users: room.users });
  });

  // 질문 전송
  socket.on('sendQuestion', async ({ question }) => {
    const roomId = socket.roomId;
    const room = rooms[roomId];

    if (!room || room.isGameOver) return;

    const userQuestion = question.trim();
    if (!userQuestion) return;

    room.questionCount += 1;

    if (userQuestion === room.targetWord) {
      room.isGameOver = true;
      const resultData = {
        questionCount: room.questionCount,
        user: socket.username || '익명',
        question: userQuestion,
        answer: `🎉 정답입니다! 정답은 [${room.targetWord}]였습니다!`,
        isGameOver: true
      };
      room.history.push(resultData);
      io.to(roomId).emit('newAnswer', resultData);
      return;
    }

    const aiAnswer = await askAI(room.targetWord, userQuestion);
    if (room.questionCount >= room.maxQuestions) room.isGameOver = true;

    const turnResult = {
      questionCount: room.questionCount,
      user: socket.username || '익명',
      question: userQuestion,
      answer: aiAnswer,
      isGameOver: room.isGameOver
    };

    room.history.push(turnResult);
    io.to(roomId).emit('newAnswer', turnResult);
  });

  socket.on('disconnect', () => {
    const roomId = socket.roomId;
    if (roomId && rooms[roomId]) {
      rooms[roomId].users = rooms[roomId].users.filter(u => u.id !== socket.id);
      if (rooms[roomId].users.length === 0) {
        delete rooms[roomId];
      } else {
        io.to(roomId).emit('userLeft', { users: rooms[roomId].users });
      }
    }
  });
});

const PORT = process.env.PORT || 3000;
httpServer.listen(PORT, () => {
  console.log(`🚀 서버가 포트 ${PORT}에서 실행 중입니다.`);
});