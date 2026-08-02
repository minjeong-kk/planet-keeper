import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import QuizModal from "./QuizModal";
import ItemStage from "./ItemStage";
import InfoPanel from "./InfoPanel";
import PlanetUI from "../Planet-ui.jsx";
import useClimateStore, { CLIMATE_VARIABLES } from "../../store/useClimateStore";
import useGameStore, { GAME_STAGES, MAX_WRONG_COUNT, MAX_FINAL_ATTEMPTS } from "../../store/useGameStore";
import { slidersToVisual, co2Ppm } from "../../utils/climateVisual.js";
import { mapSlidersToClimateInputs } from "../../utils/physicsEngine.js";
import "./GamePage.css";

// 정답/오답 피드백 메시지를 화면에 유지하는 시간(ms). 그 사이에 REPORT로
// 넘어가더라도 이 시간만큼은 메시지를 보여준 뒤 페이지를 이동한다.
const FEEDBACK_DISPLAY_MS = 2000;

const STAGE_LABELS = {
  [GAME_STAGES.PROBLEM1]: "1단계 문제",
  [GAME_STAGES.ITEM]: "1단계 - 아이템 선택",
  [GAME_STAGES.FINAL]: "2단계 문제",
};

// 아이템 사용/2단계 확인 후 AI가 판정한 상태 - 일반 안내 문구보다 눈에 띄도록
// 아이콘/색상을 구분해서 강조 표시한다. Energy Surplus/Deficit은 아이템을 잘못
// 골라 오히려 에너지 불균형이 커진 경우다.
const STABLE_BADGES = {
  "Earth-like Stable": { icon: "🌍", text: "Earth-like Stable", className: "game-page__stable-badge--earth" },
  "Warm Stable": { icon: "🔥", text: "Warm Stable", className: "game-page__stable-badge--warm" },
  "Cold Stable": { icon: "❄️", text: "Cold Stable", className: "game-page__stable-badge--cold" },
  "Energy Surplus": { icon: "🔥", text: "Energy Surplus", className: "game-page__stable-badge--warm" },
  "Energy Deficit": { icon: "❄️", text: "Energy Deficit", className: "game-page__stable-badge--cold" },
};

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
  const finalAttempts = useGameStore((state) => state.finalAttempts);
  const physicsResult = useGameStore((state) => state.physicsResult);
  const mlResult = useGameStore((state) => state.mlResult);
  const isComputing = useGameStore((state) => state.isComputing);
  const notice = useGameStore((state) => state.notice);
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

          {STAGE_LABELS[currentStage] && <h2 className="game-page__stage-label">{STAGE_LABELS[currentStage]}</h2>}

          {currentStage === GAME_STAGES.ITEM && !isComputing && <ItemStage onSelect={useItem} />}

          {isComputing && <p>AI가 행성 상태를 판정하는 중...</p>}

          {notice && STABLE_BADGES[mlResult?.label] && (
            <div className={`game-page__stable-badge ${STABLE_BADGES[mlResult.label].className}`}>
              <span className="game-page__stable-badge-icon">{STABLE_BADGES[mlResult.label].icon}</span>
              <span>{STABLE_BADGES[mlResult.label].text}</span>
            </div>
          )}

          {notice && (
            <div
              className={`game-page__feedback ${
                notice.ok ? "game-page__feedback--correct" : "game-page__feedback--wrong"
              }`}
            >
              {notice.lines.map((line, i) => (
                <p key={i}>{line}</p>
              ))}
            </div>
          )}

          {feedback === "correct" && <p className="game-page__feedback game-page__feedback--correct">✅ 정답입니다!</p>}
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
            목숨: {"❤️".repeat(Math.max(0, MAX_WRONG_COUNT - wrongCount))}
            {"🖤".repeat(Math.min(MAX_WRONG_COUNT, wrongCount))}
          </p>
          {currentStage === GAME_STAGES.FINAL && (
            <p className="game-page__final-progress">
              안정화 진행:{" "}
              {Array.from({ length: MAX_FINAL_ATTEMPTS }, (_, i) => (
                <span
                  key={i}
                  className={i < finalAttempts ? "game-page__final-check game-page__final-check--filled" : "game-page__final-check"}
                >
                  ✔
                </span>
              ))}
            </p>
          )}
          <p> 사용 아이템: {inventory.length ? inventory.join(", ") : "없음"}</p>
        </div>
      </div>
    </div>
  );
}

export default GamePage;
