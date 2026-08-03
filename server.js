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

// 🎯 실제 표준 한국어 명사로 구성된 엄선 단어 풀 (이상한 합성어 방지)
const REAL_WORDS = [
  "호랑이", "세탁기", "비행기", "떡볶이", "해바라기", "전자레인지", "인공위성", 
  "회전목마", "피아노", "에펠탑", "자전거", "냉장고", "강아지", "고양이", "축구공", 
  "우산", "안경", "시계", "스파게티", "컴퓨터", "스마트폰", "선풍기", "자동차", 
  "부적", "선인장", "경찰관", "소방차", "헬리콥터", "도서관", "박물관", "놀이공원", 
  "청청바지", "기타", "드럼", "바이올린", "돌고래", "펭귄", "북극곰", "상어", 
  "망원경", "현미경", "지구본", "나침반", "우주선", "잠수함", "타자기", "카메라"
];

// 카테고리
const CATEGORIES = [
  "음식/디저트", "전자기기/가전제품", "동물/곤충", "식물/꽃", "직업/역할",
  "악기", "운동/스포츠", "우주/자연현상", "장소/건물", "의류/패션", "교통수단"
];

// 🤖 실존하는 단어 중에서만 선별 및 AI 추천 로직 조합
async function generateRandomWordFromAI() {
  try {
    const randomCategory = CATEGORIES[Math.floor(Math.random() * CATEGORIES.length)];
    const randomSeed = Math.floor(Math.random() * 1000);

    const prompt = `
당신은 스무고개 게임의 출제자입니다.
카테고리: [ ${randomCategory} ]
시드: ${randomSeed}

위 카테고리에 속하며, 한국어 국어사전에 실제로 등재되어 있는 명확하고 상식적인 명사 단어 1개만 추천하세요.
- 존재하지 않는 이상한 단어, 신조어, 오타 같은 단어는 절대로 금지합니다.
- 예: "호랑이", "세탁기", "도서관", "스파게티" 같은 실제 실존 단어만 가능.
- 부연 설명 없이 오직 '단어 하나'만 딱 출력하세요.
`;

    const completion = await groq.chat.completions.create({
      messages: [{ role: 'user', content: prompt }],
      model: 'llama-3.1-8b-instant',
      temperature: 0.7,
      top_p: 0.9
    });

    const word = completion.choices[0]?.message?.content?.trim().replace(/[^가-힣]/g, '');
    
    // 검증: 2자 이상 6자 이하의 순수 한글 단어일 때만 채택, 아니면 단어 풀에서 랜덤 선택
    if (word && word.length >= 2 && word.length <= 6) {
      return word;
    }
  } catch (e) {
    console.error('단어 생성 오류:', e.message);
  }
  
  return REAL_WORDS[Math.floor(Math.random() * REAL_WORDS.length)];
}

// 🤖 사실에 기반한 정확한 AI 답변 생성 함수
async function askAI(targetWord, userQuestion) {
  try {
    const prompt = `
당신은 스무고개 게임의 AI 출제자입니다.
정답 단어: "${targetWord}"
플레이어 질문: "${userQuestion}"

[규칙]
1. 정답 단어("${targetWord}")의 객관적이고 상식적인 사실에만 기반하여 답변하세요. 엉뚱하거나 사실과 다른 억측(예: 특정 대상만 쓴다는 오류)을 하지 마세요.
2. 첫 단어는 반드시 "예", "아니오", "관련 없음" 중 하나로 시작하세요.
3. 부연 설명이 필요한 경우, 객관적 사실 한 문장 이내로 짧게 작성하세요.
4. 정답 단어 자체를 직접 언급하지 마세요.
`;

    const completion = await groq.chat.completions.create({
      messages: [{ role: 'user', content: prompt }],
      model: 'llama-3.1-8b-instant',
      temperature: 0.1, // 사실적 답변을 위해 온도 낮춤
      max_tokens: 150
    });

    return completion.choices[0]?.message?.content?.trim() || "네/아니오로 답변하기 어렵습니다.";
  } catch (error) {
    console.error('Groq API Error:', error.message);
    return "관련이 없거나 알 수 없습니다.";
  }
}

io.on('connection', (socket) => {

  // 1. 방 만들기
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

    console.log(`[방 생성] 코드: ${roomId} | 정답: ${selectedWord}`);
    socket.emit('roomCreated', { roomId, gameState: rooms[roomId] });
  });

  // 2. 방 참가하기 (모든 기존 참여자에게 실시간 유저목록 및 턴 업데이트)
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

    // 본인에게 방 정보 전달
    socket.emit('roomJoined', { roomId, gameState: room });
    
    // 방 전체에 유저 목록 및 현재 턴 상태 브로드캐스트 (방장 및 기존 플레이어 화면 갱신)
    io.to(roomId).emit('updateGameState', { 
      users: room.users, 
      currentTurnUser: room.users[room.currentTurnIndex]?.username 
    });
  });

  // 3. 질문/정답 전송
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

    // 정답 판정
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

    // AI 질문 답변
    const aiAnswer = await askAI(room.targetWord, userQuestion);
    if (room.questionCount >= room.maxQuestions) room.isGameOver = true;

    // 다음 턴
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