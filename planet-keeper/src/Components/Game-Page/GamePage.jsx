import { useState } from "react";
import QuizModal from "./QuizModal";
import PlanetUI from "../Planet-ui.jsx";
import { useClimate, slidersToVisual, co2Ppm } from "../../store/ClimateContext.jsx";
import "./GamePage.css";

function GamePage() {
  const [showQuiz, setShowQuiz] = useState(false);
  // 제작 페이지에서 만든 행성 상태를 그대로 이어받는다.
  const { values } = useClimate();
  const visual = slidersToVisual(values);

  return (
    <div className="game-page">
      <div className="game-page__main">
        <div className="game-page__stats-bar">
          <span>빙하 면적: {values.iceThickness}%</span>
          <span>바다 수위: {values.ocean}%</span>
          <span>구름 양: {values.cloud}%</span>
          <span>대기 두께: {values.atmThickness}%</span>
          <span>CO₂: {co2Ppm(values.co2)} ppm</span>
          <span>(물리엔진 계산값): -</span>
        </div>

        <div className="game-page__arena">
          <div className="game-page__planet-placeholder">
            <PlanetUI {...visual} />
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
