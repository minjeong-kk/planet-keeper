import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import QuizModal from "./QuizModal";
import ItemStage from "./ItemStage";
import InfoPanel from "./InfoPanel";
import PlanetUI from "../Planet-ui.jsx";
import useClimateStore, { CLIMATE_VARIABLES } from "../../store/useClimateStore";
import useGameStore, { GAME_STAGES } from "../../store/useGameStore";
import { slidersToVisual, co2Ppm } from "../../utils/climateVisual.js";
import { mapSlidersToClimateInputs } from "../../utils/physicsEngine.js";
import "./GamePage.css";

// 정답/오답 피드백 메시지를 화면에 유지하는 시간(ms). 그 사이에 REPORT로
// 넘어가더라도 이 시간만큼은 메시지를 보여준 뒤 페이지를 이동한다.
const FEEDBACK_DISPLAY_MS = 2000;

function GamePage() {
  const navigate = useNavigate();
  // 행성 슬라이더 값(제작 페이지에서 만든 값)은 그대로 이어받아 보여주기만 한다.
  const values = useClimateStore((state) => state.values);
  const visual = slidersToVisual(values);
  const climateInputs = mapSlidersToClimateInputs(values);

  const currentStage = useGameStore((state) => state.currentStage);
  const currentProblem = useGameStore((state) => state.currentProblem);
  const inventory = useGameStore((state) => state.inventory);
  const wrongCount = useGameStore((state) => state.wrongCount);
  const physicsResult = useGameStore((state) => state.physicsResult);
  const mlResult = useGameStore((state) => state.mlResult);
  const isComputing = useGameStore((state) => state.isComputing);
  const solveProblem = useGameStore((state) => state.solveProblem);
  const useItem = useGameStore((state) => state.useItem);

  const [feedback, setFeedback] = useState(null); // "correct" | "wrong" | null

  const handleAnswer = (answer) => {
    const correct = solveProblem(answer);
    setFeedback(correct ? "correct" : "wrong");
  };

  // 피드백 메시지는 일정 시간 뒤 자동으로 사라진다.
  useEffect(() => {
    if (!feedback) return undefined;
    const timer = setTimeout(() => setFeedback(null), FEEDBACK_DISPLAY_MS);
    return () => clearTimeout(timer);
  }, [feedback]);

  // 오답 3회 누적 또는 최종 문제 정답으로 REPORT 단계가 되면 리포트 페이지로 이동한다.
  // 마지막 피드백 메시지를 잠깐 보여줄 시간을 준 뒤 이동한다.
  useEffect(() => {
    if (currentStage !== GAME_STAGES.REPORT) return undefined;
    const timer = setTimeout(() => navigate("/report"), FEEDBACK_DISPLAY_MS);
    return () => clearTimeout(timer);
  }, [currentStage, navigate]);

  return (
    <div className="game-page">
      <div className="game-page__main">
        <div className="game-page__stats-bar">
          {CLIMATE_VARIABLES.map(({ key, label }) => (
            <span key={key}>
              {label}: {key === "co2" ? `${co2Ppm(values.co2)} ppm` : `${values[key]}%`}
            </span>
          ))}
        </div>

        <div className="game-page__arena">
          <div className="game-page__planet-placeholder">
            <PlanetUI {...visual} />
          </div>

          {currentStage === GAME_STAGES.ITEM && !isComputing && <ItemStage onSelect={useItem} />}

          {isComputing && <p>행성 상태 재계산 중...</p>}

          {feedback === "correct" && (
            <p className="game-page__feedback game-page__feedback--correct">
              ✅ 정답입니다! 아이템을 획득했습니다.
            </p>
          )}
          {feedback === "wrong" && (
            <p className="game-page__feedback game-page__feedback--wrong">❌ 오답입니다. 다시 시도하세요.</p>
          )}

          {(currentStage === GAME_STAGES.PROBLEM1 || currentStage === GAME_STAGES.FINAL) &&
            currentProblem && <QuizModal problem={currentProblem} onSubmit={handleAnswer} />}
        </div>
      </div>

      <div className="game-page__side">
        <InfoPanel
          physicsResult={physicsResult}
          mlResult={mlResult}
          co2Ppm={climateInputs.co2Ppm}
          atmThickness={climateInputs.atmThickness}
        />
        <div className="game-page__side-box">
          <p>
            목숨: {"❤️".repeat(Math.max(0, 3 - wrongCount))}
            {"🖤".repeat(Math.min(3, wrongCount))}
          </p>
          <p>보유 아이템: {inventory.length ? inventory.join(", ") : "없음"}</p>
        </div>
      </div>
    </div>
  );
}

export default GamePage;
