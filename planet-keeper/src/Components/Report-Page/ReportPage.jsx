import { useState, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import useClimateStore from "../../store/useClimateStore";
import useGameStore from "../../store/useGameStore";
import { PLANET_STATES, planetStateOf, ENERGY_BALANCE_EPSILON } from "../../utils/physicsEngine.js";
import {
  describeTransition,
  deltaEnergyLines,
  formatSigned,
  relevantConceptKeys,
  labelTone,
  ALBEDO_REASON,
  GREENHOUSE_REASON,
} from "../../utils/planetAnalysis.js";
import { CLIMATE_CONCEPTS } from "../../data/climateConcepts.js";
import { MOCK_ITEMS } from "../../data/mockItems.js";
import "./ReportPage.css";

// 타임라인 항목의 label("☁️ 인공 구름 생성기" 등, useGameStore.useItem이 `${item.emoji}
// ${item.name}`로 저장)을 아이템 key로 되돌린다 - "아이템" 단계만 이 형식과 일치하고,
// "행성 생성"/"⚠️ ..."/"최종 확인 N/3" 같은 다른 단계 label은 매칭되지 않아 undefined를
// 돌려준다(원인을 하나로 특정할 수 없는 단계에 잘못 아이템 설명을 붙이지 않기 위함).
const ITEM_KEY_BY_LABEL = new Map(MOCK_ITEMS.map((item) => [`${item.emoji} ${item.name}`, item.key]));

// 퀴즈 데이터의 concepts 태그(예: "피드백", "에너지 평형")를 용어집 항목에 연결한다.
// 대부분은 term과 그대로 일치하지만, 일부는 더 구체적인 항목으로 이어준다.
const CONCEPT_ALIASES = {
  피드백: "climateFeedback",
  "에너지 평형": "energyBalance",
  평균기온: "currentTemperature",
};
const CONCEPTS_BY_TERM = Object.fromEntries(Object.values(CLIMATE_CONCEPTS).map((c) => [c.term, c]));
const lookupConcept = (name) => CLIMATE_CONCEPTS[CONCEPT_ALIASES[name]] ?? CONCEPTS_BY_TERM[name] ?? null;

// 타임라인 설명 한 줄이 "알베도->ASR" 계열인지 "온실효과->OLR" 계열인지 구분한다 -
// 하나의 조작(예: 구름)이 두 계열을 동시에 움직일 때, 어느 결과가 어느 원인 때문인지
// 색으로 바로 보이게 하려는 것이다. "왜"를 설명하는 이유 문장(ALBEDO_REASON/
// GREENHOUSE_REASON, 예: "구름은 태양빛을 반사하는 밝은 표면 역할을 합니다")은
// 그 자체로는 "알베도"/"ASR" 같은 키워드가 없어서 문자열 매칭만으로는 못 잡으므로,
// planetAnalysis.js가 실제로 쓰는 문구 그대로(ALBEDO_REASON/GREENHOUSE_REASON)를
// 먼저 정확히 대조하고, 그 외의 물리량 변화 문장은 키워드로 분류한다.
const ALBEDO_REASON_LINES = new Set(Object.values(ALBEDO_REASON));
const GREENHOUSE_REASON_LINES = new Set(Object.values(GREENHOUSE_REASON));
// "흡수하는 에너지"는 ASR 변화 줄("흡수하는 에너지(ASR)가...")뿐 아니라
// deltaEnergyLines의 중립 ΔE 방향 문장("방출하는 에너지가 흡수하는 에너지보다...")
// 에도 그대로 나오는 표현이라 여기 넣으면 안 된다 - "ASR" 자체가 그 줄에만 있는
// 유일한 표식이라 그것만으로 충분하다.
const CAUSE_FAMILY_KEYWORDS = {
  albedo: ["알베도", "ASR"],
  greenhouse: ["온실효과", "OLR", "방출되는 에너지", "우주로 방출"],
};
function causeFamilyOf(line) {
  if (ALBEDO_REASON_LINES.has(line)) return "albedo";
  if (GREENHOUSE_REASON_LINES.has(line)) return "greenhouse";
  if (CAUSE_FAMILY_KEYWORDS.albedo.some((k) => line.includes(k))) return "albedo";
  if (CAUSE_FAMILY_KEYWORDS.greenhouse.some((k) => line.includes(k))) return "greenhouse";
  return null;
}

// 설명 문장 안의 핵심 용어를 굵게 강조한다 - 문장이 길어서 어떤 값이 바뀐 건지
// 한눈에 안 들어올 때가 있다.
const HIGHLIGHT_TERMS = [
  "에너지 불균형", "알베도", "온실효과", "ΔE", "OLR", "ASR",
  "흡수하는 에너지", "방출하는 에너지", "방출되는 에너지", "평형",
];
const HIGHLIGHT_RE = new RegExp(`(${HIGHLIGHT_TERMS.join("|")})`, "g");
function renderExplanationLine(line, key) {
  const family = causeFamilyOf(line);
  const parts = line.split(HIGHLIGHT_RE);
  return (
    <p key={key} className={family ? `report-page__timeline-explain-line--${family}` : undefined}>
      {parts.map((part, j) => (HIGHLIGHT_TERMS.includes(part) ? <strong key={j}>{part}</strong> : part))}
    </p>
  );
}

// gameOverReason별 결과 배너. 성공 조건은 오직 "planet_stabilized"(Earth-like
// Stable 도달) 하나뿐이다 - Warm/Cold Stable, Energy Surplus/Deficit는 클리어가 아니다.
//
// 배너와 아래 "최종 행성 상태" 지표는 둘 다 planetStateOf 결과를 근거로 하므로
// 서로 어긋날 수 없다. 예전에는 최종 확인 3회를 채우면 실제 도달 여부와 무관하게
// planet_stabilized로 끝나서, "지구형에 도달했다"는 배너 옆에 "저온 안정"이 표시되는
// 자기모순이 있었다(useGameStore.finalizeGame 참고).
const RESULT_BANNER_BY_REASON = {
  planet_stabilized: {
    title: "🎉 미션 성공 - 행성 평형 안정 도달",
    detail: "최종 확인 결과 행성이 지구형 안정(Earth-like Stable) 상태에 도달해 게임을 성공적으로 마쳤습니다.",
    statusClass: "report-page__banner--success",
  },
  not_stabilized: {
    title: "⚠️ 미션 미완 - 지구형 범위 밖",
    detail:
      "최종 확인을 모두 마쳤지만 행성이 지구형 안정(Earth-like Stable) 범위에 들지 못했습니다. " +
      "에너지는 평형에 가깝지만 온도가 범위를 벗어난 상태입니다.",
    statusClass: "report-page__banner--partial",
  },
  life_over: {
    title: "💔 미션 실패 - 목숨 소진",
    detail: "오답이 3회 누적되어 행성을 안정시키지 못한 채 게임이 종료됐습니다.",
    statusClass: "report-page__banner--failure",
  },
};

const KOREAN_BY_STATE = Object.fromEntries(PLANET_STATES.map(({ state, korean }) => [state, korean]));

const fmt = (value, digits = 2) => (value == null ? "-" : value.toFixed(digits));

// 리포트 안의 각 섹션(타임라인/문제풀이/아이템/개념정리)을 독립적으로 접고 펼 수 있게
// 감싸는 래퍼 - 요약 배너는 항상 보여야 하는 결과라 여기 포함하지 않는다.
function CollapsibleSection({ title, defaultOpen = true, children }) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="report-page__section">
      <button
        type="button"
        className="report-page__section-toggle"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
      >
        <span className="report-page__section-toggle-icon">{open ? "▼" : "▶"}</span>
        <h3>{title}</h3>
      </button>
      {open && children}
    </div>
  );
}

function ReportPage() {
  const navigate = useNavigate();
  const resetClimate = useClimateStore((state) => state.resetClimate);
  const gameOverReason = useGameStore((state) => state.gameOverReason);
  const elapsedSeconds = useGameStore((state) => state.elapsedSeconds);
  const timeline = useGameStore((state) => state.timeline);
  const quizLog = useGameStore((state) => state.quizLog);
  const inventory = useGameStore((state) => state.inventory);
  const resetGame = useGameStore((state) => state.resetGame);
  const replayGame = useGameStore((state) => state.replayGame);

  const resultBanner = RESULT_BANNER_BY_REASON[gameOverReason] ?? {
    title: "행성 진단 결과",
    detail: "",
    statusClass: "",
  };

  // timeline[0]=행성 생성 시점, 마지막=최종 상태. 정상 플레이라면 항상 최소 1개는
  // 있지만(nextProblem이 "초기"를 채운다), 방어적으로 없을 때도 깨지지 않게 한다.
  const initial = timeline[0] ?? null;
  const final = timeline[timeline.length - 1] ?? null;
  const finalRuleState = final ? planetStateOf(final.physics.deltaEnergy, final.physics.currentTemperature) : null;

  // "핵심 개념 정리"에서 9개 전부가 아니라 이번 판에 실제로 나타난 개념만 고른다.
  const relevantKeys = useMemo(
    () => relevantConceptKeys({ initial, final, timeline, gameOverReason }),
    [initial, final, timeline, gameOverReason],
  );

  // 연속으로 동일한 상태나 행동이 중복 기록된 타임라인 제거
  const uniqueTimeline = useMemo(() => {
    return timeline.filter((entry, index) => {
      if (index === 0) return true;
      const prev = timeline[index - 1];
      const isSameStage = entry.stage === prev.stage;
      const isSameLabel = entry.label === prev.label;
      const isSameTemp = entry.physics.currentTemperature === prev.physics.currentTemperature;
      const isSameDelta = entry.physics.deltaEnergy === prev.physics.deltaEnergy;
      return !(isSameStage && isSameLabel && isSameTemp && isSameDelta);
    });
  }, [timeline]);

  // 아이템 사용이 많아질수록 스텝별 카드가 줄줄이 늘어나 오히려 "전체적으로
  // 에너지가 어느 방향으로 수렴했는지"라는 핵심(에너지 평형 원리)이 안 보였다.
  // 그래서 스텝별 카드 그리드 대신 ΔE 하나로 이어진 추이(경향성) 그래프
  // 하나로 통합한다 - 위/아래(양/음 피드백 방향)와 평형 띠(±epsilon) 진입 여부가
  // 선 하나로 한눈에 들어온다. 아이템 사용 지점은 그 위에 이모지로 표시해서
  // "어떤 조작이 어느 방향으로 움직였는지"는 그대로 남긴다. 각 지점을 누르면
  // 그 지점 하나의 원인->과정->결과 설명(예전 카드 안 문구와 동일한 계산)을
  // 아래에 펼친다 - 그래프에는 숫자만, 설명은 원할 때만 보이게 분리했다.
  const chartPoints = useMemo(
    () =>
      uniqueTimeline.map((entry, i) => ({
        index: i,
        stage: entry.stage,
        label: entry.label,
        temperature: entry.physics.currentTemperature,
        deltaEnergy: entry.physics.deltaEnergy,
        tone: labelTone(entry.ml?.label),
        mlLabel: entry.ml?.label ?? null,
        isItem: entry.stage === "아이템",
      })),
    [uniqueTimeline],
  );

  const [selectedStep, setSelectedStep] = useState(null);
  const activeStep = selectedStep ?? chartPoints.length - 1;
  const activePoint = chartPoints[activeStep] ?? null;

  // 선택된 지점 하나만 그때그때 계산한다(전체를 미리 계산해두지 않음) - 카드
  // 그리드였을 때처럼 모든 스텝의 설명을 항상 들고 있을 필요가 없다.
  const activeExplanation = useMemo(() => {
    if (!activePoint) return null;
    const entry = uniqueTimeline[activeStep];
    const prev = activeStep > 0 ? uniqueTimeline[activeStep - 1] : null;
    return prev
      ? describeTransition(prev.physics, entry.physics, entry.ml?.label, ITEM_KEY_BY_LABEL.get(entry.label))
      : deltaEnergyLines(entry.physics.deltaEnergy);
  }, [activeStep, activePoint, uniqueTimeline]);

  // 그래프 좌표 계산 - ΔE=0이 세로 가운데, 위쪽은 에너지 과다(온난화/양의
  // 되먹임), 아래쪽은 에너지 부족(냉각/음의 되먹임) 방향이다. 실제 데이터가
  // epsilon보다 훨씬 작아도 평형 띠가 안 보일 만큼 안 찌그러지도록 최소
  // 스케일(epsilon×1.4)을 보장한다.
  const CHART_W = 640;
  const CHART_H = 200;
  const CHART_PAD_X = 20;
  const CHART_PAD_Y = 18;
  const maxAbsDeltaEnergy = Math.max(
    ENERGY_BALANCE_EPSILON * 1.4,
    ...chartPoints.map((p) => Math.abs(p.deltaEnergy)),
  );
  const xOf = (i) =>
    CHART_PAD_X + (chartPoints.length > 1 ? (i / (chartPoints.length - 1)) * (CHART_W - CHART_PAD_X * 2) : 0);
  const yOf = (deltaEnergy) =>
    CHART_H / 2 - (deltaEnergy / maxAbsDeltaEnergy) * (CHART_H / 2 - CHART_PAD_Y);
  const polylinePoints = chartPoints.map((p) => `${xOf(p.index)},${yOf(p.deltaEnergy)}`).join(" ");
  const bandTop = yOf(ENERGY_BALANCE_EPSILON);
  const bandBottom = yOf(-ENERGY_BALANCE_EPSILON);

  // 사용한 아이템 중복 제거
  const uniqueInventory = useMemo(() => [...new Set(inventory)], [inventory]);

  // 오답 후 같은 문제를 다시 제출하면 quizLog에는 시도마다 한 줄씩 쌓인다 -
  // id로 묶어서 "문제 하나당 한 줄 + 시도 목록"으로 보여준다. 오답이었다가
  // 결국 맞힌 문제도 여기서는 최종 시도 결과(correct)로 판단한다.
  const quizGroups = useMemo(() => {
    const groups = [];
    const byId = new Map();
    quizLog.forEach((q) => {
      const key = q.id ?? q.title;
      let group = byId.get(key);
      if (!group) {
        group = {
          key,
          title: q.title,
          correctAnswer: q.correctAnswer,
          explanation: q.explanation,
          concepts: q.concepts,
          attempts: [],
        };
        byId.set(key, group);
        groups.push(group);
      }
      group.attempts.push({ selectedAnswer: q.selectedAnswer, correct: q.correct });
    });
    return groups.map((g) => ({
      ...g,
      correct: g.attempts[g.attempts.length - 1].correct,
      isRetry: g.attempts.length > 1,
    }));
  }, [quizLog]);

  const correctGroups = quizGroups.filter((g) => g.correct);
  const wrongGroups = quizGroups.filter((g) => !g.correct);

  // "문제 풀이 결과" 목록에서 클릭한 문제 - key로 저장해서 클릭할 때마다 다시
  // 최신 quizGroups를 참조한다(값 자체를 복사해두지 않음).
  const [selectedGroupKey, setSelectedGroupKey] = useState(null);
  const selectedGroup = selectedGroupKey != null ? quizGroups.find((g) => g.key === selectedGroupKey) : null;

  const handleReplay = async () => {
    await replayGame();
    navigate("/game");
  };

  const handleRestart = () => {
    resetClimate();
    resetGame();
    navigate("/planet-create");
  };

  return (
    <div className="report-page">
      <h1 className="report-page__title">피드백 창</h1>

      {/* 최종 결과 위주 배너 */}
      <div className={`report-page__section report-page__summary-card ${resultBanner.statusClass}`}>
        <div className="report-page__summary-main">
          <h2>{resultBanner.title}</h2>
          {resultBanner.detail && <p className="report-page__summary-detail">{resultBanner.detail}</p>}
        </div>
        
        <div className="report-page__summary-metrics">
          <div className="report-page__metric-box">
            <span className="report-page__metric-label">최종 행성 상태</span>
            <span className="report-page__metric-value">
              {final ? KOREAN_BY_STATE[finalRuleState] : "-"}
            </span>
          </div>
          <div className="report-page__metric-box">
            <span className="report-page__metric-label">에너지 수지 판정</span>
            <span className="report-page__metric-value">
              {final?.ml ? final.ml.label : "-"}
            </span>
          </div>
          <div className="report-page__metric-box">
            <span className="report-page__metric-label">총 소요 시간</span>
            <span className="report-page__metric-value">⏱️ {elapsedSeconds}초</span>
          </div>
        </div>

        {final && (
          <p className="report-page__final-physics">
            🌡️ 최종 물리값: 온도 {fmt(final.physics.currentTemperature, 1)}K · ΔE{" "}
            {formatSigned(final.physics.deltaEnergy, 2)} W/m²
            <span className="report-page__tolerance-note">
              {" "}
              (평형 기준 ±{ENERGY_BALANCE_EPSILON.toFixed(1)})
            </span>{" "}
            · 알베도 {fmt(final.physics.albedo)} · 온실효과 {fmt(final.physics.greenhouseStrength)}
          </p>
        )}
      </div>

      <hr className="report-page__divider" />

      {/* 행성 변화 타임라인: ΔE 추이 하나로 통합한 그래프 + 지점 클릭 시 설명 */}
      <CollapsibleSection title="행성 변화 타임라인">
        {chartPoints.length ? (
          <>
            <p className="report-page__subtext">
              선을 따라가면 에너지가 어느 방향으로 움직였는지 한눈에 보입니다. 초록 띠는 평형 범위(±
              {ENERGY_BALANCE_EPSILON.toFixed(1)})를 나타내며, 띠 위쪽은 에너지 과다(온난화), 아래쪽은 에너지 부족(냉각)을 뜻합니다.
              점을 클릭하면 해당 지점의 원인과 결과가 아래에 표시됩니다.
            </p>
            <svg
              className="report-page__timeline-chart"
              viewBox={`0 0 ${CHART_W} ${CHART_H}`}
              role="img"
              aria-label="ΔE(에너지 수지) 추이 그래프"
            >
              <rect
                className="report-page__timeline-chart-band"
                x={CHART_PAD_X}
                y={bandTop}
                width={CHART_W - CHART_PAD_X * 2}
                height={bandBottom - bandTop}
              />
              <line
                className="report-page__timeline-chart-zero"
                x1={CHART_PAD_X}
                x2={CHART_W - CHART_PAD_X}
                y1={CHART_H / 2}
                y2={CHART_H / 2}
              />
              <polyline className="report-page__timeline-chart-line" points={polylinePoints} />
              {chartPoints.map((p) => (
                <g
                  key={p.index}
                  className="report-page__timeline-chart-point"
                  transform={`translate(${xOf(p.index)}, ${yOf(p.deltaEnergy)})`}
                  onClick={() => setSelectedStep(p.index)}
                >
                  <circle
                    r={p.index === activeStep ? 7 : 5}
                    className={`report-page__timeline-chart-dot report-page__timeline-chart-dot--${p.tone}${
                      p.index === activeStep ? " is-active" : ""
                    }`}
                  />
                  {p.isItem && (
                    <text className="report-page__timeline-chart-emoji" y={-12}>
                      {p.label.split(" ")[0]}
                    </text>
                  )}
                </g>
              ))}
            </svg>

            {activePoint && (
              <div className="report-page__timeline-detail">
                <div className="report-page__timeline-card-header">
                  <span className="report-page__timeline-step-tag">Step {activeStep + 1}</span>
                  <span className="report-page__timeline-stage">{activePoint.stage}</span>
                  {activePoint.label && <span className="report-page__timeline-chip">{activePoint.label}</span>}
                </div>

                <div className="report-page__timeline-explain">
                  {activeExplanation.map((line, j) => renderExplanationLine(line, j))}
                </div>

                <span className="report-page__metric-badge">
                  🌡️ {activePoint.temperature.toFixed(1)}K · ΔE {formatSigned(activePoint.deltaEnergy)} ·{" "}
                  <span className={`report-page__metric-badge-label report-page__metric-badge-label--${activePoint.tone}`}>
                    {activePoint.mlLabel ?? "-"}
                  </span>
                </span>
              </div>
            )}
          </>
        ) : (
          <p>기록된 변화가 없습니다.</p>
        )}
      </CollapsibleSection>

      <hr className="report-page__divider" />

      {/* 문제 풀이 결과 */}
      <CollapsibleSection title="문제 풀이 결과">
        <p className="report-page__subtext">
          맞은 문제 <strong>{correctGroups.length}</strong>개 / 틀린 문제 <strong>{wrongGroups.length}</strong>개 — 문제를 클릭하면 해설을 볼 수 있습니다.
        </p>

        {quizGroups.length ? (
          <ul className="report-page__quiz-list">
            {quizGroups.map((g) => (
              <li
                key={g.key}
                className={`report-page__quiz-item ${
                  g.correct ? "report-page__quiz-item--correct" : "report-page__quiz-item--wrong"
                }`}
                onClick={() => setSelectedGroupKey(g.key)}
              >
                <span className="report-page__quiz-mark">{g.correct ? "✓" : "✗"}</span>
                <span className="report-page__quiz-title">{g.title}</span>
                {g.isRetry && <span className="report-page__quiz-retry-badge">재도전 문제</span>}
              </li>
            ))}
          </ul>
        ) : (
          <p>푼 문제가 없습니다.</p>
        )}
      </CollapsibleSection>

      {/* 고급화된 문제 해설 모달 */}
      {selectedGroup && (
        <div className="report-page__modal-overlay" onClick={() => setSelectedGroupKey(null)}>
          <div className="report-page__modal" onClick={(e) => e.stopPropagation()}>
            <div className="report-page__modal-header">
              <span className={`report-page__modal-badge ${selectedGroup.correct ? "report-page__modal-badge--correct" : "report-page__modal-badge--wrong"}`}>
                {selectedGroup.correct ? "정답" : "오답"}
              </span>
              <p className="report-page__modal-question">{selectedGroup.title}</p>
            </div>

            <div className="report-page__modal-answers">
              {selectedGroup.attempts.map((attempt, i) => (
                <div key={i} className="report-page__modal-answer-row">
                  <span className="report-page__modal-label">
                    {selectedGroup.attempts.length > 1 ? `${i + 1}차 제출` : "제출한 답"}
                  </span>
                  <span className={attempt.correct ? "text-correct" : "text-wrong"}>{attempt.selectedAnswer}</span>
                </div>
              ))}
              <div className="report-page__modal-answer-row">
                <span className="report-page__modal-label">정답</span>
                <span className="text-correct">{selectedGroup.correctAnswer}</span>
              </div>
            </div>

            {selectedGroup.explanation && (
              <div className="report-page__modal-section">
                <h4 className="report-page__modal-subtitle">💡 해설</h4>
                <div className="report-page__modal-explanation">
                  <p>{selectedGroup.explanation}</p>
                </div>
              </div>
            )}

            {selectedGroup.concepts?.length > 0 && (
              <div className="report-page__modal-section">
                <h4 className="report-page__modal-subtitle">📚 관련 개념</h4>
                <ul className="report-page__concept-list">
                  {selectedGroup.concepts.map((concept) => {
                    const matched = lookupConcept(concept);
                    return (
                      <li key={concept}>
                        <strong className="report-page__concept-term">{concept}</strong>
                        {matched && <span> — {matched.detail}</span>}
                      </li>
                    );
                  })}
                </ul>
              </div>
            )}

            <button className="report-page__modal-close-btn" onClick={() => setSelectedGroupKey(null)}>
              닫기
            </button>
          </div>
        </div>
      )}

      <hr className="report-page__divider" />

      {/* 사용한 아이템 */}
      <CollapsibleSection title="사용한 아이템">
        <p>{uniqueInventory.length ? uniqueInventory.join(", ") : "없음"}</p>
      </CollapsibleSection>

      <hr className="report-page__divider" />

      {/* 교과 개념 정리 - 지구과학Ⅰ 수준으로 핵심 개념만 짧게 다시 정리한다. */}
      <CollapsibleSection title="핵심 개념 정리">
        <p className="report-page__subtext">이번 플레이에서 실제로 나타난 개념만 골랐습니다.</p>
        <div className="report-page__concept-grid">
          {Object.entries(CLIMATE_CONCEPTS)
            .filter(([key]) => relevantKeys.has(key))
            .map(([key, concept]) => (
              <div key={key} className="report-page__concept-card">
                <p className="report-page__concept-card-term">{concept.term}</p>
                <p>{concept.detail}</p>
              </div>
            ))}
        </div>
      </CollapsibleSection>

      <div className="report-page__actions">
        <button className="btn-primary" onClick={handleReplay}>
          다시 플레이 (같은 행성)
        </button>
        <button onClick={handleRestart}>행성 다시 만들기</button>
      </div>
    </div>
  );
}

export default ReportPage;