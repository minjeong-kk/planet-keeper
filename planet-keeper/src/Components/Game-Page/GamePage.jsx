import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import QuizModal, { QuizResult } from "./QuizModal";
import EquipmentPanel from "./EquipmentPanel";
import EquipmentReward from "./EquipmentReward";
import InfoPanel from "./InfoPanel";
import PlanetDiagnosis from "./PlanetDiagnosis";
import Tutorial from "../common/Tutorial";
import { GAME_TOUR_STEPS } from "../common/tourSteps.js";
import PlanetUI from "../Planet-ui.jsx";
import useClimateStore, { CLIMATE_VARIABLES } from "../../store/useClimateStore";
import useGameStore, {
  GAME_STAGES,
  MAX_WRONG_COUNT,
  MAX_FINAL_ATTEMPTS,
  CLIMATE_EVENT_RESPONSE_SECONDS,
  MAX_EQUIPMENT_CAPACITY,
  equipmentTotalCount,
  ITEM_EFFECT_EPSILON,
} from "../../store/useGameStore";
import { slidersToVisual } from "../../utils/climateVisual.js";
import {
  mapSlidersToClimateInputs,
  equilibriumTemperatureOf,
  computeClimateV2,
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

// 장비 사용 직후 행성 옆에 뜨는 효과 카드가 유지되는 시간(ms).
const USE_EFFECT_DISPLAY_MS = 3200;

// 조성·온도가 바뀔 때 행성 외형이 그 값으로 옮겨가는 시간(ms). 즉시 바꾸면 한 프레임
// 만에 끝나서 "변했다"는 게 눈에 안 들어온다 - 장비 효과가 보이도록 천천히 모습을 바꾼다.
const VISUAL_TWEEN_MS = 900;

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
  [GAME_STAGES.ITEM]: { tag: "MISSION 01", objective: "확보할 기후 제어 장비를 선택하라" },
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

// 행성 3D 시각 props(0~1 수치들)를 목표값으로 부드럽게 옮긴다. 표시 전용이라
// 물리 값(values/physicsResult)은 건드리지 않는다 - target은 useMemo로 안정된
// 객체를 받아야 한다(매 렌더 새 객체면 effect가 계속 다시 돈다).
function useAnimatedVisual(target, duration = VISUAL_TWEEN_MS) {
  const [value, setValue] = useState(target);
  const currentRef = useRef(target);

  useEffect(() => {
    const from = currentRef.current;
    const keys = Object.keys(target);
    if (keys.every((k) => Math.abs(from[k] - target[k]) < 0.002)) {
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
      const next = {};
      for (const key of keys) next[key] = from[key] + (target[key] - from[key]) * eased;
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
  const currentTemperature = useClimateStore((state) => state.currentTemperature);
  const resetClimate = useClimateStore((state) => state.resetClimate);
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
  const beginClimateResponse = useGameStore((state) => state.beginClimateResponse);
  const extendClimateResponse = useGameStore((state) => state.extendClimateResponse);
  const resolveClimateEvent = useGameStore((state) => state.resolveClimateEvent);
  const tutorialPending = useGameStore((state) => state.tutorialPending);
  const dismissTutorial = useGameStore((state) => state.dismissTutorial);
  const solveProblem = useGameStore((state) => state.solveProblem);
  const equipment = useGameStore((state) => state.equipment);
  const claimEquipment = useGameStore((state) => state.claimEquipment);
  const applyEquipment = useGameStore((state) => state.applyEquipment);
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

  // 조성뿐 아니라 현재 온도까지 외형에 반영한다 - 장비로 온도가 움직이면 바다·빙하·
  // 대기 색이 함께 변해서 "행성이 바뀌었다"가 보인다(표시 전용 보정).
  const visualTarget = useMemo(
    () => slidersToVisual(values, physicsResult?.currentTemperature ?? currentTemperature),
    [values, physicsResult?.currentTemperature, currentTemperature],
  );
  const visual = useAnimatedVisual(visualTarget);

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
  // 온보딩. 새 게임을 시작하면(tutorialPending) 자동으로 열리고, 리포트에서
  // 이어서 시작한 경우엔 열리지 않는다. 언제든 상단 도움말(?) 버튼으로 다시 열 수
  // 있다. 열려 있는 동안에는 아래 타이머 effect가 tickSecond를 돌리지 않으므로
  // 이상기후가 끼어들지 않는다.
  const [tutorialOpen, setTutorialOpen] = useState(false);
  // 장비 사용 직후 행성 옆에 잠깐 뜨는 효과 카드 { item, before, after }.
  const [useEffectCard, setUseEffect] = useState(null);

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
    // 온보딩 중에는 게임을 멈춘다 - 설명을 읽는 동안 경과 시간이 쌓이거나
    // 이상기후가 터지면 튜토리얼의 의미가 없다.
    if (tutorialOpen) return undefined;
    const timer = setInterval(tickSecond, 1000);
    return () => clearInterval(timer);
  }, [currentStage, tickSecond, tutorialOpen]);

  // 온보딩이 예약된 판에서 실제로 플레이 가능한 화면이 준비되면(문제/장비 단계 + 물리
  // 결과가 채워짐) 한 번만 자동으로 연다.
  useEffect(() => {
    if (!tutorialPending || !physicsResult) return;
    if (currentStage === GAME_STAGES.CREATOR || currentStage === GAME_STAGES.REPORT) return;
    setTutorialOpen(true);
  }, [tutorialPending, physicsResult, currentStage]);

  const handleTutorialFinish = () => {
    setTutorialOpen(false);
    dismissTutorial();
  };

  // 선택지를 누르면 곧바로 판정한다(별도 제출 버튼 없음).
  const handleAnswer = (answer) => {
    if (!currentProblem) return;
    const answered = currentProblem;
    const rewardText = currentStage === GAME_STAGES.FINAL ? "행성 안정화 확인 ×1" : "기후 제어 장비 ×1";
    const correct = solveProblem(answer);
    setFeedback(correct ? "correct" : "wrong");
    setResult({
      correct,
      explanation: answered.explanation,
      concepts: answered.concepts,
      reward: correct ? rewardText : null,
    });
  };

  // 보상 선택: 고른 장비를 인벤토리에 넣기만 한다(물리 상태는 그대로).
  const handleClaimEquipment = (item) => {
    setResult(null);
    claimEquipment(item);
  };

  // 장비 사용: 실제로 행성을 바꾼다. 사용 전/후 스냅샷을 비교해 짧은 효과 카드를
  // 띄운다(온도·ΔE가 어떻게 움직였는지). applyEquipment는 await 하면 store 갱신이
  // 끝난 상태이므로 그 뒤에 최신 physicsResult를 읽는다.
  const handleUseEquipment = async (item) => {
    const before = useGameStore.getState().physicsResult;
    setResult(null);
    await applyEquipment(item);
    const after = useGameStore.getState().physicsResult;
    if (before && after && after !== before) setUseEffect({ item, before, after });
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

  // 보유 장비 총 수량 - 하단 안내 문구에서 "지금 쓸 게 있는지"를 알려주는 데 쓴다.
  const heldEquipmentCount = useMemo(() => equipmentTotalCount(equipment), [equipment]);


  // 장비 사용 효과 카드는 잠깐 보여준 뒤 사라진다.
  useEffect(() => {
    if (!useEffectCard) return undefined;
    const timer = setTimeout(() => setUseEffect(null), USE_EFFECT_DISPLAY_MS);
    return () => clearTimeout(timer);
  }, [useEffectCard]);

  const displayTemperature = useAnimatedNumber(physicsResult?.currentTemperature ?? null);
  const markerPercent = gaugePercent(displayTemperature);
  const badge = STABLE_BADGES[mlResult?.label];
  const isBalanced = physicsResult ? Math.abs(physicsResult.deltaEnergy) <= ENERGY_BALANCE_EPSILON : false;
  // 브리핑 단계(expiresAt === null)에는 카운트다운이 아직 흐르지 않는다.
  const isBriefing = !!pendingClimateEvent && pendingClimateEvent.expiresAt == null;
  const remainingSeconds =
    pendingClimateEvent && pendingClimateEvent.expiresAt != null
      ? Math.max(0, pendingClimateEvent.expiresAt - elapsedSeconds)
      : CLIMATE_EVENT_RESPONSE_SECONDS;

  // 경보 대응 중에는 슬라이더를 움직일 때마다 지금 조성의 ΔE/평형 온도를 다시
  // 계산해서 보여준다(표시 전용 - 실제 physicsResult는 resolveClimateEvent가
  // 판정할 때만 갱신된다). 플레이어가 "지금 내가 맞는 방향으로 가고 있나"를
  // 값 자체로 확인할 수 있게 하는 용도다.
  const livePhysics = useMemo(
    () => (pendingClimateEvent ? computeClimateV2({ ...climateInputs, currentTemperature }) : null),
    [pendingClimateEvent, climateInputs, currentTemperature],
  );
  const startDeltaEnergy = physicsResult?.deltaEnergy ?? 0;
  const liveTrend =
    livePhysics == null
      ? null
      : Math.abs(livePhysics.deltaEnergy) < Math.abs(startDeltaEnergy) - 0.5
        ? "good"
        : Math.abs(livePhysics.deltaEnergy) > Math.abs(startDeltaEnergy) + 0.5
          ? "bad"
          : "same";

  // 경보를 막으려면 이벤트가 미는 방향의 반대로 움직여야 한다 - 어느 슬라이더를
  // 어느 쪽으로 볼지만 알려주고, 목표값(몇 %)은 알려주지 않는다.
  const counterDirection = pendingClimateEvent ? (pendingClimateEvent.delta > 0 ? -1 : 1) : 0;

  // 지금 무엇을 해야 하는지 한 줄 안내 - 하단 바 오른쪽에 둔다.
  const actionHint = isComputing
    ? "행성 상태를 다시 계산하는 중..."
    : isLocked
      ? "이상기후에 대응하세요"
      : isItemStage
        ? "확보할 장비를 선택하세요"
        : isQuizStage
          ? heldEquipmentCount >= MAX_EQUIPMENT_CAPACITY
            ? "장비 보유 한도 - 왼쪽에서 먼저 사용하세요"
            : heldEquipmentCount > 0
              ? "선택지를 누르면 응답됩니다 · 장비는 왼쪽에서 언제든 사용"
              : "선택지를 누르면 바로 응답됩니다"
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
          {/* 온보딩은 최초 1회만 자동으로 뜨고, 그 뒤에는 여기서 다시 볼 수 있다. */}
          <button
            type="button"
            className="hud__help"
            title="게임 설명 다시 보기"
            aria-label="게임 설명 다시 보기"
            onClick={() => setTutorialOpen(true)}
          >
            ?
          </button>
        </div>
      </header>

      {/* ── 본체: 좌(상태·격납고) / 중앙(행성) / 우(임무·진단) ── */}
      <main className="hud__body">
        <aside className="hud__column hud__column--left">
          <InfoPanel physicsResult={physicsResult} co2Ppm={climateInputs.co2Ppm} />
          <EquipmentPanel
            equipment={equipment}
            onUse={handleUseEquipment}
            disabled={isLocked || isItemStage || isComputing}
            lockReason={isItemStage ? "먼저 확보할 장비를 선택하세요." : null}
          />
        </aside>

        <section className="hud__stage">
          <div className="hud__planet-frame" data-tour="planet">
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

            {/* 장비 사용 직후 - 무엇을 썼고 온도/ΔE가 어떻게 움직였는지만 짧게 */}
            {useEffectCard && (
              <div className="use-effect">
                <span className="use-effect__title">
                  {useEffectCard.item.emoji} {useEffectCard.item.name} 사용
                </span>
                <span className="use-effect__row">
                  현재 온도 {useEffectCard.before.currentTemperature.toFixed(1)} K
                  <em>→</em>
                  {useEffectCard.after.currentTemperature.toFixed(1)} K
                </span>
                <span className="use-effect__row">
                  에너지 불균형 {formatSigned(useEffectCard.before.deltaEnergy)}
                  <em>→</em>
                  {formatSigned(useEffectCard.after.deltaEnergy)} W/m²
                </span>
                {/* 어떤 장비가 맞는 선택인지 미리 알려주지 않고, 쓴 뒤의 결과로
                    알려준다 - 방향을 스스로 판단하고 결과로 확인하는 흐름이다. */}
                {(() => {
                  const gap = Math.abs(useEffectCard.after.deltaEnergy) - Math.abs(useEffectCard.before.deltaEnergy);
                  const tone = gap < -ITEM_EFFECT_EPSILON ? "good" : gap > ITEM_EFFECT_EPSILON ? "bad" : "same";
                  return (
                    <span className={`use-effect__trend is-${tone}`}>
                      {tone === "good"
                        ? "↘ 균형에 가까워졌습니다"
                        : tone === "bad"
                          ? "↗ 균형에서 멀어졌습니다"
                          : "· 거의 변화가 없습니다"}
                    </span>
                  );
                })()}
              </div>
            )}
          </div>

          {/* 현재 온도 + 게이지는 튜토리얼에서 한 덩어리로 강조한다. */}
          <div className="hud__temperature" data-tour="temperature">
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
                  reward={currentStage === GAME_STAGES.FINAL ? "행성 안정화 확인 ×1" : "기후 제어 장비 ×1"}
                />
              )}

              {isItemStage && !isComputing && (
                <EquipmentReward items={visibleItems} onClaim={handleClaimEquipment} disabled={isLocked} />
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

            {/* ① 발생 -> ② 상황 설명(브리핑). 여기서는 시간이 흐르지 않는다. */}
            {isBriefing ? (
              <>
                <p className="climate-event__goal">
                  <strong>목표</strong> 에너지 균형을 회복하세요 (ΔE를 0에 가깝게)
                </p>
                {pendingClimateEvent.hint && (
                  <p className="climate-event__hint">💡 {pendingClimateEvent.hint}</p>
                )}
                <p className="climate-event__sub">
                  다음 화면에서 행성 조성을 직접 조절할 수 있습니다. 조절하는 동안에는 시간이 넉넉하게
                  주어집니다.
                </p>
                <button type="button" className="climate-event__cta" onClick={beginClimateResponse}>
                  대응 시작
                </button>
              </>
            ) : (
              /* ③ 조절 -> ④ 확인 */
              <>
                {pendingClimateEvent.hint && (
                  <p className="climate-event__hint">💡 {pendingClimateEvent.hint}</p>
                )}

                <div className="climate-event__timer-track">
                  <div
                    className="climate-event__timer-fill"
                    style={{ width: `${(remainingSeconds / CLIMATE_EVENT_RESPONSE_SECONDS) * 100}%` }}
                  />
                </div>
                <p className="climate-event__sub">
                  남은 시간 <strong>{remainingSeconds}초</strong> · 슬라이더를 움직이는 동안에는 시간이 다시
                  늘어납니다
                </p>

                {/* 조절하는 동안 지금 조성의 ΔE/평형 온도를 실시간으로 보여준다. */}
                {livePhysics && (
                  <div className={`climate-event__live climate-event__live--${liveTrend}`}>
                    <div className="climate-event__live-item">
                      <span>에너지 불균형</span>
                      <strong>{formatSigned(livePhysics.deltaEnergy)} W/m²</strong>
                    </div>
                    <div className="climate-event__live-item">
                      <span>평형 온도</span>
                      <strong>{equilibriumTemperatureOf(livePhysics).toFixed(1)} K</strong>
                    </div>
                    <span className="climate-event__live-tag">
                      {liveTrend === "good" ? "↘ 균형에 가까워지는 중" : liveTrend === "bad" ? "↗ 더 멀어지는 중" : "· 변화 없음"}
                    </span>
                  </div>
                )}

                <div className="climate-event__sliders">
                  {CLIMATE_VARIABLES.map(({ key, label }) => {
                    const startValue = pendingClimateEvent.startValues[key];
                    const min = Math.max(0, startValue - CLIMATE_ALERT_SLIDER_RANGE);
                    const max = Math.min(100, startValue + CLIMATE_ALERT_SLIDER_RANGE);
                    // 경보가 지목한 변수에만 방향 표시를 붙인다(정확한 목표값은 알려주지 않는다).
                    const isTarget = key === pendingClimateEvent.key;
                    return (
                      <div
                        key={key}
                        className={`climate-event__slider-row${isTarget ? " climate-event__slider-row--target" : ""}`}
                      >
                        <span className="climate-event__slider-label">{label}</span>
                        <input
                          type="range"
                          min={min}
                          max={max}
                          value={values[key]}
                          onChange={(e) => {
                            setClimateValue(key, Number(e.target.value));
                            extendClimateResponse();
                          }}
                          className="climate-event__slider"
                        />
                        <span className="climate-event__slider-value">{values[key]}%</span>
                        <span className="climate-event__slider-arrow">
                          {isTarget ? (counterDirection > 0 ? "↑" : "↓") : ""}
                        </span>
                      </div>
                    );
                  })}
                </div>

                <button type="button" className="climate-event__cta" onClick={resolveClimateEvent}>
                  대응 완료
                </button>
              </>
            )}
          </div>
        </div>
      )}

      {/* 첫 플레이 온보딩 - 실제 UI를 하나씩 짚어준다(data-tour 대상). */}
      {tutorialOpen && <Tutorial steps={GAME_TOUR_STEPS} onFinish={handleTutorialFinish} />}
    </div>
  );
}

export default GamePage;
