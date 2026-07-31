import { useEffect, useState } from "react";
import QuizModal from "./QuizModal";
import PlanetUI from "../Planet-ui.jsx";
import useClimateStore, { CLIMATE_VARIABLES } from "../../store/useClimateStore";
import { slidersToVisual, co2Ppm } from "../../utils/climateVisual.js";
import { mapSlidersToClimateInputs, ENERGY_BALANCE_EPSILON, energyStateOf } from "../../utils/physicsEngine.js";
import { predictClimateState } from "../../utils/climateClassifier.js";
import "./GamePage.css";

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
  // 제작 페이지에서 만든 행성 상태 + Physics 결과를 그대로 이어받는다.
  // Physics Engine은 PlanetCreatePage에서만 실행하고, 여기서는 재호출하지 않는다.
  const values = useClimateStore((state) => state.values);
  const physicsResult = useClimateStore((state) => state.physicsResult);
  const visual = slidersToVisual(values);

  const [climateState, setClimateState] = useState(null);

  useEffect(() => {
    if (!physicsResult) return;
    let cancelled = false;
    const climateInputs = mapSlidersToClimateInputs(values);

    predictClimateState(climateInputs, physicsResult)
      .then((result) => {
        if (!cancelled) setClimateState(result);
      })
      .catch((err) => console.error("[GamePage] 기후 상태 예측 실패:", err));

    return () => {
      cancelled = true;
    };
  }, [values, physicsResult]);

  return (
    <div className="game-page">
      <div className="game-page__main">
        <div className="game-page__stats-bar">
          {CLIMATE_VARIABLES.map(({ key, label }) => (
            <span key={key}>
              {label}: {key === "co2" ? `${co2Ppm(values.co2)} ppm` : `${values[key]}%`}
            </span>
          ))}
          <span>현재 온도: {physicsResult ? physicsResult.currentTemperature.toFixed(1) : "-"} K</span>
          <span>ASR: {physicsResult ? physicsResult.absorbedRadiation.toFixed(2) : "-"}</span>
          <span>OLR: {physicsResult ? physicsResult.outgoingRadiation.toFixed(2) : "-"}</span>
          <span>ΔE: {physicsResult ? physicsResult.deltaEnergy.toFixed(2) : "-"}</span>
          <span>Albedo: {physicsResult ? physicsResult.albedo.toFixed(2) : "-"}</span>
          <span>Greenhouse: {physicsResult ? physicsResult.greenhouseStrength.toFixed(2) : "-"}</span>
          <span>ε: {physicsResult ? physicsResult.effectiveEmissivity.toFixed(2) : "-"}</span>
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
          <h2>{physicsResult ? energyStateOf(physicsResult.deltaEnergy) : "계산 중..."}</h2>
          <p>{physicsResult ? energyStateDescription(physicsResult.deltaEnergy) : ""}</p>
        </div>
        <div className="game-page__side-box">틀린 횟수 (하트가 깨지는 느낌)</div>
      </div>
    </div>
  );
}

export default GamePage;
