import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import QuizModal from "./QuizModal";
import ClimateAnalysisPanel from "./ClimateAnalysisPanel";
import ItemStage from "./ItemStage";
import PlanetUI from "../Planet-ui.jsx";
import useClimateStore, { CLIMATE_VARIABLES, GAME_STAGES } from "../../store/useClimateStore";
import { slidersToVisual, co2Ppm } from "../../utils/climateVisual.js";
import { mapSlidersToClimateInputs } from "../../utils/physicsEngine.js";
import { predictClimateState } from "../../utils/climateClassifier.js";
import { MOCK_QUIZ, MOCK_FINAL_QUIZ } from "../../data/mockQuiz.js";
import "./GamePage.css";

function GamePage() {
  const navigate = useNavigate();
  // 제작 페이지에서 만든 행성 상태 + Physics 결과를 그대로 이어받는다.
  // Physics Engine은 PlanetCreatePage에서만 실행하고, 여기서는 재호출하지 않는다.
  const values = useClimateStore((state) => state.values);
  const physicsResult = useClimateStore((state) => state.physicsResult);
  const gameStage = useClimateStore((state) => state.gameStage);
  const setGameStage = useClimateStore((state) => state.setGameStage);
  const hearts = useClimateStore((state) => state.hearts);
  const loseHeart = useClimateStore((state) => state.loseHeart);
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

  const goReport = () => {
    setGameStage(GAME_STAGES.REPORT);
    navigate("/report");
  };

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
        </div>

        <div className="game-page__arena">
          <div className="game-page__planet-placeholder">
            <PlanetUI {...visual} />
          </div>

          {gameStage === GAME_STAGES.ANALYZE && (
            <ClimateAnalysisPanel
              title="행성 상태 분석"
              physicsResult={physicsResult}
              climateState={climateState}
              nextLabel="문제 풀러 가기"
              onNext={() => setGameStage(GAME_STAGES.QUIZ)}
            />
          )}

          {gameStage === GAME_STAGES.QUIZ && (
            <QuizModal
              quiz={MOCK_QUIZ}
              onCorrect={() => setGameStage(GAME_STAGES.ITEM)}
              onWrong={loseHeart}
            />
          )}

          {gameStage === GAME_STAGES.ITEM && (
            <ItemStage onSelect={() => setGameStage(GAME_STAGES.STABLE)} />
          )}

          {gameStage === GAME_STAGES.STABLE && (
            <ClimateAnalysisPanel
              title="행성 상태 재확인"
              physicsResult={physicsResult}
              climateState={climateState}
              nextLabel="최종 문제 풀러 가기"
              onNext={() => setGameStage(GAME_STAGES.FINAL_QUIZ)}
            />
          )}

          {gameStage === GAME_STAGES.FINAL_QUIZ && (
            <QuizModal quiz={MOCK_FINAL_QUIZ} onCorrect={goReport} onWrong={loseHeart} />
          )}
        </div>
      </div>

      <div className="game-page__side">
        <div className="game-page__side-box">간단한 행성 설명</div>
        <div className="game-page__side-box">
          하트: {"❤️".repeat(hearts)}
          {"🖤".repeat(3 - hearts)}
        </div>
      </div>
    </div>
  );
}

export default GamePage;
