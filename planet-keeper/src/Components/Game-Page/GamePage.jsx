import { useEffect, useState } from "react";
import QuizModal from "./QuizModal";
import PlanetUI from "../Planet-ui.jsx";
import useClimateStore from "../../store/useClimateStore";
import { slidersToVisual, co2Ppm } from "../../utils/climateVisual.js";
import { computeClimateV2, mapSlidersToClimateInputs, REFERENCE_TEMP_K } from "../../utils/physicsEngine.js";
import { predictClimateState } from "../../utils/climateClassifier.js";
import "./GamePage.css";

function GamePage() {
  const [showQuiz, setShowQuiz] = useState(false);
  // 제작 페이지에서 만든 행성 상태를 그대로 이어받는다.
  const values = useClimateStore((state) => state.values);
  const visual = slidersToVisual(values);

  const [climateState, setClimateState] = useState(null);

  useEffect(() => {
    let cancelled = false;
    const climateInputs = mapSlidersToClimateInputs(values);
    const physics = computeClimateV2({ ...climateInputs, currentTemperature: REFERENCE_TEMP_K });

    predictClimateState(climateInputs, physics)
      .then((result) => {
        if (!cancelled) setClimateState(result);
      })
      .catch((err) => console.error("[GamePage] 기후 상태 예측 실패:", err));

    return () => {
      cancelled = true;
    };
  }, [values]);

  return (
    <div className="game-page">
      <div className="game-page__main">
        <div className="game-page__stats-bar">
          <span>빙하 면적: {values.iceThickness}%</span>
          <span>바다 수위: {values.ocean}%</span>
          <span>구름 양: {values.cloud}%</span>
          <span>대기 두께: {values.atmThickness}%</span>
          <span>CO₂: {co2Ppm(values.co2)} ppm</span>
          <span>(물리엔진 계산값): {climateState ? climateState.label : "계산 중..."}</span>
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
