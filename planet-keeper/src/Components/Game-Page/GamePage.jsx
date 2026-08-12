import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import QuizModal from "./QuizModal";
import ItemStage from "./ItemStage";
import InfoPanel from "./InfoPanel";
import PlanetUI from "../Planet-ui.jsx";
import Term from "../common/Term.jsx";
import useClimateStore, { CLIMATE_VARIABLES } from "../../store/useClimateStore";
import useGameStore, { GAME_STAGES, MAX_WRONG_COUNT, MAX_FINAL_ATTEMPTS } from "../../store/useGameStore";
import { slidersToVisual, co2Ppm } from "../../utils/climateVisual.js";
import {
  mapSlidersToClimateInputs,
  equilibriumTemperatureOf,
  ENERGY_BALANCE_EPSILON,
} from "../../utils/physicsEngine.js";
import { formatSigned, labelTone } from "../../utils/planetAnalysis.js";
import { CLIMATE_CONCEPTS } from "../../data/climateConcepts.js";
import "./GamePage.css";

// 정답/오답 피드백 메시지를 화면에 유지하는 시간(ms). 그 사이에 REPORT로
// 넘어가더라도 이 시간만큼은 메시지를 보여준 뒤 페이지를 이동한다.
const FEEDBACK_DISPLAY_MS = 2000;

// 이상기후 경고 슬라이더의 조절 폭(±). 행성 만들기 때와 같은 0~100 풀
// 레인지를 그대로 쓰면 몇 초 안에 미세하게 조정하기엔 한 번 드래그로 너무
// 크게 움직인다 - 경고가 뜬 시점 값(startValues) 기준 좁은 구간만 허용한다.
const CLIMATE_ALERT_SLIDER_RANGE = 15;

// 코드는 그대로 두고 실행만 끈다 - 다시 끌 땐 이 플래그만 false로.
const CLIMATE_TICK_ENABLED = true;

const STAGE_LABELS = {
  [GAME_STAGES.PROBLEM1]: "1단계 문제",
  [GAME_STAGES.ITEM]: "1단계 - 아이템 선택",
  [GAME_STAGES.FINAL]: "2단계 문제",
};

// 아이템 사용/2단계 확인 후 물리엔진이 판정한 상태 - 일반 안내 문구보다 눈에 띄도록
// 아이콘/색상을 구분해서 강조 표시한다. Energy Surplus/Deficit은 아이템을 잘못
// 골라 오히려 에너지 불균형이 커진 경우다.
// notice(아이템/최종 판정)와 feedback(정답/오답)이 같은 성공/실패 색상 규칙을 쓴다.
const feedbackClassName = (ok) => `game-page__feedback ${ok ? "game-page__feedback--correct" : "game-page__feedback--wrong"}`;

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
  const resetClimate = useClimateStore((state) => state.resetClimate);
  const visual = slidersToVisual(values);
  // 1초마다 도는 elapsedSeconds 틱에도 GamePage가 리렌더되므로, values/physicsResult/
  // inventory가 그대로인데 매번 다시 계산되지 않도록 메모이즈한다.
  const climateInputs = useMemo(() => mapSlidersToClimateInputs(values), [values]);

  const currentStage = useGameStore((state) => state.currentStage);
  const currentProblem = useGameStore((state) => state.currentProblem);
  const visibleItems = useGameStore((state) => state.visibleItems);
  const inventory = useGameStore((state) => state.inventory);
  const quizLog = useGameStore((state) => state.quizLog);
  const wrongCount = useGameStore((state) => state.wrongCount);
  const finalAttempts = useGameStore((state) => state.finalAttempts);
  const physicsResult = useGameStore((state) => state.physicsResult);
  const mlResult = useGameStore((state) => state.mlResult);
  const isComputing = useGameStore((state) => state.isComputing);
  const notice = useGameStore((state) => state.notice);
  const climateEvent = useGameStore((state) => state.climateEvent);
  const pendingClimateEvent = useGameStore((state) => state.pendingClimateEvent);
  const setClimateValue = useClimateStore((state) => state.setValue);
  const solveProblem = useGameStore((state) => state.solveProblem);
  const useItem = useGameStore((state) => state.useItem);
  const tickSecond = useGameStore((state) => state.tickSecond);
  const elapsedSeconds = useGameStore((state) => state.elapsedSeconds);
  const resetGame = useGameStore((state) => state.resetGame);

  const handleBackToCreator = () => {
    resetClimate();
    resetGame();
    navigate("/planet-create");
  };

  // physicsResult는 useGameStore가 특정 시점(생성/아이템/최종 확인/타이머 틱)에만
  // 채우는 스냅샷이라 CREATOR 단계나 /game 새로고침 직후에는 null일 수 있다 - 아래
  // 파생값들은 그때마다 다시 계산되고, physicsResult가 없으면 그냥 표시를 건너뛴다.
  const equilibriumTemperature = useMemo(
    () => (physicsResult ? equilibriumTemperatureOf(physicsResult) : null),
    [physicsResult],
  );

  // "🧊 빙하 해빙제" 같은 이름이 여러 번 쓰이면 나열하지 않고 x횟수로 묶어 보여준다.
  const inventoryCounts = useMemo(
    () => [...inventory.reduce((counts, name) => counts.set(name, (counts.get(name) ?? 0) + 1), new Map())],
    [inventory],
  );

  const [feedback, setFeedback] = useState(null); // "correct" | "wrong" | null

  // 시간이 지날수록 기후가 악화되는 압박 장치 - CREATOR/REPORT를 제외한 모든
  // 단계에서 계속 돈다. CREATOR는 보통 곧 PROBLEM1/FINAL로 넘어가지만, /game을
  // 새로고침해서 store가 초기화된 채 멈춰 있는 경우(진행할 physicsResult가 없음)도
  // CREATOR라 여기서도 제외한다. 1초마다 store의 elapsedSeconds를 늘리기만 하고,
  // 실제로 이상기후를 적용할지(3초 배수마다)는 useGameStore.tickSecond가 판단한다 -
  // REPORT에 도달하면 여기서 멈추므로 그 값이 "총 걸린 시간"으로 그대로 남는다.
  useEffect(() => {
    if (!CLIMATE_TICK_ENABLED) return undefined;
    if (currentStage === GAME_STAGES.REPORT || currentStage === GAME_STAGES.CREATOR) return undefined;
    const timer = setInterval(tickSecond, 1000);
    return () => clearInterval(timer);
  }, [currentStage, tickSecond]);

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
      {/* 스크롤 시 화면 우측 상단에 고정 표시될 플로팅 타이머 & 알림 창 + 이상기후 경고 패널 */}
      {CLIMATE_TICK_ENABLED && (
        <div className="game-page__floating-stack">
          <div className="game-page__floating-timer">
            <span className="game-page__floating-timer-label">⏱️ 경과 시간</span>
            <p className="game-page__stats-note">{elapsedSeconds}초</p>
            <span className={`info-panel__badge info-panel__badge--${labelTone(mlResult?.label)}`}>
              {mlResult ? mlResult.label : "대기 중..."}
            </span>
            {/* pending 중엔 아래 경고 패널에 이미 같은 문구가 있으니 중복 표시하지 않는다. */}
            {climateEvent && !pendingClimateEvent && (
              <div className="game-page__event-toast">
                {climateEvent}
              </div>
            )}
          </div>

          {/* 이상기후 경고 - 응답 시간 안에 슬라이더 중 하나(또는 여러 개)를 막는
              방향으로 움직이면 물리엔진 재계산으로 판정한다. 손대지 않으면
              useGameStore.resolveClimateEvent가 만료 시점에 경고에 걸린 방향
              그대로 적용한다(기존 자동 악화와 동일한 fallback). 아이템 대신
              행성 만들기 때와 같은 5개 슬라이더를 전부 보여줘서, 꼭 경고가 지목한
              변수가 아니라도 원하는 방향으로 대응할 수 있게 한다. */}
          {pendingClimateEvent && (
            <div className="game-page__climate-alert">
              <p className="game-page__climate-alert-message">{pendingClimateEvent.warning}</p>
              <p className="game-page__climate-alert-timer">
                ⏳ {Math.max(0, pendingClimateEvent.expiresAt - elapsedSeconds)}초 안에 막아보세요
              </p>
              {CLIMATE_VARIABLES.map(({ key, label }) => {
                const startValue = pendingClimateEvent.startValues[key];
                const min = Math.max(0, startValue - CLIMATE_ALERT_SLIDER_RANGE);
                const max = Math.min(100, startValue + CLIMATE_ALERT_SLIDER_RANGE);
                return (
                  <div key={key} className="game-page__climate-alert-slider-row">
                    <span className="game-page__climate-alert-slider-label">{label}</span>
                    <input
                      type="range"
                      min={min}
                      max={max}
                      value={values[key]}
                      onChange={(e) => setClimateValue(key, Number(e.target.value))}
                      className="game-page__climate-alert-slider"
                    />
                    <span className="game-page__climate-alert-slider-value">{values[key]}%</span>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      <div className="game-page__main">
        <div className="game-page__stats-bar">
          {physicsResult && (
            <>
              {/* 가장 먼저 봐야 할 정보 3개만 카드로 - 나머지는 아래 "상세 물리 정보"에 접어둔다. */}
              <div className="game-page__key-cards">
                <div className="game-page__key-card">
                  <span className="game-page__key-card-label">
                    🟢 <Term concept={CLIMATE_CONCEPTS.currentTemperature}>현재 평균 온도</Term>
                  </span>
                  <span className="game-page__key-card-value">{physicsResult.currentTemperature.toFixed(1)} K</span>
                </div>
                <div className="game-page__key-card">
                  <span className="game-page__key-card-label">
                    🎯 <Term concept={CLIMATE_CONCEPTS.equilibriumTemperature}>예상 안정 온도</Term>
                  </span>
                  <span className="game-page__key-card-value">{equilibriumTemperature.toFixed(1)} K</span>
                </div>
                <div className="game-page__key-card">
                  <span className="game-page__key-card-label">
                    ⚡ <Term concept={CLIMATE_CONCEPTS.deltaEnergy}>에너지 불균형(ΔE)</Term>
                  </span>
                  {/* 숫자만 보면 이게 평형에 가까운지 알 수 없어서 판정 기준선을 같이 보여준다.
                      허용범위 안이면 값 자체를 초록으로 바꿔 한눈에 구분되게 한다. */}
                  <span
                    className={`game-page__key-card-value${
                      Math.abs(physicsResult.deltaEnergy) <= ENERGY_BALANCE_EPSILON
                        ? " game-page__key-card-value--balanced"
                        : ""
                    }`}
                  >
                    {formatSigned(physicsResult.deltaEnergy)} W/m²
                  </span>
                  <span className="game-page__key-card-note">
                    평형 기준 ±{ENERGY_BALANCE_EPSILON.toFixed(1)} W/m²
                  </span>
                </div>
              </div>

                <div className="game-page__stats-row">
                {CLIMATE_VARIABLES.map(({ key, label }) => (
                  <span key={key}>
                    {label}: {key === "co2" ? `${co2Ppm(values.co2)} ppm` : `${values[key]}%`}
                  </span>
                ))}
                </div>

                <div className="game-page__stats-row game-page__stats-row--physics">
                  <span>흡수 에너지(ASR): {physicsResult.absorbedRadiation.toFixed(2)}</span>
                  <span>방출 에너지(OLR): {physicsResult.outgoingRadiation.toFixed(2)}</span>
                  <span>
                    <Term concept={CLIMATE_CONCEPTS.albedo}>알베도</Term>: {physicsResult.albedo.toFixed(2)}
                  </span>
                  <span>
                    <Term concept={CLIMATE_CONCEPTS.greenhouseEffect}>온실효과</Term>:{" "}
                    {physicsResult.greenhouseStrength.toFixed(2)}
                  </span>
              </div>
            </>
          )}
        </div>

        <div className="game-page__arena">
          <div className="game-page__planet-placeholder">
            <PlanetUI {...visual} />
          </div>

          {STAGE_LABELS[currentStage] && <h2 className="game-page__stage-label">{STAGE_LABELS[currentStage]}</h2>}

          {currentStage === GAME_STAGES.CREATOR && !isComputing && (
            <div className="game-page__recovery">
              <p>진행 중인 행성 데이터가 없습니다. 새로고침 등으로 게임 상태가 초기화된 것 같습니다.</p>
              <button className="btn-primary" onClick={handleBackToCreator}>
                행성 만들기로 돌아가기
              </button>
            </div>
          )}

          {currentStage === GAME_STAGES.ITEM && !isComputing && (
            <ItemStage items={visibleItems} onSelect={useItem} disabled={!!pendingClimateEvent} />
          )}

          {isComputing && <p>행성 상태를 계산하는 중...</p>}

          {notice && STABLE_BADGES[mlResult?.label] && (
            <div className={`game-page__stable-badge ${STABLE_BADGES[mlResult.label].className}`}>
              <span className="game-page__stable-badge-icon">{STABLE_BADGES[mlResult.label].icon}</span>
              <span>{STABLE_BADGES[mlResult.label].text}</span>
            </div>
          )}

          {notice && (
            <div className={feedbackClassName(notice.ok)}>
              {notice.lines.map((line, i) => (
                <p key={i}>{line}</p>
              ))}
            </div>
          )}

          {/* 정답 / 오답 피드백 영역 */}
          {feedback && (
            <div className={feedbackClassName(feedback === "correct")}>
              <p>{feedback === "correct" ? "✅ 정답입니다!" : "❌ 오답입니다. 다시 시도하세요."}</p>
            </div>
          )}

          {(currentStage === GAME_STAGES.PROBLEM1 || currentStage === GAME_STAGES.FINAL) &&
            currentProblem && (
              <QuizModal
                problem={currentProblem}
                onSubmit={handleAnswer}
                number={quizLog.length + 1}
                disabled={!!pendingClimateEvent}
              />
            )}
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
          <div className="game-page__used-items-container">
            <p className="game-page__used-items-label">사용 아이템:</p>
            {inventoryCounts.length > 0 ? (
              <ul className="game-page__used-items-list">
                {inventoryCounts.map(([name, count]) => (
                  <li key={name} className="game-page__used-item-row" title={`${name} x${count}`}>
                    {name} x{count}
                  </li>
                ))}
              </ul>
            ) : (
              <p className="game-page__used-items-empty">없음</p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

export default GamePage;