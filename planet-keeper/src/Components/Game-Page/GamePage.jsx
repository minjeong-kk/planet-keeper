import { useState } from "react";
import QuizModal from "./QuizModal";
import PlanetUI from "../Planet-ui.jsx";
import useClimateStore, { CLIMATE_VARIABLES } from "../../store/useClimateStore";
import "./GamePage.css";

function GamePage() {
  const [showQuiz, setShowQuiz] = useState(false);
  const values = useClimateStore((state) => state.values);

  return (
    <div className="game-page">
      <div className="game-page__main">
        <div className="game-page__stats-bar">
          {CLIMATE_VARIABLES.map((v) => (
            <span key={v.key}>
              {v.label}: {values[v.key]}
            </span>
          ))}
          <span>(물리엔진 계산값): -</span>
        </div>

        <div className="game-page__arena">
          <div className="game-page__planet-placeholder">
            <PlanetUI />
          </div>

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
