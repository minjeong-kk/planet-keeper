import { useState } from "react";
import QuizModal from "./QuizModal";
import "./GamePage.css";

function GamePage() {
  const [showQuiz, setShowQuiz] = useState(false);

  return (
    <div className="game-page">
      <div className="game-page__main">
        <div className="game-page__stats-bar">
          <span>빙하 두께: -</span>
          <span>바다: -</span>
          <span>구름 양: -</span>
          <span>대기 두께: -</span>
          <span>CO2: -</span>
          <span>(물리엔진 계산값): -</span>
        </div>

        <div className="game-page__arena">
          {/* 3D 행성 뷰어는 별도 컴포넌트로 연결 예정 */}
          <div className="game-page__planet-placeholder">행성</div>

          <button
            className="game-page__quiz-trigger"
            onClick={() => setShowQuiz(true)}
          >
            문제풀기
          </button>

          {showQuiz && <QuizModal />}
        </div>
      </div>

      <div className="game-page__side">
        <div className="game-page__side-box">간단한 행성 설명</div>
        <div className="game-page__side-box">틀린 횟수 (하트가 깨지는 느낌)</div>
      </div>
    </div>
  );
}

export default GamePage;
