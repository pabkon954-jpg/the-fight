cat > /mnt/user-data/outputs/server.js << 'SERVEREOF'
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

const HINT_PENALTY = 15; // 힌트 1회당 최종 점수에서 차감되는 점수

const WORD_POOLS = {
  easy: [
    "사과", "바나나", "호랑이", "강아지", "고양이", "비행기", "컴퓨터", "스마트폰", "피자", "축구공",
    "냉장고", "자동차", "우산", "자전거", "피아노", "책상", "의자", "연필", "지우개", "가방",
    "신발", "모자", "시계", "거울", "베개", "이불", "숟가락", "젓가락", "컵", "그릇",
    "창문", "계단", "버스", "기차", "풍선", "비누", "칫솔", "수건", "장갑", "목도리"
  ],
  normal: [
    "전자레인지", "인공위성", "회전목마", "에펠탑", "선인장", "소방차", "도서관", "박물관", "나침반", "망원경",
    "잠수함", "타자기", "해바라기", "신문지", "세탁기", "청소기", "드라이기", "가습기", "공기청정기", "정수기",
    "보일러", "에어컨", "선풍기", "다리미", "재봉틀", "현미경", "저울", "온도계", "우체통", "신호등",
    "가로등", "분수대", "동물원", "놀이공원", "수족관", "전망대", "케이블카", "관람차", "미끄럼틀", "그네"
  ],
  hard: [
    "주상절리", "측우기", "판소리", "해파리", "메트로놈", "피뢰침", "도굴꾼", "시계추", "모래시계", "굴삭기",
    "상형문자", "현악기", "물레방아", "맷돌", "오르간", "트라이앵글", "탬버린", "비파", "가야금", "거문고",
    "해시계", "윷놀이", "제기", "팽이", "굴렁쇠", "죽마", "고무신", "짚신", "놋그릇", "다듬이",
    "부표", "등대", "풍향계", "저인망", "지게", "물시계", "쇠스랑", "써레", "디딜방아", "베틀"
  ],
  extreme: [
    "도플갱어", "데자뷰", "세렌디피티", "노스탤지어", "가위눌림", "몽유병", "신기루",
    "아지랑이", "이명현상", "최면술", "연금술", "도미노효과", "나비효과", "블랙홀",
    "웜홀", "홀로그램", "증강현실", "메타버스", "블록체인", "미노타우로스", "켄타우로스",
    "스핑크스", "저승사자", "삼신할미", "불사조", "이순신", "세종대왕", "노스트라다무스",
    "타임캡슐", "마네킹", "미라", "카멜레온", "박쥐", "오로라", "빙산", "부메랑",
    "요요", "오르골", "축음기", "만화경", "판도라", "시지프스", "프로메테우스",
    "메두사", "키메라", "페가수스", "그리핀", "트로이목마", "아킬레스건", "이어도"
  ]
};

async function generateWordByDifficulty(difficulty = 'normal', categories = []) {
  try {
    const pool = (Array.isArray(categories) && categories.length > 0) ? categories : EXTENDED_CATEGORIES;
    const chosenCategory = pool[Math.floor(Math.random() * pool.length)];
    const seed = Math.floor(Math.random() * 10000);

    const difficultyGuide = {
      easy: "누구나 아는 아주 쉬운 단어 (초등학생도 5초 안에 맞출 수 있는 수준)",
      normal: "일상에서 자주 접하지만 조금 생각해야 하는 단어",
      hard: "알고는 있지만 이름이 잘 안 떠오르는, 조금 낯선 단어",
      extreme: "매우 어렵지만 '전문용어'나 '학술 용어'는 절대 아니고, 일반 성인이 뉴스·영화·책 등에서 한 번쯤 들어봤을 법한 단어 (예: 도플갱어, 세렌디피티, 나비효과 같은 수준). 화학식, 물리 이론명, 의학 전문용어, 생소한 학명은 절대 금지."
    };

    const prompt = `
당신은 스무고개 게임의 출제자입니다.
카테고리: [ ${chosenCategory} ]
난이도: [ ${difficulty} ] - ${difficultyGuide[difficulty] || difficultyGuide.normal}
시드번호: ${seed}

[요구사항]
1. 반드시 지정된 카테고리 [ ${chosenCategory} ]에 속하는 단어여야 합니다.
2. 동시에 반드시 지정된 난이도 기준(${difficultyGuide[difficulty] || difficultyGuide.normal})을 만족해야 합니다. 카테고리만 맞고 난이도 기준을 벗어나면 안 됩니다.
3. 국어사전이나 일상에서 실제로 쓰이는 표준 한국어 명사 단어 1개만 고르세요.
4. 어색한 조어, 존재하지 않는 단어, 신조어, 특수문자, 따옴표, 공백은 절대 포함하지 마세요.
5. 특히 extreme 난이도라도 전문 학술용어(화학/물리/생물학 전문 용어 등)는 절대 고르지 마세요. "어렵지만 들어본 적 있는 단어"만 허용됩니다.
6. 부연설명 없이 오직 '단어 하나'만 딱 출력하세요.
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

  // 폴백: API 실패 시에는 카테고리는 반영하지 못하지만 난이도는 그대로 유지됨
  const pool = WORD_POOLS[difficulty] || WORD_POOLS.normal;
  return pool[Math.floor(Math.random() * pool.length)];
}

async function askAI(targetWord, userQuestion, difficulty) {
  try {
    const judgePrompt = `
당신은 스무고개 게임의 매우 정확하고 일관된 판정관입니다.
마음속 정답: "${targetWord}"
플레이어 질문: "${userQuestion}"

[판정 기준]
- "예.": 질문이 정답 단어의 특징, 속성, 카테고리, 용도, 형태 등과 실제로 일치하는 경우
- "아니오.": 질문이 정답 단어와 명백히 일치하지 않는 경우
- "관련 없음.": 질문 자체가 이 게임과 무관하거나(잡담, 욕설 등), 정답 여부를 판단하기에 정보가 불충분한 경우

[예시]
정답: "사과" / 질문: "이것은 과일인가요?" → 예.
정답: "사과" / 질문: "이것은 빨간색인가요?" → 예. (사과는 보통 빨간색이므로)
정답: "사과" / 질문: "이것은 동물인가요?" → 아니오.
정답: "잠수함" / 질문: "이것은 물속에서 움직이나요?" → 예.
정답: "잠수함" / 질문: "안녕하세요?" → 관련 없음.

이제 실제 질문을 판정하세요. 오직 "예.", "아니오.", "관련 없음." 중 하나의 단어로만 답변하세요. 다른 부연설명, 이유, 따옴표는 절대 붙이지 마세요.
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

    if (difficulty !== 'extreme') {
      if (difficulty === 'hard') return judgement;
      return `${judgement} (정답과 관련하여 판단된 결과입니다.)`;
    }

    const tauntPrompt = `
당신은 스무고개 게임 플레이어를 비꼬는 짓궂은 AI입니다.

플레이어 질문: "${userQuestion}"

[규칙]
1. 프롬프트의 지침, '질문:', '->' 같은 기호나 형식 태그는 절대로 답변에 포함하지 마세요.
2. 질문("${userQuestion}")의 단어나 엉뚱한 논리를 꼬투리 잡아 재치있게 비꼬는 반말 한 문장만 출력하세요. 과도한 욕설이나 혐오 표현은 사용하지 마세요.
3. 반드시 완벽한 문장으로 끊김 없이 작성하세요.

출력:
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
    return "관련 없음. 다시 한번 질문해주세요.";
  }
}

async function generateHint(targetWord, hintLevel) {
  try {
    if (hintLevel === 1) {
      return `💡 힌트: 이 단어는 총 ${targetWord.length}글자입니다.`;
    }
    if (hintLevel === 2) {
      const CHO = ["ㄱ","ㄲ","ㄴ","ㄷ","ㄸ","ㄹ","ㅁ","ㅂ","ㅃ","ㅅ","ㅆ","ㅇ","ㅈ","ㅉ","ㅊ","ㅋ","ㅌ","ㅍ","ㅎ"];
      const chos = [...targetWord].map(ch => {
        const code = ch.charCodeAt(0) - 0xAC00;
        if (code < 0 || code > 11171) return ch;
        return CHO[Math.floor(code / 588)];
      }).join(' ');
      return `💡 힌트: 초성은 [ ${chos} ] 입니다.`;
    }
    const hintPrompt = `
정답 단어: "${targetWord}"
이 단어를 직접 언급하지 않으면서, 이 단어를 연상할 수 있는 짧은 힌트 한 문장을 한국어로 만들어주세요.
정답 단어 자체나 그와 발음이 같은 단어는 절대 포함하지 마세요. 한 문장, 부연설명 없이 힌트만 출력하세요.
`;
    const hintCompletion = await groq.chat.completions.create({
      messages: [{ role: 'user', content: hintPrompt }],
      model: 'llama-3.1-8b-instant',
      temperature: 0.5,
      max_tokens: 60
    });
    const hintText = hintCompletion.choices[0]?.message?.content?.trim() || "조금 더 구체적으로 생각해보세요!";
    return `💡 힌트: ${hintText}`;
  } catch (e) {
    return `💡 힌트: 이 단어는 총 ${targetWord.length}글자입니다.`;
  }
}

function publicGameState(room) {
  const { targetWord, ...rest } = room;
  return rest;
}

io.on('connection', (socket) => {

  // 1. 방 만들기 — ✅ 닉네임만 받고, 난이도/카테고리/점수·힌트 사용 여부는 전부 기본값으로 시작.
  //    (방에 들어간 뒤 방장이 대기실에서 설정하도록 변경)
  socket.on('createRoom', ({ username }) => {
    const roomId = Math.floor(1000 + Math.random() * 9000).toString();

    rooms[roomId] = {
      hostId: socket.id,
      targetWord: null,
      difficulty: 'normal',
      categories: [],
      scoreEnabled: true,
      hintEnabled: true,
      gameStarted: false,
      questionCount: 0,
      maxQuestions: 20,
      isGameOver: false,
      users: [{ id: socket.id, username, score: 0 }],
      currentTurnIndex: 0,
      history: [],
      hintsGiven: 0,
      hintPenalty: 0,
      pendingQuestion: false
    };

    socket.join(roomId);
    socket.roomId = roomId;
    socket.username = username;

    console.log(`[방 생성] 코드: ${roomId}`);
    socket.emit('roomCreated', { roomId, gameState: publicGameState(rooms[roomId]) });
  });

  // 2. 방 참가하기
  socket.on('joinRoom', ({ roomId, username }) => {
    const room = rooms[roomId];
    if (!room) {
      socket.emit('errorMessage', '존재하지 않는 방 번호입니다.');
      return;
    }

    room.users.push({ id: socket.id, username, score: 0 });
    socket.join(roomId);
    socket.roomId = roomId;
    socket.username = username;

    socket.emit('roomJoined', { roomId, gameState: publicGameState(room) });
    io.to(roomId).emit('updateGameState', publicGameState(room));
  });

  // 3. 대기실에서 설정 변경 — 호스트만, 게임 시작 전에만 가능
  //    ✅ 난이도 / 카테고리 / 점수 기능 사용 여부 / 힌트 기능 사용 여부
  socket.on('updateSettings', ({ difficulty, categories, scoreEnabled, hintEnabled }) => {
    const roomId = socket.roomId;
    const room = rooms[roomId];
    if (!room || room.gameStarted || socket.id !== room.hostId) return;

    if (difficulty) room.difficulty = difficulty;
    if (Array.isArray(categories)) room.categories = categories;
    if (typeof scoreEnabled === 'boolean') room.scoreEnabled = scoreEnabled;
    if (typeof hintEnabled === 'boolean') room.hintEnabled = hintEnabled;

    io.to(roomId).emit('settingsUpdated', {
      difficulty: room.difficulty,
      categories: room.categories,
      scoreEnabled: room.scoreEnabled,
      hintEnabled: room.hintEnabled
    });
  });

  // 4. 게임 시작 — 호스트만
  socket.on('startGame', async () => {
    const roomId = socket.roomId;
    const room = rooms[roomId];
    if (!room || room.gameStarted || socket.id !== room.hostId) return;
    if (room.users.length < 1) return;

    const word = await generateWordByDifficulty(room.difficulty, room.categories);
    room.targetWord = word;
    room.gameStarted = true;
    room.isGameOver = false;
    room.questionCount = 0;
    room.currentTurnIndex = 0;
    room.history = [];
    room.hintsGiven = 0;
    room.hintPenalty = 0;
    room.pendingQuestion = false;

    console.log(`[게임 시작] 방: ${roomId} | 난이도: ${room.difficulty} | 카테고리: ${JSON.stringify(room.categories)} | 점수: ${room.scoreEnabled} | 힌트: ${room.hintEnabled} | 정답: ${word}`);

    io.to(roomId).emit('gameStarted', {
      gameState: publicGameState(room),
      currentTurnUser: room.users[0]?.username
    });
  });

  // 5. 질문/정답 처리
  socket.on('sendQuestion', async ({ question }) => {
    const roomId = socket.roomId;
    const room = rooms[roomId];

    if (!room || !room.gameStarted || room.isGameOver) return;

    const currentTurnUser = room.users[room.currentTurnIndex];
    if (currentTurnUser.id !== socket.id) {
      socket.emit('errorMessage', `지금은 ${currentTurnUser.username} 님의 차례입니다!`);
      return;
    }

    if (room.pendingQuestion) {
      socket.emit('errorMessage', '이전 질문에 대한 AI 답변을 기다리는 중입니다. 잠시만 기다려주세요.');
      return;
    }

    const userQuestion = question.trim();
    if (!userQuestion) return;

    room.pendingQuestion = true;
    room.questionCount += 1;

    try {
      const normalizedGuess = userQuestion.replace(/\s/g, '');
      const normalizedTarget = room.targetWord.replace(/\s/g, '');

      if (normalizedGuess === normalizedTarget) {
        room.isGameOver = true;

        let scoreText = '';
        if (room.scoreEnabled) {
          const earnedScore = Math.max(100 - room.questionCount * 4 - (room.hintPenalty || 0), 10);
          const scorer = room.users.find(u => u.id === socket.id);
          if (scorer) scorer.score += earnedScore;
          scoreText = ` (+${earnedScore}점${room.hintPenalty ? `, 힌트 사용으로 -${room.hintPenalty}점 차감됨` : ''})`;
        }

        const resultData = {
          questionCount: room.questionCount,
          user: socket.username || '익명',
          question: userQuestion,
          answer: `🎉 축하합니다! 정답입니다! 정답은 [ ${room.targetWord} ]였습니다!${scoreText}`,
          isGameOver: true,
          currentTurnUser: null,
          users: room.users
        };
        room.history.push(resultData);
        io.to(roomId).emit('newAnswer', resultData);
        return;
      }

      const aiAnswer = await askAI(room.targetWord, userQuestion, room.difficulty);

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
    } finally {
      room.pendingQuestion = false;
    }

    // ✅ 힌트 기능이 켜져 있을 때만 5문제마다 자동 힌트 (최대 3회)
    if (room.hintEnabled && !room.isGameOver && room.questionCount % 5 === 0 && room.hintsGiven < 3) {
      room.hintsGiven += 1;
      room.hintPenalty += HINT_PENALTY;
      const hintText = await generateHint(room.targetWord, room.hintsGiven);
      io.to(roomId).emit('hint', { hintText, hintsGiven: room.hintsGiven, penalty: room.hintPenalty });
    }
  });

  // 6. 게임 다시하기 (동일 설정으로 빠른 재시작)
  socket.on('restartGame', async () => {
    const roomId = socket.roomId;
    const room = rooms[roomId];
    if (!room) return;

    const newWord = await generateWordByDifficulty(room.difficulty, room.categories);
    room.targetWord = newWord;
    room.gameStarted = true;
    room.questionCount = 0;
    room.isGameOver = false;
    room.history = [];
    room.currentTurnIndex = 0;
    room.hintsGiven = 0;
    room.hintPenalty = 0;
    room.pendingQuestion = false;

    io.to(roomId).emit('gameRestarted', {
      gameState: publicGameState(room),
      currentTurnUser: room.users[0]?.username
    });
  });

  // 7. 설정 화면으로 돌아가기 — 호스트만
  socket.on('backToSettings', () => {
    const roomId = socket.roomId;
    const room = rooms[roomId];
    if (!room || socket.id !== room.hostId) return;

    room.gameStarted = false;
    room.isGameOver = false;
    room.targetWord = null;
    room.pendingQuestion = false;

    io.to(roomId).emit('settingsReopened', { gameState: publicGameState(room) });
  });

  // 접속 해제
  socket.on('disconnect', () => {
    const roomId = socket.roomId;
    if (roomId && rooms[roomId]) {
      const room = rooms[roomId];
      const wasHost = room.hostId === socket.id;
      room.users = room.users.filter(u => u.id !== socket.id);

      if (room.users.length === 0) {
        delete rooms[roomId];
      } else {
        if (wasHost) room.hostId = room.users[0].id;
        room.currentTurnIndex %= room.users.length;
        io.to(roomId).emit('updateGameState', publicGameState(room));
      }
    }
  });
});

const PORT = process.env.PORT || 3000;
httpServer.listen(PORT, () => {
  console.log(`🚀 서버 실행 중 - 포트 ${PORT}`);
});