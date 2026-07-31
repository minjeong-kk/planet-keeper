import { useEffect, useState } from "react";
import QuizModal from "./QuizModal";
import PlanetUI from "../Planet-ui.jsx";
import useClimateStore from "../../store/useClimateStore";
import { slidersToVisual, co2Ppm } from "../../utils/climateVisual.js";
import { computeClimateV2, mapSlidersToClimateInputs, REFERENCE_TEMP_K } from "../../utils/physicsEngine.js";
import { predictClimateState } from "../../utils/climateClassifier.js";
import "./GamePage.css";

const ENERGY_BALANCE_EPSILON = 5;

function energyStateOf(deltaEnergy) {
  if (deltaEnergy > ENERGY_BALANCE_EPSILON) return "Energy Surplus";
  if (deltaEnergy < -ENERGY_BALANCE_EPSILON) return "Energy Deficit";
  return "Stable";
}

function energyStateDescription(deltaEnergy) {
  if (deltaEnergy > ENERGY_BALANCE_EPSILON) {
    return "흡수 에너지가 방출 에너지보다 큽니다. CO₂를 줄이거나 알베도를 높여 평형에 가깝게 만드세요.";
  }
  if (deltaEnergy < -ENERGY_BALANCE_EPSILON) {
    return "방출 에너지가 더 큽니다. 온실효과를 높이거나 알베도를 낮춰 에너지 균형을 맞춰보세요.";
  }
  return "현재 행성은 에너지 평형 상태에 가깝습니다.";
}

function GamePage() {
  const [showQuiz, setShowQuiz] = useState(false);
  // 제작 페이지에서 만든 행성 상태를 그대로 이어받는다.
  const values = useClimateStore((state) => state.values);
  const visual = slidersToVisual(values);

  const climateInputs = mapSlidersToClimateInputs(values);
  const physics = computeClimateV2({ ...climateInputs, currentTemperature: REFERENCE_TEMP_K });

  const [climateState, setClimateState] = useState(null);

  useEffect(() => {
    let cancelled = false;

    predictClimateState(climateInputs, physics)
      .then((result) => {
        if (!cancelled) setClimateState(result);
      })
      .catch((err) => console.error("[GamePage] 기후 상태 예측 실패:", err));

    return () => {
      cancelled = true;
    };
    // climateInputs/physics는 values로부터 매 렌더마다 새로 파생되는 값이라
    // deps에 넣으면 setClimateState -> 재렌더 -> 새 객체 -> 재실행의 무한 루프가 된다.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [values]);

  return (
    <div className="game-page">
      <div className="game-page__main">
        <div className="game-page__stats-bar">
          <span>빙하: {values.iceThickness}%</span>
          <span>바다: {values.ocean}%</span>
          <span>구름: {values.cloud}%</span>
          <span>대기: {values.atmThickness}%</span>
          <span>CO₂: {co2Ppm(values.co2)} ppm</span>
          <span>현재 온도: {physics.currentTemperature.toFixed(1)} K</span>
          <span>ASR: {physics.absorbedRadiation.toFixed(2)}</span>
          <span>OLR: {physics.outgoingRadiation.toFixed(2)}</span>
          <span>ΔE: {physics.deltaEnergy.toFixed(2)}</span>
          <span>Albedo: {physics.albedo.toFixed(2)}</span>
          <span>Greenhouse: {physics.greenhouseStrength.toFixed(2)}</span>
          <span>ε: {physics.effectiveEmissivity.toFixed(2)}</span>
          <span>ML 상태: {climateState ? climateState.label : "계산 중..."}</span>
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
        <div className="game-page__side-box">
          <h3>에너지 상태</h3>
          <h2>{energyStateOf(physics.deltaEnergy)}</h2>
          <p>{energyStateDescription(physics.deltaEnergy)}</p>
        </div>
        <div className="game-page__side-box">틀린 횟수 (하트가 깨지는 느낌)</div>
      </div>
    </div>
  );
}

export default GamePage;
