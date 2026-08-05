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

// 🎯 극악 난이도 전용 커스텀 대사 목록 (이곳에 원하는 대사를 추가/수정하세요)
const EXTREME_TAUNTS = [
  "대사 1",
  "대사 2",
  "대사 3"
];

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

async function askAI(targetWord, userQuestion, difficulty) {
  try {
    let difficultyInstruction = "";

    if (difficulty === 'easy') {
      difficultyInstruction = "'예.', '아니오.', '관련 없음.' 뒤에, 아주 짧은 힌트 문장 하나만 덧붙이세요.";
    } else if (difficulty === 'hard') {
      difficultyInstruction = "부연설명을 절대 붙이지 말고, 오직 '예.', '아니오.', '관련 없음.' 단답으로만 출력하세요.";
    } else if (difficulty === 'extreme') {
      difficultyInstruction = "오직 '예.', '아니오.', '관련 없음.' 단답으로만 짧게 출력하세요.";
    } else {
      // normal
      difficultyInstruction = "'예.', '아니오.', '관련 없음.' 뒤에, 다른 비유나 쓸데없는 길고 구체적인 설명 없이 해당 질문의 사실 여부에 대한 10자 이내의 아주 절제된 짧은 부연 설명만 덧붙이세요.";
    }

    const systemPrompt = `
[스무고개 AI 출제자 지침]
1. 마음속 정답 단어: "${targetWord}"
2. 질문자의 질문: "${userQuestion}"

[규칙]
- 질문에 대한 판정은 반드시 "예.", "아니오.", "관련 없음." 중 하나로 시작해야 합니다.
- **[핵심 금지]** 질문과 직접 상관없는 다른 동물, 사물, 생태계, 상세 특징을 길게 늘어놓아서 정답을 쉽게 유추할 수 있는 힌트를 절대 주지 마세요.
- **[절대 금지]** 정답 단어("${targetWord}")의 글자나 음절을 언급하지 마세요.
- 난이도 지침: ${difficultyInstruction}
`;

    const completion = await groq.chat.completions.create({
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userQuestion }
      ],
      model: 'llama-3.1-8b-instant',
      temperature: 0.1,
      max_tokens: 80
    });

    return completion.choices[0]?.message?.content?.trim() || "관련이 없거나 알 수 없습니다.";
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

    // AI 기본 답변 가져오기
    let aiAnswer = await askAI(room.targetWord, userQuestion, room.difficulty);

    // 💥 난이도가 'extreme'(극악)일 경우, 커스텀 랜덤 대사를 AI 답변 '뒤'에 결합
    if (room.difficulty === 'extreme' && EXTREME_TAUNTS.length > 0) {
      const randomIndex = Math.floor(Math.random() * EXTREME_TAUNTS.length);
      const randomTaunt = EXTREME_TAUNTS[randomIndex];
      aiAnswer = `${aiAnswer} ${randomTaunt}`;
    }

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