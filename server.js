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
  cors: {
    origin: "*",
    methods: ["GET", "POST"]
  }
});

// 정적 파일 제공 (public 폴더)
app.use(express.static(path.join(__dirname, 'public')));

// Groq API 클라이언트 초기화 (환경변수 GROQ_API_KEY 사용)
const groq = new Groq({ 
  apiKey: process.env.GROQ_API_KEY 
});

// 게임 상태 관리
let gameState = {
  targetWord: "사과", // 기본 정답 (필요시 변경 가능)
  questionCount: 0,
  maxQuestions: 20,
  isGameOver: false,
  history: []
};

/**
 * Groq AI에게 질문을 보내고 답변을 받는 함수
 */
async function askAI(userQuestion) {
  try {
    const prompt = `
당신은 스무고개 게임의 AI 출제자입니다.
현재 정답 단어는 "${gameState.targetWord}" 입니다.
플레이어의 질문: "${userQuestion}"

규칙:
1. 답변은 반드시 "예", "아니오", 또는 "관련 없음/알 수 없음" 중 하나로 시작하세요.
2. 부연 설명이 필요하다면 한 문장 이내로 아주 짧게 덧붙이세요.
3. 정답 단어를 직접적으로 언급하지 마세요.
`;

    const completion = await groq.chat.completions.create({
      messages: [
        {
          role: 'user',
          content: prompt
        }
      ],
      model: 'llama-3.1-8b-instant', // 무료로 사용 가능한 가벼운 Llama 모델
      temperature: 0.2,
      max_tokens: 150
    });

    return completion.choices[0]?.message?.content?.trim() || "네/아니오로 답변하기 어렵습니다.";
  } catch (error) {
    console.error('Groq API Error:', error.message);
    
    // API 장애/에러 발생 시 게임이 튕기지 않도록 기본 Fallback 응답 제공
    if (userQuestion.includes(gameState.targetWord)) {
      return "예! 정답입니다!";
    }
    return "[시스템] AI 응답 지연으로 기본 답변을 제공합니다: 관련이 없거나 알 수 없습니다.";
  }
}

// Socket.io 통신 로직
io.on('connection', (socket) => {
  console.log('클라이언트 연결됨:', socket.id);

  // 접속 시 현재 게임 상태 전달
  socket.emit('gameState', gameState);

  // 플레이어가 질문 또는 정답을 입력했을 때
  socket.on('sendQuestion', async (data) => {
    if (gameState.isGameOver) {
      socket.emit('errorMessage', '이미 게임이 종료되었습니다.');
      return;
    }

    const userQuestion = data.question.trim();
    if (!userQuestion) return;

    // 질문 횟수 증가
    gameState.questionCount += 1;

    // 정답 맞춤 여부 확인
    if (userQuestion === gameState.targetWord) {
      gameState.isGameOver = true;
      const resultData = {
        questionCount: gameState.questionCount,
        user: data.username || '익명',
        question: userQuestion,
        answer: `🎉 정답입니다! 정답은 [${gameState.targetWord}]였습니다!`,
        isGameOver: true,
        isSuccess: true
      };
      gameState.history.push(resultData);
      io.emit('newAnswer', resultData);
      return;
    }

    // AI에게 질문 던지기
    const aiAnswer = await askAI(userQuestion);

    // 20고개 초과 여부 확인
    if (gameState.questionCount >= gameState.maxQuestions) {
      gameState.isGameOver = true;
    }

    const turnResult = {
      questionCount: gameState.questionCount,
      user: data.username || '익명',
      question: userQuestion,
      answer: aiAnswer,
      isGameOver: gameState.isGameOver,
      isSuccess: false
    };

    gameState.history.push(turnResult);
    io.emit('newAnswer', turnResult);
  });

  // 게임 리셋 요청
  socket.on('resetGame', (newWord) => {
    gameState = {
      targetWord: newWord || "바나나",
      questionCount: 0,
      maxQuestions: 20,
      isGameOver: false,
      history: []
    };
    io.emit('gameReset', gameState);
  });

  socket.on('disconnect', () => {
    console.log('클라이언트 연결 해제됨:', socket.id);
  });
});

const PORT = process.env.PORT || 3000;
httpServer.listen(PORT, () => {
  console.log(`🚀 서버가 포트 ${PORT}에서 실행 중입니다.`);
});