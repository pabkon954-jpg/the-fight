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

// 🎯 다양한 카테고리 목록 (AI의 단어 선택 폭을 대폭 확장)
const CATEGORIES = [
  "음식/디저트", "전자기기/가전제품", "동물/곤충", "식물/꽃", "직업/역할",
  "악기", "운동/스포츠", "우주/자연현상", "영화/동화/만화 캐릭터", "장소/건물/랜드마크",
  "의류/패션잡화", "학용품/문구류", "주방용품", "교통수단", "신체부위",
  "취미/게임", "신화/전설", "역사적 인물", "가구/인테리어", "계절/날씨"
];

// 🤖 완전히 무작위적이고 방대한 단어를 만드는 AI 생성 함수
async function generateRandomWordFromAI() {
  try {
    const randomCategory = CATEGORIES[Math.floor(Math.random() * CATEGORIES.length)];
    const randomSeed = Math.floor(Math.random() * 1000);

    const prompt = `
당신은 스무고개 게임의 출제자입니다.
카테고리: [ ${randomCategory} ]
시드번호: ${randomSeed}

위 카테고리에 속하는 한국어 명사 단어 1개를 아주 무작위로 하나 골라주세요.
- 흔하고 뻔한 단어(사과, 비행기, 호랑이 등) 대신 매번 색다르고 재미있는 단어를 골라주세요.
- 2글자에서 6글자 사이의 명사 단어여야 합니다.
- 부연 설명, 공백, 특수문자, 따옴표 없이 오직 '단어 하나'만 딱 출력하세요.
`;

    const completion = await groq.chat.completions.create({
      messages: [{ role: 'user', content: prompt }],
      model: 'llama-3.1-8b-instant',
      temperature: 1.2, // 무작위성 극대화
      top_p: 0.95
    });

    const word = completion.choices[0]?.message?.content?.trim().replace(/[^가-힣a-zA-Z0-9]/g, '');
    return word || "스파게티";
  } catch (e) {
    console.error('단어 생성 오류:', e.message);
    const backupWords = ["해바라기", "인공위성", "전자레인지", "돌고래", "회전목마", "피아노", "에펠탑"];
    return backupWords[Math.floor(Math.random() * backupWords.length)];
  }
}

// 🤖 AI 답변 생성 함수 (네/아니오 및 힌트)
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

  // 1. 방 만들기 (카테고리 기반 무작위 단어 지정)
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

  // 3. 질문 및 정답 처리 (순서 턴제)
  socket.on('sendQuestion', async ({ question }) => {
    const roomId = socket.roomId;
    const room = rooms[roomId];

    if (!room || room.isGameOver) return;

    // 현재 턴 유저 검증
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

    // 다음 순서로 턴 넘기기
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

  // 접속 종료 시 처리
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