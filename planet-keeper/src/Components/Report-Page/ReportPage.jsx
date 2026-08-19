import { useState, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import useClimateStore from "../../store/useClimateStore";
import useGameStore from "../../store/useGameStore";
import { PLANET_STATES, planetStateOf, ENERGY_BALANCE_EPSILON } from "../../utils/physicsEngine.js";
import {
  describeTransition,
  deltaEnergyLines,
  formatSigned,
  labelTone,
} from "../../utils/planetAnalysis.js";
import { causeFamilyOf, renderHighlightedParts } from "../../utils/explanationHighlight.jsx";
import { CLIMATE_CONCEPTS } from "../../data/climateConcepts.js";
import { MOCK_ITEMS } from "../../data/mockItems.js";
import "./ReportPage.css";

// 타임라인 항목의 label("☁️ 인공 구름 생성기" 등, useGameStore.applyEquipment가 `${item.emoji}
// ${item.name}`로 저장)을 아이템 key로 되돌린다 - "아이템" 단계만 이 형식과 일치하고,
// "행성 생성"/"⚠️ ..."/"최종 확인 N/3" 같은 다른 단계 label은 매칭되지 않아 undefined를
// 돌려준다(원인을 하나로 특정할 수 없는 단계에 잘못 아이템 설명을 붙이지 않기 위함).
const ITEM_KEY_BY_LABEL = new Map(MOCK_ITEMS.map((item) => [`${item.emoji} ${item.name}`, item.key]));

// 퀴즈 데이터의 concepts 태그(예: "피드백", "에너지 평형")를 용어집 항목에 연결한다.
// 대부분은 term과 그대로 일치하지만, 일부는 더 구체적인 항목으로 이어준다.
const CONCEPT_ALIASES = {
  피드백: "climateFeedback",       // 태그 "피드백" vs term "기후 피드백" - 다름
  "에너지 평형": "energyBalance",   // 이미 term과 동일하지만 있어도 무해
  평균기온: "currentTemperature",   // 태그 "평균기온" vs term "현재 평균 온도" - 다름
};

// concept 태그(예: "피드백", "알베도")로부터 CLIMATE_CONCEPTS의 키(예: "climateFeedback")를
// 찾는다. lookupConcept은 개념 "객체"를 돌려주지만, 카드 하이라이트는 relevantKeys와
// 비교할 "키"가 필요해서 별도로 둔다.
const KEY_BY_TERM = Object.fromEntries(Object.entries(CLIMATE_CONCEPTS).map(([key, c]) => [c.term, key]));
const conceptKeyOf = (tag) => CONCEPT_ALIASES[tag] ?? KEY_BY_TERM[tag] ?? null;

const CONCEPTS_BY_TERM = Object.fromEntries(Object.values(CLIMATE_CONCEPTS).map((c) => [c.term, c]));
const lookupConcept = (name) => CLIMATE_CONCEPTS[CONCEPT_ALIASES[name]] ?? CONCEPTS_BY_TERM[name] ?? null;

// 타임라인 설명 한 줄을 색 클래스가 붙은 <p>로 렌더링한다(강조/계열 분류 자체는
// explanationHighlight.jsx 공용 로직 - ItemResultModal도 같은 걸 쓴다).
function renderExplanationLine(line, key) {
  const family = causeFamilyOf(line);
  return (
    <p key={key} className={family ? `report-page__timeline-explain-line--${family}` : undefined}>
      {renderHighlightedParts(line)}
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
  const resetGame = useGameStore((state) => state.resetGame);
  const replayGame = useGameStore((state) => state.replayGame);
  // 여기서 다시 시작하는 사람은 이미 한 판을 끝낸 사람이라 온보딩을 띄우지 않는다
  // (행성 생성 화면·플레이 화면 둘 다. resetGame은 이 값을 건드리지 않으므로
  // 행성 만들기를 거쳐도 유지된다).
  const skipTutorials = useGameStore((state) => state.skipTutorials);

  const resultBanner = RESULT_BANNER_BY_REASON[gameOverReason] ?? {
    title: "행성 진단 결과",
    detail: "",
    statusClass: "",
  };
  
// 최종 결과 배너("최종 행성 상태" 등)에서 쓰는 마지막 타임라인 스냅샷.
  const final = timeline[timeline.length - 1] ?? null;
  const finalRuleState = final ? planetStateOf(final.physics.deltaEnergy, final.physics.currentTemperature) : null;

  // "핵심 개념 정리"에서 9개 전부가 아니라 이번 판에 실제로 나타난 개념만 고른다.
  const quizConceptKeys = useMemo(() => {
    const keys = new Set();
    quizLog.forEach((q) => {
      (q.concepts ?? []).forEach((tag) => {
        const key = conceptKeyOf(tag);
        if (key) keys.add(key);
      });
    });
    return keys;
  }, [quizLog]);

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

  const displayTimeline = useMemo(() => {
    const result = [];
    uniqueTimeline.forEach((entry) => {
      const last = result[result.length - 1];
      if (entry.stage === "최종" && last?.stage === "최종") {
        last.attempts += 1;
        last.label = entry.label;
        last.physics = entry.physics;
        last.ml = entry.ml;
      } else {
        result.push({ ...entry, attempts: entry.stage === "최종" ? 1 : undefined });
      }
    });
    return result;
  }, [uniqueTimeline]);

  const chartPoints = useMemo(
    () =>
      displayTimeline.map((entry, i) => ({
        index: i,
        stage: entry.stage,
        label:
          entry.stage === "최종" && entry.attempts > 1
            ? `최종 확인 완료 (${entry.attempts}회 시도)`
            : entry.label,
        temperature: entry.physics.currentTemperature,
        deltaEnergy: entry.physics.deltaEnergy,
        tone: labelTone(entry.ml?.label),
        mlLabel: entry.ml?.label ?? null,
        isItem: entry.stage === "아이템",
      })),
    [displayTimeline],
  );

  const [selectedStep, setSelectedStep] = useState(null);
  const activeStep = selectedStep ?? chartPoints.length - 1;
  const activePoint = chartPoints[activeStep] ?? null;

  // 선택된 지점 하나만 그때그때 계산한다(전체를 미리 계산해두지 않음) - 카드
  // 그리드였을 때처럼 모든 스텝의 설명을 항상 들고 있을 필요가 없다.
  const activeExplanation = useMemo(() => {
    if (!activePoint) return null;
    const entry = displayTimeline[activeStep];
    const prev = activeStep > 0 ? displayTimeline[activeStep - 1] : null;
    return prev
      ? describeTransition(prev.physics, entry.physics, entry.ml?.label, ITEM_KEY_BY_LABEL.get(entry.label))
      : deltaEnergyLines(entry.physics.deltaEnergy);
  }, [activeStep, activePoint, displayTimeline]);

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

    // 문제 목록에서 마우스를 올린 항목 - 그 문제가 다루는 개념 카드를 옆에서
  // 강조하기 위한 용도(클릭 선택과는 별개라 selectedGroupKey를 건드리지 않는다).
  const [hoveredQuizKey, setHoveredQuizKey] = useState(null);
  const hoveredConceptKeys = useMemo(() => {
    const group = hoveredQuizKey != null ? quizGroups.find((g) => g.key === hoveredQuizKey) : null;
    if (!group?.concepts) return new Set();
    return new Set(group.concepts.map(conceptKeyOf).filter(Boolean));
  }, [hoveredQuizKey, quizGroups]);

  const handleReplay = async () => {
    skipTutorials();
    await replayGame();
    navigate("/game");
  };

  const handleRestart = () => {
    skipTutorials();
    resetClimate();
    resetGame();
    navigate("/planet-create");
  };

  return (
    <div className="report-page">
      <div className="report-page__masthead">
        <span className="report-page__tag">MISSION REPORT</span>
        <h1 className="report-page__title">피드백 창</h1>
      </div>

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
            <span className="report-page__metric-label">에너지 불균형 판정</span>
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

      {/* 타임라인 그래프와 선택한 지점의 설명을 한 행에 나란히 - 그래프는 넓게,
          설명은 옆에 붙여서 클릭한 지점의 원인->과정->결과를 바로 옆에서 읽게 한다. */}
      <div className="report-page__timeline-row">
      {/* 행성 변화 타임라인: ΔE 추이 하나로 통합한 그래프 */}
      {/* 타임라인 그래프와 선택한 지점의 설명을 하나의 섹션으로 통합 -
          접기/펼치기를 같이 하도록 CollapsibleSection 하나로 감싼다. */}
      <CollapsibleSection title="행성 변화 타임라인">
        {chartPoints.length ? (
          <div className="report-page__timeline-row">
            <div className="report-page__timeline-chart-col">
              <p className="report-page__subtext">
                선을 따라가면 에너지가 어느 방향으로 움직였는지 한눈에 보입니다. 초록 띠는 평형 범위(±
                {ENERGY_BALANCE_EPSILON.toFixed(1)})를 나타내며, 띠 위쪽은 에너지 과다(온난화), 아래쪽은 에너지 부족(냉각)을 뜻합니다.
                점을 클릭하면 옆에 해당 지점의 원인과 결과가 표시됩니다.
              </p>
              <svg
                className="report-page__timeline-chart"
                viewBox={`0 0 ${CHART_W} ${CHART_H}`}
                role="img"
                aria-label="ΔE(에너지 불균형) 추이 그래프"
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
                      <text className="report-page__timeline-chart-emoji" y={-8}>
                        {p.label.split(" ")[0]}
                      </text>
                    )}
                  </g>
                ))}
              </svg>
            </div>

            <div className="report-page__timeline-detail-col">
              {activePoint ? (
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
              ) : (
                <p>그래프의 지점을 클릭하면 설명이 여기 표시됩니다.</p>
              )}
            </div>
          </div>
        ) : (
          <p>기록된 변화가 없습니다.</p>
        )}
      </CollapsibleSection>

      </div>

      <hr className="report-page__divider" />

      {/* 문제 풀이 결과 + 관련 개념 카드를 한 섹션으로 통합 - 접기/펼치기 공유.
          문제에 마우스를 올리면 그 문제가 다루는 개념 카드가 강조된다. */}
      <CollapsibleSection title="문제 풀이 결과">
        <p className="report-page__subtext">
          맞은 문제 <strong>{correctGroups.length}</strong>개 / 틀린 문제 <strong>{wrongGroups.length}</strong>개 — 문제를 클릭하면 해설을, 마우스를 올리면 관련 개념이 옆에서 강조됩니다.
        </p>

        <div className="report-page__quiz-concept-row">
          <div className="report-page__quiz-col">
            {quizGroups.length ? (
              <ul className="report-page__quiz-list">
                {quizGroups.map((g) => (
                  <li
                    key={g.key}
                    className={`report-page__quiz-item ${
                      g.correct ? "report-page__quiz-item--correct" : "report-page__quiz-item--wrong"
                    }`}
                    onClick={() => setSelectedGroupKey(g.key)}
                    onMouseEnter={() => setHoveredQuizKey(g.key)}
                    onMouseLeave={() => setHoveredQuizKey(null)}
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
          </div>

          <div className="report-page__concept-col">
            <div className="report-page__concept-grid">
              {Object.entries(CLIMATE_CONCEPTS)
                .filter(([key]) => quizConceptKeys.has(key))
                .map(([key, concept]) => (
                  <div
                    key={key}
                    className={`report-page__concept-card${
                      hoveredConceptKeys.has(key) ? " is-highlighted" : ""
                    }`}
                  >
                    <p className="report-page__concept-card-term">{concept.term}</p>
                    <p>{concept.detail}</p>
                  </div>
                ))}
            </div>
          </div>
        </div>
      </CollapsibleSection>

      {/* 문제 해설 모달 - CollapsibleSection 밖에 둔다. 접기/펼치기와는 무관한
          화면 전체 오버레이라 콘텐츠 트리 안에 있으면 안 된다. */}
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