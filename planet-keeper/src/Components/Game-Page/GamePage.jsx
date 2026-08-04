import { useEffect, useMemo, useState } from "react";
import QuizModal from "./QuizModal";
import PlanetUI from "../Planet-ui.jsx";
import useClimateStore, { CLIMATE_VARIABLES } from "../../store/useClimateStore";
import { slidersToVisual, co2Ppm } from "../../utils/climateVisual.js";
import {
  computeClimateV2,
  mapSlidersToClimateInputs,
  equilibriumTemperatureOf,
  planetStateOf,
  PLANET_STATES,
  ENERGY_BALANCE_EPSILON,
  energyStateOf,
} from "../../utils/physicsEngine.js";
import { predictClimateState } from "../../utils/climateClassifier.js";
import "./GamePage.css";

// 피드백 타이머 간격(ms). 이 주기마다 ΔE 방향으로 온도가 한 걸음 움직인다.
// 500ms면 평형 밴드(|ΔE| ≤ 5) 진입까지 중간 20초, 최악 45초 정도가 걸린다.
const TEMPERATURE_TICK_MS = 500;

const KOREAN_BY_STATE = Object.fromEntries(
  PLANET_STATES.map(({ state, korean }) => [state, korean]),
);

function energyStateDescription(deltaEnergy) {
  if (deltaEnergy > ENERGY_BALANCE_EPSILON) {
    return "흡수 에너지가 방출 에너지보다 큽니다. 온도가 계속 오르는 중입니다 — CO₂를 줄이거나 알베도를 높여 평형에 가깝게 만드세요.";
  }
  if (deltaEnergy < -ENERGY_BALANCE_EPSILON) {
    return "방출 에너지가 더 큽니다. 온도가 계속 내려가는 중입니다 — 온실효과를 높이거나 알베도를 낮춰 에너지 균형을 맞춰보세요.";
  }
  return "현재 행성은 에너지 평형 상태에 가깝습니다.";
}

function GamePage() {
  const [showQuiz, setShowQuiz] = useState(false);
  const values = useClimateStore((state) => state.values);
  const currentTemperature = useClimateStore((state) => state.currentTemperature);
  const advanceTemperature = useClimateStore((state) => state.advanceTemperature);
  const visual = slidersToVisual(values);

  // Physics 결과는 (슬라이더 + 현재 온도)의 순수 함수라 store에 담지 않고
  // 여기서 파생시킨다 → 제작 페이지를 거치지 않고 /game에 바로 들어와도 정상 동작한다.
  const climateInputs = useMemo(() => mapSlidersToClimateInputs(values), [values]);
  const physicsResult = useMemo(
    () => computeClimateV2({ ...climateInputs, currentTemperature }),
    [climateInputs, currentTemperature],
  );
  const equilibriumTemperature = useMemo(
    () => equilibriumTemperatureOf(physicsResult),
    [physicsResult],
  );
  const ruleState = planetStateOf(physicsResult.deltaEnergy, currentTemperature);

  const [climateState, setClimateState] = useState(null);
  const [predictError, setPredictError] = useState(null);

  // 피드백 타이머: ΔE 방향으로 온도를 계속 움직인다(양의 피드백 루프의 구동부).
  // advanceTemperature는 store 안에서 최신 상태를 읽으므로 참조가 안정적이다.
  useEffect(() => {
    const timer = setInterval(advanceTemperature, TEMPERATURE_TICK_MS);
    return () => clearInterval(timer);
  }, [advanceTemperature]);

  useEffect(() => {
    let cancelled = false;
    predictClimateState(climateInputs, physicsResult)
      .then((result) => {
        if (cancelled) return;
        setClimateState(result);
        setPredictError(null);
      })
      .catch((err) => {
        console.error("[GamePage] 기후 상태 예측 실패:", err);
        if (!cancelled) setPredictError(err);
      });

    return () => {
      cancelled = true;
    };
  }, [climateInputs, physicsResult]);

  const mlStateText = predictError
    ? "예측 실패"
    : climateState
      ? `${KOREAN_BY_STATE[climateState.state] ?? climateState.label} (${climateState.label})`
      : "계산 중...";

  return (
    <div className="game-page">
      <div className="game-page__main">
        <div className="game-page__stats-bar">
          {CLIMATE_VARIABLES.map(({ key, label }) => (
            <span key={key}>
              {label}: {key === "co2" ? `${co2Ppm(values.co2)} ppm` : `${values[key]}%`}
            </span>
          ))}
          <span>현재 온도: {currentTemperature.toFixed(1)} K</span>
          <span>평형 온도: {equilibriumTemperature.toFixed(1)} K</span>
          <span>ASR: {physicsResult.absorbedRadiation.toFixed(2)}</span>
          <span>OLR: {physicsResult.outgoingRadiation.toFixed(2)}</span>
          <span>ΔE: {physicsResult.deltaEnergy.toFixed(2)}</span>
          <span>Albedo: {physicsResult.albedo.toFixed(2)}</span>
          <span>Greenhouse: {physicsResult.greenhouseStrength.toFixed(2)}</span>
          <span>ε: {physicsResult.effectiveEmissivity.toFixed(2)}</span>
          <span>ML 상태: {mlStateText}</span>
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
          <h2>{energyStateOf(physicsResult.deltaEnergy)}</h2>
          <p>{energyStateDescription(physicsResult.deltaEnergy)}</p>
        </div>
        <div className="game-page__side-box">
          <h3>행성 상태 (물리엔진 판정)</h3>
          <h2>{KOREAN_BY_STATE[ruleState]}</h2>
          <p>
            현재 온도 {currentTemperature.toFixed(1)} K → 평형 온도{" "}
            {equilibriumTemperature.toFixed(1)} K 로 향하는 중입니다.
          </p>
        </div>
        <div className="game-page__side-box">틀린 횟수 (하트가 깨지는 느낌)</div>
      </div>
    </div>
  );
}

export default GamePage;
