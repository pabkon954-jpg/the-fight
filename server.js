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

// 난이도별 백업 단어 풀 (실존 한국어 명사)
const WORD_POOLS = {
  easy: ["사과", "바나나", "호랑이", "강아지", "고양이", "비행기", "컴퓨터", "스마트폰", "피자", "축구공", "냉장고", "자동차"],
  normal: ["전자레인지", "인공위성", "회전목마", "피아노", "에펠탑", "선인장", "소방차", "도서관", "박물관", "나침반", "망원경", "잠수함"],
  hard: ["주상절리", "측우기", "판소리", "해파리", "메트로놈", "피뢰침", "도굴꾼", "시계추", "모래시계", "굴삭기"],
  extreme: ["힉스보손", "초신성", "아포크린샘", "오로라", "테세우스의배", "판게아", "양자얽힘", "스트롬볼리"]
};

// 🤖 실존 단어 생성 함수
async function generateWordByDifficulty(difficulty = 'normal') {
  try {
    const prompt = `
스무고개 게임용 한국어 명사 단어 1개를 선정하세요.
난이도: [ ${difficulty} ] (easy: 쉬움/상식, normal: 일반, hard: 전문, extreme: 난해/추상)
조건: 국어사전에 실존하는 한글 명사 단어 1개만 부연설명 및 특수문자 없이 오직 단어만 출력하세요.
`;

    const completion = await groq.chat.completions.create({
      messages: [{ role: 'user', content: prompt }],
      model: 'llama-3.1-8b-instant',
      temperature: 0.7
    });

    const word = completion.choices[0]?.message?.content?.trim().replace(/[^가-힣]/g, '');
    if (word && word.length >= 2 && word.length <= 8) return word;
  } catch (e) {
    console.error('단어 생성 오류:', e.message);
  }

  const pool = WORD_POOLS[difficulty] || WORD_POOLS.normal;
  return pool[Math.floor(Math.random() * pool.length)];
}

// 🤖 정답 보안 및 사실성 강화된 AI 답변 생성 함수
async function askAI(targetWord, userQuestion, difficulty) {
  try {
    let difficultyRule = "";

    if (difficulty === 'easy') {
      difficultyRule = "답변 끝에 플레이어가 맞추기 쉽도록 객관적인 힌트를 한 문장 짧게 덧붙이세요.";
    } else if (difficulty === 'hard') {
      difficultyRule = "부연설명 없이 오직 '예.', '아니오.', '관련 없음.' 세 가지 중 하나만 단답으로 출력하세요.";
    } else if (difficulty === 'extreme') {
      difficultyRule = "'예.' 또는 '아니오.'로 답하되, 약간 알쏭달쏭하고 비유적인 힌트를 한 문장 덧붙이세요.";
    } else {
      // normal
      difficultyRule = "필요하다면 객관적 사실에 기반한 짧은 부연 설명(한 문장)을 덧붙이세요.";
    }

    const systemPrompt = `
[절대 규칙 - 위반 금지]
1. 당신은 스무고개 AI 출제자입니다.
2. 당신이 마음속으로 생각한 정답 단어는 "${targetWord}" 입니다.
3. **절대로, 무슨 일이 있어도 답변 안에 정답 단어("${targetWord}")나 그 단어의 일부를 직접 말하지 마세요.**
4. 답변은 반드시 "예.", "아니오.", 또는 "관련 없음." 중 하나로 시작해야 합니다.
5. 난이도 지침: ${difficultyRule}
`;

    const completion = await groq.chat.completions.create({
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: `질문: "${userQuestion}"` }
      ],
      model: 'llama-3.1-8b-instant',
      temperature: 0.1, // 무작위성 최소화 (정답 유출 및 환각 방지)
      max_tokens: 100
    });

    return completion.choices[0]?.message?.content?.trim() || "네/아니오로 답변하기 어렵습니다.";
  } catch (error) {
    console.error('Groq API Error:', error.message);
    return "관련이 없거나 알 수 없습니다.";
  }
}

io.on('connection', (socket) => {

  // 1. 방 만들기
  socket.on('createRoom', async ({ username, difficulty }) => {
    const roomId = Math.floor(1000 + Math.random() * 9000).toString();
    const selectedWord = await generateWordByDifficulty(difficulty); 
    
    rooms[roomId] = {
      targetWord: selectedWord,
      difficulty: difficulty || 'normal',
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

    console.log(`[방 생성] 코드: ${roomId} | 난이도: ${difficulty} | 정답: ${selectedWord}`);
    socket.emit('roomCreated', { roomId, gameState: rooms[roomId] });
  });

  // 2. 방 참가하기 (모든 플레이어 목록 및 턴 브로드캐스트)
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

  // 3. 질문/정답 처리 (턴제 검증)
  socket.on('sendQuestion', async ({ question }) => {
    const roomId = socket.roomId;
    const room = rooms[roomId];

    if (!room || room.isGameOver) return;

    const currentTurnUser = room.users[room.currentTurnIndex];
    if (currentTurnUser.id !== socket.id) {
      socket.emit('errorMessage', `지금은 ${currentTurnUser.username} 님의 턴입니다!`);
      return;
    }

    const userQuestion = question.trim();
    if (!userQuestion) return;

    room.questionCount += 1;

    // A. 정답을 맞춘 경우
    if (userQuestion === room.targetWord) {
      room.isGameOver = true;
      const resultData = {
        questionCount: room.questionCount,
        user: socket.username || '익명',
        question: userQuestion,
        answer: `🎉 정답입니다! 정답은 [ ${room.targetWord} ]였습니다!`,
        isGameOver: true,
        currentTurnUser: null
      };
      room.history.push(resultData);
      io.to(roomId).emit('newAnswer', resultData);
      return;
    }

    // B. AI 답변 생성
    const aiAnswer = await askAI(room.targetWord, userQuestion, room.difficulty);

    // C. 20개 질문 소진으로 게임 오버
    if (room.questionCount >= room.maxQuestions) {
      room.isGameOver = true;
      const resultData = {
        questionCount: room.questionCount,
        user: socket.username || '익명',
        question: userQuestion,
        answer: `${aiAnswer} \n\n💀 20번의 질문을 모두 사용하셨습니다. 게임 오버! (정답: [ ${room.targetWord} ])`,
        isGameOver: true,
        currentTurnUser: null
      };
      room.history.push(resultData);
      io.to(roomId).emit('newAnswer', resultData);
      return;
    }

    // D. 다음 턴 넘기기
    room.currentTurnIndex = (room.currentTurnIndex + 1) % room.users.length;
    const nextTurnUser = room.users[room.currentTurnIndex].username;

    const turnResult = {
      questionCount: room.questionCount,
      user: socket.username || '익명',
      question: userQuestion,
      answer: aiAnswer,
      isGameOver: false,
      currentTurnUser: nextTurnUser
    };

    room.history.push(turnResult);
    io.to(roomId).emit('newAnswer', turnResult);
  });

  // 4. 게임 다시하기 (라운드 리셋)
  socket.on('restartGame', async () => {
    const roomId = socket.roomId;
    const room = rooms[roomId];
    if (!room) return;

    const newWord = await generateWordByDifficulty(room.difficulty);
    room.targetWord = newWord;
    room.questionCount = 0;
    room.isGameOver = false;
    room.history = [];
    room.currentTurnIndex = 0;

    console.log(`[게임 재시작] 방 코드: ${roomId} | 새 정답: ${newWord}`);

    io.to(roomId).emit('gameRestarted', {
      gameState: room,
      currentTurnUser: room.users[0]?.username
    });
  });

  // 퇴장 처리
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