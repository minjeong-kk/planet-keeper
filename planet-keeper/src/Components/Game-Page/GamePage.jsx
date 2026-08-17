import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import QuizModal, { QuizResult } from "./QuizModal";
import ItemStage from "./ItemStage";
import InfoPanel from "./InfoPanel";
import PlanetDiagnosis from "./PlanetDiagnosis";
import PlanetUI from "../Planet-ui.jsx";
import useClimateStore, { CLIMATE_VARIABLES } from "../../store/useClimateStore";
import useGameStore, {
  GAME_STAGES,
  MAX_WRONG_COUNT,
  MAX_FINAL_ATTEMPTS,
  CLIMATE_EVENT_RESPONSE_SECONDS,
} from "../../store/useGameStore";
import { slidersToVisual } from "../../utils/climateVisual.js";
import {
  mapSlidersToClimateInputs,
  equilibriumTemperatureOf,
  ENERGY_BALANCE_EPSILON,
  COLD_STABLE_MAX_K,
  EARTH_LIKE_MAX_K,
} from "../../utils/physicsEngine.js";
import { formatSigned } from "../../utils/planetAnalysis.js";
import "./GamePage.css";

// 행성 위에 잠깐 뜨는 정답/오답 플래시가 유지되는 시간(ms).
const FEEDBACK_FLASH_MS = 1600;
// 문제를 푼 직후 임무 패널 자리에 뜨는 해설 카드가 유지되는 시간(ms).
// REPORT로 넘어갈 때도 이 시간만큼은 마지막 해설을 보여준 뒤 페이지를 이동한다.
const RESULT_DISPLAY_MS = 3600;

// 이상기후 경고 슬라이더의 조절 폭(±). 행성 만들기 때와 같은 0~100 풀
// 레인지를 그대로 쓰면 몇 초 안에 미세하게 조정하기엔 한 번 드래그로 너무
// 크게 움직인다 - 경고가 뜬 시점 값(startValues) 기준 좁은 구간만 허용한다.
const CLIMATE_ALERT_SLIDER_RANGE = 15;

// 코드는 그대로 두고 실행만 끈다 - 다시 끌 땐 이 플래그만 false로.
const CLIMATE_TICK_ENABLED = true;

// 하단 "최근 활동" 로그에 남겨두는 최대 항목 수.
const ACTIVITY_LOG_LIMIT = 8;

// 온도 게이지가 그리는 전체 구간(K). 안정 구간(COLD_STABLE_MAX_K ~ EARTH_LIKE_MAX_K)이
// 게이지 한가운데 오도록 위아래로 비슷한 여유를 둔 표시 전용 값이다 - 판정 기준은
// 그대로 물리엔진(planetStateOf)이 갖고 있고 여기서는 위치만 계산한다.
const GAUGE_MIN_K = 250;
const GAUGE_MAX_K = 330;
const gaugePercent = (temperatureK) =>
  Math.min(100, Math.max(0, ((temperatureK - GAUGE_MIN_K) / (GAUGE_MAX_K - GAUGE_MIN_K)) * 100));

const SAFE_BAND_START = gaugePercent(COLD_STABLE_MAX_K);
const SAFE_BAND_END = gaugePercent(EARTH_LIKE_MAX_K);

// 단계별 헤더 문구 - "1단계 문제" 같은 학습 플랫폼 표현 대신 임무 브리핑처럼 보이게 한다.
const STAGE_META = {
  [GAME_STAGES.CREATOR]: { tag: "STANDBY", objective: "행성 데이터를 불러오는 중" },
  [GAME_STAGES.PROBLEM1]: { tag: "MISSION 01", objective: "에너지 불균형의 원인을 찾아라" },
  [GAME_STAGES.ITEM]: { tag: "MISSION 01", objective: "장비를 투입해 에너지 균형을 되찾아라" },
  [GAME_STAGES.FINAL]: { tag: "MISSION 02", objective: "행성을 지구형 안정 상태로 확정하라" },
  [GAME_STAGES.REPORT]: { tag: "MISSION END", objective: "결과 보고서로 이동합니다" },
};

// 아이템 사용/2단계 확인 후 물리엔진이 판정한 상태 - 행성 옆 배지로 강조 표시한다.
// Energy Surplus/Deficit은 아이템을 잘못 골라 오히려 에너지 불균형이 커진 경우다.
const STABLE_BADGES = {
  "Earth-like Stable": { icon: "🌍", text: "지구형 안정", tone: "earth" },
  "Warm Stable": { icon: "🔥", text: "고온 안정", tone: "warm" },
  "Cold Stable": { icon: "❄️", text: "저온 안정", tone: "cold" },
  "Energy Surplus": { icon: "🔥", text: "에너지 과다", tone: "warm" },
  "Energy Deficit": { icon: "❄️", text: "에너지 부족", tone: "cold" },
};

// 사용한 장비를 보여주는 하단 슬롯의 최소 칸 수 - 아직 안 쓴 칸은 빈 슬롯(+)으로 남는다.
const ACTION_SLOT_COUNT = 5;

// 온도/게이지가 툭 튀지 않고 부드럽게 따라가도록 하는 표시 전용 보간.
// 실제 물리 값(physicsResult.currentTemperature)은 전혀 건드리지 않는다.
function useAnimatedNumber(target, duration = 700) {
  const [value, setValue] = useState(target ?? 0);
  const currentRef = useRef(target ?? 0);

  useEffect(() => {
    if (target == null) return undefined;
    const from = currentRef.current;
    const diff = target - from;
    if (Math.abs(diff) < 0.01) {
      currentRef.current = target;
      setValue(target);
      return undefined;
    }

    let frame = 0;
    let startTime = null;
    const step = (now) => {
      if (startTime === null) startTime = now;
      const progress = Math.min(1, (now - startTime) / duration);
      const eased = 1 - Math.pow(1 - progress, 3);
      const next = from + diff * eased;
      currentRef.current = next;
      setValue(next);
      if (progress < 1) frame = requestAnimationFrame(step);
    };
    frame = requestAnimationFrame(step);
    return () => cancelAnimationFrame(frame);
  }, [target, duration]);

  return value;
}

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
  // store 액션 useItem은 훅이 아니지만 이름이 use로 시작해서, 콜백 안에서 부르면
  // 린트의 rules-of-hooks가 훅 호출로 오해한다 - 로컬 이름만 바꿔서 받는다.
  const applyItem = useGameStore((state) => state.useItem);
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
  // 문제를 푼 직후 임무 패널 자리에 띄우는 해설 카드. solveProblem이 곧바로 다음
  // 단계로 넘어가므로(문제/아이템 교체) 해설·보상 문구는 푸는 시점에 복사해 둔다.
  const [result, setResult] = useState(null);
  const [logOpen, setLogOpen] = useState(false);
  const [activityLog, setActivityLog] = useState([]);

  const isLocked = !!pendingClimateEvent;
  const isItemStage = currentStage === GAME_STAGES.ITEM;
  const isQuizStage = currentStage === GAME_STAGES.PROBLEM1 || currentStage === GAME_STAGES.FINAL;
  const stageMeta = STAGE_META[currentStage] ?? STAGE_META[GAME_STAGES.CREATOR];

  // 시간이 지날수록 기후가 악화되는 압박 장치 - CREATOR/REPORT를 제외한 모든
  // 단계에서 계속 돈다. CREATOR는 보통 곧 PROBLEM1/FINAL로 넘어가지만, /game을
  // 새로고침해서 store가 초기화된 채 멈춰 있는 경우(진행할 physicsResult가 없음)도
  // CREATOR라 여기서도 제외한다. 1초마다 store의 elapsedSeconds를 늘리기만 하고,
  // 실제로 이상기후를 적용할지는 useGameStore.tickSecond가 판단한다 - REPORT에
  // 도달하면 여기서 멈추므로 그 값이 "총 걸린 시간"으로 그대로 남는다.
  useEffect(() => {
    if (!CLIMATE_TICK_ENABLED) return undefined;
    if (currentStage === GAME_STAGES.REPORT || currentStage === GAME_STAGES.CREATOR) return undefined;
    const timer = setInterval(tickSecond, 1000);
    return () => clearInterval(timer);
  }, [currentStage, tickSecond]);

  // 선택지를 누르면 곧바로 판정한다(별도 제출 버튼 없음).
  const handleAnswer = (answer) => {
    if (!currentProblem) return;
    const answered = currentProblem;
    const rewardText = currentStage === GAME_STAGES.FINAL ? "행성 안정화 확인 ×1" : "장비 투입 기회 ×1";
    const correct = solveProblem(answer);
    setFeedback(correct ? "correct" : "wrong");
    setResult({
      correct,
      explanation: answered.explanation,
      concepts: answered.concepts,
      reward: correct ? rewardText : null,
    });
  };

  // 아이템도 카드를 누르면 곧바로 투입된다.
  const handleUseItem = (item) => {
    setResult(null);
    applyItem(item);
  };

  // 피드백 플래시 / 해설 카드는 각자 정해진 시간 뒤 자동으로 사라진다.
  useEffect(() => {
    if (!feedback) return undefined;
    const timer = setTimeout(() => setFeedback(null), FEEDBACK_FLASH_MS);
    return () => clearTimeout(timer);
  }, [feedback]);

  useEffect(() => {
    if (!result) return undefined;
    const timer = setTimeout(() => setResult(null), RESULT_DISPLAY_MS);
    return () => clearTimeout(timer);
  }, [result]);

  // 아이템 사용/최종 확인 판정(notice)과 이상기후 결과(climateEvent)는 하단
  // "최근 활동" 로그에 시간 순으로 쌓아 둔다 - 화면 어딘가에 항상 펼쳐져 있지
  // 않고, 필요할 때만 펼쳐 보는 기록이다.
  useEffect(() => {
    if (!notice) return;
    const lines = notice.lines.filter((line) => line !== "↓");
    setActivityLog((prev) =>
      [{ tone: notice.ok ? "ok" : "warn", summary: lines[lines.length - 1] ?? "", lines }, ...prev].slice(
        0,
        ACTIVITY_LOG_LIMIT,
      ),
    );
  }, [notice]);

  useEffect(() => {
    if (!climateEvent) return;
    setActivityLog((prev) => [{ tone: "event", summary: climateEvent, lines: [climateEvent] }, ...prev].slice(0, ACTIVITY_LOG_LIMIT));
  }, [climateEvent]);

  // 오답 3회 누적 또는 최종 문제 정답으로 REPORT 단계가 되면 리포트 페이지로 이동한다.
  // 마지막 해설 카드를 읽을 시간을 준 뒤 이동한다.
  useEffect(() => {
    if (currentStage !== GAME_STAGES.REPORT) return undefined;
    const timer = setTimeout(() => navigate("/report"), RESULT_DISPLAY_MS);
    return () => clearTimeout(timer);
  }, [currentStage, navigate]);

  const displayTemperature = useAnimatedNumber(physicsResult?.currentTemperature ?? null);
  const markerPercent = gaugePercent(displayTemperature);
  const badge = STABLE_BADGES[mlResult?.label];
  const isBalanced = physicsResult ? Math.abs(physicsResult.deltaEnergy) <= ENERGY_BALANCE_EPSILON : false;
  const remainingSeconds = pendingClimateEvent
    ? Math.max(0, pendingClimateEvent.expiresAt - elapsedSeconds)
    : 0;

  // 지금 무엇을 해야 하는지 한 줄 안내 - 하단 바 오른쪽에 둔다.
  const actionHint = isComputing
    ? "행성 상태를 다시 계산하는 중..."
    : isLocked
      ? "이상기후에 대응하세요"
      : isItemStage
        ? "왼쪽 격납고에서 장비를 눌러 투입하세요"
        : isQuizStage
          ? "선택지를 누르면 바로 응답됩니다"
          : currentStage === GAME_STAGES.REPORT
            ? "임무 종료 - 결과 보고서로 이동합니다"
            : "";

  return (
    <div className="hud">
      <div className="hud__starfield" aria-hidden="true" />
      {isLocked && <div className="hud__alert-vignette" aria-hidden="true" />}

      {/* ── 상단: 임무 브리핑 / 진행도 / 생존 지표 ── */}
      <header className="hud__topbar">
        <div className="hud__brief">
          <span className="hud__stage-tag">{stageMeta.tag}</span>
          <p className="hud__objective">{stageMeta.objective}</p>
        </div>

        <div className="hud__progress">
          <div className="hud__progress-head">
            <span className="hud__progress-label">행성 안정화</span>
            <span className="hud__progress-count">
              {finalAttempts} / {MAX_FINAL_ATTEMPTS}
            </span>
          </div>
          <div className="hud__progress-track">
            <div
              className="hud__progress-fill"
              style={{ width: `${(finalAttempts / MAX_FINAL_ATTEMPTS) * 100}%` }}
            />
          </div>
        </div>

        <div className="hud__vitals">
          <div className="hud__vital">
            <span className="hud__vital-label">SHIELD</span>
            <span className="hud__pips">
              {Array.from({ length: MAX_WRONG_COUNT }, (_, i) => (
                <span
                  key={i}
                  className={`hud__pip${i < MAX_WRONG_COUNT - wrongCount ? " hud__pip--on" : ""}`}
                />
              ))}
            </span>
          </div>
          {CLIMATE_TICK_ENABLED && (
            <div className="hud__vital">
              <span className="hud__vital-label">TURN</span>
              <span className="hud__vital-value">T+{elapsedSeconds}</span>
            </div>
          )}
        </div>
      </header>

      {/* ── 본체: 좌(상태·격납고) / 중앙(행성) / 우(임무·진단) ── */}
      <main className="hud__body">
        <aside className="hud__column hud__column--left">
          <InfoPanel physicsResult={physicsResult} co2Ppm={climateInputs.co2Ppm} />
          <ItemStage
            items={isItemStage ? visibleItems : []}
            onSelect={handleUseItem}
            disabled={isLocked}
            locked={!isItemStage}
          />
        </aside>

        <section className="hud__stage">
          <div className="hud__planet-frame">
            <div className="hud__planet-glow" aria-hidden="true" />
            <div className="hud__planet">
              <PlanetUI {...visual} />
            </div>
            {badge && (
              <span className={`hud__planet-badge hud__planet-badge--${badge.tone}`}>
                <span aria-hidden="true">{badge.icon}</span>
                {badge.text}
              </span>
            )}
            {feedback && (
              <div className={`hud__flash hud__flash--${feedback}`}>
                {feedback === "correct" ? "✅ 정답" : "❌ 오답"}
              </div>
            )}
          </div>

          <div className="hud__readout">
            <span className="hud__readout-label">현재 온도</span>
            <p className="hud__readout-value">
              {physicsResult ? displayTemperature.toFixed(1) : "--.-"}
              <span className="hud__readout-unit">K</span>
            </p>
          </div>

          <div className="hud__gauge">
            <div className="hud__gauge-track">
              <div
                className="hud__gauge-safe"
                style={{ left: `${SAFE_BAND_START}%`, width: `${SAFE_BAND_END - SAFE_BAND_START}%` }}
              />
              {physicsResult && (
                <div className="hud__gauge-marker" style={{ left: `${markerPercent}%` }}>
                  <span className="hud__gauge-marker-value">{displayTemperature.toFixed(1)} K</span>
                </div>
              )}
            </div>
            <div className="hud__gauge-scale">
              <span>너무 추움</span>
              <span className="hud__gauge-scale--safe">안정</span>
              <span>너무 뜨거움</span>
            </div>
          </div>

          {/* 평형 온도/ΔE는 보조 정보 - 현재 온도보다 작게, 아래쪽에 둔다. */}
          <div className="hud__substats">
            <div className="hud__substat">
              <span className="hud__substat-label">평형 온도</span>
              <span className="hud__substat-value">
                {equilibriumTemperature != null ? `${equilibriumTemperature.toFixed(1)} K` : "--"}
              </span>
            </div>
            <div className="hud__substat">
              <span className="hud__substat-label">에너지 불균형</span>
              <span className={`hud__substat-value${isBalanced ? " hud__substat-value--ok" : ""}`}>
                {physicsResult ? `${formatSigned(physicsResult.deltaEnergy)} W/m²` : "--"}
              </span>
            </div>
            <div className="hud__substat">
              <span className="hud__substat-label">평형 기준</span>
              <span className="hud__substat-value">±{ENERGY_BALANCE_EPSILON.toFixed(1)} W/m²</span>
            </div>
          </div>
        </section>

        <aside className="hud__column hud__column--right">
          {/* 임무 패널 - 문제를 푼 직후에는 같은 자리가 해설 카드로 바뀐다. */}
          {result ? (
            <QuizResult result={result} onClose={() => setResult(null)} />
          ) : (
            <>
              {isQuizStage && currentProblem && (
                <QuizModal
                  problem={currentProblem}
                  number={quizLog.length + 1}
                  onAnswer={handleAnswer}
                  disabled={isLocked}
                  reward={currentStage === GAME_STAGES.FINAL ? "행성 안정화 확인 ×1" : "장비 투입 기회 ×1"}
                />
              )}

              {isItemStage && !isComputing && (
                <div className="mission mission--notice">
                  <span className="mission__eyebrow">장비 투입</span>
                  <p className="mission__notice-text">
                    아래 <strong>행성 진단</strong>의 원인과 해결 방향을 보고, 왼쪽 격납고에서 장비를 눌러
                    투입하세요.
                  </p>
                </div>
              )}

              {currentStage === GAME_STAGES.CREATOR && !isComputing && (
                <div className="mission mission--notice">
                  <span className="mission__eyebrow">시스템</span>
                  <p className="mission__notice-text">
                    진행 중인 행성 데이터가 없습니다. 새로고침 등으로 게임 상태가 초기화된 것 같습니다.
                  </p>
                  <button type="button" className="hud-btn" onClick={handleBackToCreator}>
                    행성 만들기로
                  </button>
                </div>
              )}

              {isComputing && (
                <div className="mission mission--notice">
                  <span className="mission__eyebrow">시스템</span>
                  <p className="mission__notice-text">행성 상태를 계산하는 중...</p>
                </div>
              )}
            </>
          )}

          {/* 행성 진단 - 판정 / 현재 상태 / 원인 / 해결 방향을 한 줄씩 요약해서 늘 보여준다. */}
          <PlanetDiagnosis
            physicsResult={physicsResult}
            mlResult={mlResult}
            co2Ppm={climateInputs.co2Ppm}
            atmThickness={climateInputs.atmThickness}
          />
        </aside>
      </main>

      {/* ── 하단: 최근 활동 / 사용한 장비 / 현재 안내 ── */}
      <footer className="hud__actionbar">
        <div className="actionbar__block actionbar__block--log">
          <button
            type="button"
            className="actionbar__log-toggle"
            onClick={() => setLogOpen((open) => !open)}
            aria-expanded={logOpen}
          >
            <span className="actionbar__label">최근 활동</span>
            <span className="actionbar__log-chevron">{logOpen ? "▾" : "▸"}</span>
          </button>
          {logOpen ? (
            <div className="actionbar__log actionbar__log--open">
              {activityLog.length > 0 ? (
                activityLog.map((entry, i) => (
                  <div key={i} className={`actionbar__log-entry is-${entry.tone}`}>
                    {entry.lines.map((line, j) => (
                      <p key={j}>{line}</p>
                    ))}
                  </div>
                ))
              ) : (
                <p className="actionbar__log-empty">기록 없음</p>
              )}
            </div>
          ) : (
            <p className={`actionbar__log-summary${activityLog[0] ? ` is-${activityLog[0].tone}` : ""}`}>
              {activityLog[0]?.summary ?? "기록 없음"}
            </p>
          )}
        </div>

        <div className="actionbar__block">
          <span className="actionbar__label">사용한 장비</span>
          <div className="actionbar__slots">
            {inventoryCounts.map(([name, count]) => (
              <span key={name} className="actionbar__slot actionbar__slot--filled" title={`${name} ×${count}`}>
                {/* inventory 항목은 `${emoji} ${name}` 형태로 쌓인다 - 슬롯에는 앞의 이모지만 보여준다. */}
                <span className="actionbar__slot-icon">{name.split(" ")[0]}</span>
                {count > 1 && <span className="actionbar__slot-count">×{count}</span>}
              </span>
            ))}
            {Array.from({ length: Math.max(0, ACTION_SLOT_COUNT - inventoryCounts.length) }, (_, i) => (
              <span key={`empty-${i}`} className="actionbar__slot">
                +
              </span>
            ))}
          </div>
        </div>

        <div className="actionbar__block actionbar__block--hint">
          <span className="actionbar__label">현재 행동</span>
          <p className="actionbar__hint">{actionHint}</p>
        </div>
      </footer>

      {/* 이상기후 경보 - 화면 한가운데 긴급 이벤트로 등장한다. 응답 시간 안에
          슬라이더 중 하나(또는 여러 개)를 막는 방향으로 움직이면 물리엔진
          재계산으로 판정한다. 손대지 않으면 useGameStore.resolveClimateEvent가
          만료 시점에 경고에 걸린 방향 그대로 적용한다(기존 자동 악화와 동일한
          fallback). 아이템 대신 행성 만들기 때와 같은 5개 슬라이더를 전부
          보여줘서, 꼭 경고가 지목한 변수가 아니라도 원하는 방향으로 대응할 수 있게 한다. */}
      {CLIMATE_TICK_ENABLED && pendingClimateEvent && (
        <div className="climate-event" role="alertdialog" aria-label="이상기후 경보">
          <div className="climate-event__card">
            <span className="climate-event__tag">⚠ 이상기후 발생</span>
            <h2 className="climate-event__message">{pendingClimateEvent.warning}</h2>
            <p className="climate-event__sub">
              <strong>{remainingSeconds}초</strong> 안에 행성 조성을 조절해 막아보세요
            </p>
            <div className="climate-event__timer-track">
              <div
                className="climate-event__timer-fill"
                style={{ width: `${(remainingSeconds / CLIMATE_EVENT_RESPONSE_SECONDS) * 100}%` }}
              />
            </div>

            <div className="climate-event__sliders">
              {CLIMATE_VARIABLES.map(({ key, label }) => {
                const startValue = pendingClimateEvent.startValues[key];
                const min = Math.max(0, startValue - CLIMATE_ALERT_SLIDER_RANGE);
                const max = Math.min(100, startValue + CLIMATE_ALERT_SLIDER_RANGE);
                return (
                  <div key={key} className="climate-event__slider-row">
                    <span className="climate-event__slider-label">{label}</span>
                    <input
                      type="range"
                      min={min}
                      max={max}
                      value={values[key]}
                      onChange={(e) => setClimateValue(key, Number(e.target.value))}
                      className="climate-event__slider"
                    />
                    <span className="climate-event__slider-value">{values[key]}%</span>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default GamePage;
