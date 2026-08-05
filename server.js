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

const EXTENDED_CATEGORIES = [
  "음식/요리", "디저트/음료", "전자기기/가전", "동물/곤충", "해양생물",
  "식물/꽃/나무", "직업/전문가", "악기/음악용품", "운동/스포츠", "우주/천체",
  "자연현상/기후", "영화/만화/캐릭터", "세계 랜드마크/건축물", "의류/패션잡화", "학용품/문구",
  "주방용품/식기", "교통수단/탈것", "신체부위/장기", "취미/보드게임", "신화/전설/환상종",
  "역사적 인물", "가구/인테리어", "계절/절기", "전통문화/유물", "의료/건강용품",
  "캠핑/야외용품", "도서/학문분야", "무기/방어구", "도시/국가", "마법/판타지요소"
];

const WORD_POOLS = {
  easy: ["사과", "바나나", "호랑이", "강아지", "고양이", "비행기", "컴퓨터", "스마트폰", "피자", "축구공", "냉장고", "자동차", "우산", "자전거", "피아노"],
  normal: ["전자레인지", "인공위성", "회전목마", "에펠탑", "선인장", "소방차", "도서관", "박물관", "나침반", "망원경", "잠수함", "타자기", "해바라기", "신문지"],
  hard: ["주상절리", "측우기", "판소리", "해파리", "메트로놈", "피뢰침", "도굴꾼", "시계추", "모래시계", "굴삭기", "상형문자", "현악기"],
  extreme: ["힉스보손", "초신성", "아포크린샘", "오로라", "테세우스의배", "판게아", "양자얽힘", "스트롬볼리", "슈뢰딩거의고양이", "이중슬릿"]
};

async function generateWordByDifficulty(difficulty = 'normal') {
  try {
    const randomCategory = EXTENDED_CATEGORIES[Math.floor(Math.random() * EXTENDED_CATEGORIES.length)];
    const seed = Math.floor(Math.random() * 10000);

    const prompt = `
당신은 스무고개 게임의 출제자입니다.
카테고리: [ ${randomCategory} ]
난이도: [ ${difficulty} ]
시드번호: ${seed}

[요구사항]
1. 지정된 카테고리에 정확히 속하며 국어사전에 등재된 표준 한국어 명사 단어 1개만 고르세요.
2. 어색한 조어, 존재하지 않는 단어, 신조어, 특수문자, 따옴표, 공백은 절대 포함하지 마세요.
3. 부연설명 없이 오직 '단어 하나'만 딱 출력하세요.
`;

    const completion = await groq.chat.completions.create({
      messages: [{ role: 'user', content: prompt }],
      model: 'llama-3.1-8b-instant',
      temperature: 0.8
    });

    const word = completion.choices[0]?.message?.content?.trim().replace(/[^가-힣]/g, '');
    if (word && word.length >= 2 && word.length <= 8) return word;
  } catch (e) {
    console.error('단어 생성 오류:', e.message);
  }

  const pool = WORD_POOLS[difficulty] || WORD_POOLS.normal;
  return pool[Math.floor(Math.random() * pool.length)];
}

// 🤖 AI 힌트 및 판정 생성 함수 (2단계 분리 및 문장 잘림 보완)
async function askAI(targetWord, userQuestion, difficulty) {
  try {
    // [1단계] 정답 판정만 엄격하게 처리 (temperature: 0.0)
    const judgePrompt = `
당신은 스무고개 게임의 객관적인 판정관입니다.
마음속 정답: "${targetWord}"
플레이어 질문: "${userQuestion}"

위 질문이 정답 단어에 부합하는지 엄격하게 판단하여 오직 "예.", "아니오.", "관련 없음." 중 하나의 단어로만 답변하세요. 다른 부연설명은 절대로 붙이지 마세요.
`;

    const judgeCompletion = await groq.chat.completions.create({
      messages: [{ role: 'user', content: judgePrompt }],
      model: 'llama-3.1-8b-instant',
      temperature: 0.0,
      max_tokens: 10
    });

    let rawJudgement = judgeCompletion.choices[0]?.message?.content?.trim() || "관련 없음.";
    let judgement = "관련 없음.";
    if (rawJudgement.includes("예")) judgement = "예.";
    else if (rawJudgement.includes("아니오")) judgement = "아니오.";

    // extreme 난이도가 아니면 단순 판정 결과 반환
    if (difficulty !== 'extreme') {
      if (difficulty === 'hard') return judgement;
      return `${judgement} (정답과 관련하여 판단된 결과입니다.)`;
    }

    // [2단계] 판정 결과를 바탕으로 질문 키워드 꼬투리 잡아 조롱 생성 (temperature: 0.6, max_tokens: 100)
    const tauntPrompt = `
당신은 스무고개 게임 플레이어를 신랄하게 비꼬는 악질 AI 출제자입니다.

플레이어의 질문: "${userQuestion}"
판정 결과: "${judgement}"

[지침]
1. 질문("${userQuestion}")에 사용된 단어나 허술한 논리를 콕 집어 신랄하게 비꼬세요.
2. 자연스러운 반말을 사용하고, 반드시 마침표나 물음표로 완결되는 정확한 한 문장으로 작성하세요.
3. 중간에 문장이 끊기거나 이상한 단어를 반복하지 마세요.
4. 부연설명이나 인사말 없이 오직 조롱하는 문장 1개만 출력하세요.

[출력 예시]
질문: "사람 때리면 아픈가요?" -> 당연한 걸 질문이라고 던지는 걸 보니 네 지능 수준이 유추되는구나.
질문: "다이소에서 파나요?" -> 질문 수준이 딱 다이소 천원짜리 코너에 있는 물건 같네.
`;

    const tauntCompletion = await groq.chat.completions.create({
      messages: [{ role: 'user', content: tauntPrompt }],
      model: 'llama-3.1-8b-instant',
      temperature: 0.6,
      max_tokens: 100
    });

    const taunt = tauntCompletion.choices[0]?.message?.content?.trim() || "질문 수준 하고는.";

    return `${judgement} ${taunt}`;

  } catch (error) {
    console.error('Groq API Error:', error.message);
    return "관련 없음. 제대로 된 질문이나 해라.";
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
      difficulty: room.difficulty,
      currentTurnUser: room.users[room.currentTurnIndex]?.username 
    });
  });

  // 3. 질문/정답 처리
  socket.on('sendQuestion', async ({ question }) => {
    const roomId = socket.roomId;
    const room = rooms[roomId];

    if (!room || room.isGameOver) return;

    const currentTurnUser = room.users[room.currentTurnIndex];
    if (currentTurnUser.id !== socket.id) {
      socket.emit('errorMessage', `지금은 ${currentTurnUser.username} 님의 차례입니다!`);
      return;
    }

    const userQuestion = question.trim();
    if (!userQuestion) return;

    room.questionCount += 1;

    // 정답 판정
    if (userQuestion === room.targetWord) {
      room.isGameOver = true;
      const resultData = {
        questionCount: room.questionCount,
        user: socket.username || '익명',
        question: userQuestion,
        answer: `🎉 축하합니다! 정답입니다! 정답은 [ ${room.targetWord} ]였습니다!`,
        isGameOver: true,
        currentTurnUser: null
      };
      room.history.push(resultData);
      io.to(roomId).emit('newAnswer', resultData);
      return;
    }

    // AI 답변 생성
    const aiAnswer = await askAI(room.targetWord, userQuestion, room.difficulty);

    // 20개 소진 게임 오버
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

    // 다음 차례 진행
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

  // 4. 게임 다시하기
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

    io.to(roomId).emit('gameRestarted', {
      gameState: room,
      currentTurnUser: room.users[0]?.username
    });
  });

  // 접속 해제
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
          difficulty: rooms[roomId].difficulty,
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