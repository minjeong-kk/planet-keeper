import { useState, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import useClimateStore from "../../store/useClimateStore";
import useGameStore from "../../store/useGameStore";
import { PLANET_STATES, planetStateOf } from "../../utils/physicsEngine.js";
import { describeTransition, deltaEnergyLines, formatSigned, relevantConceptKeys, labelTone } from "../../utils/planetAnalysis.js";
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

// gameOverReason별 결과 배너. 성공 조건은 오직 "planet_stabilized"(Earth-like
// Stable 도달) 하나뿐이다 - Warm/Cold Stable, Energy Surplus/Deficit는 클리어가 아니다.
const RESULT_BANNER_BY_REASON = {
  planet_stabilized: {
    title: "🎉 미션 성공 - 행성 평형 안정 도달",
    detail: "최종 확인 결과 행성이 지구형 안정(Earth-like Stable) 상태에 도달해 게임을 성공적으로 마쳤습니다.",
    statusClass: "report-page__banner--success",
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

  // 원인->과정->결과 설명이 완전히 같은 단계(똑같은 방향의 아이템을 여러 번 쓴
  // 경우 등)는 설명을 반복해서 보여주지 않고 하나로 묶는다 - 숫자만 다르고
  // 문장이 같은 설명 박스가 줄줄이 나오는 걸 막는다.
  const timelineGroups = useMemo(() => {
    const groups = [];
    const bySignature = new Map();
    uniqueTimeline.forEach((entry, i) => {
      const prev = i > 0 ? uniqueTimeline[i - 1] : null;
      const explanation = prev
        ? describeTransition(prev.physics, entry.physics, entry.ml?.label, ITEM_KEY_BY_LABEL.get(entry.label))
        : deltaEnergyLines(entry.physics.deltaEnergy);
      const signature = `${entry.stage}::${explanation.join("|").replace(/[-+]?\d+(\.\d+)?/g, "#")}`;
      const existing = bySignature.get(signature);
      if (existing) {
        existing.entries.push(entry);
      } else {
        const group = { stage: entry.stage, explanation, entries: [entry] };
        bySignature.set(signature, group);
        groups.push(group);
      }
    });
    return groups;
  }, [uniqueTimeline]);

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
            {formatSigned(final.physics.deltaEnergy, 2)} W/m² · 알베도 {fmt(final.physics.albedo)} · 온실효과{" "}
            {fmt(final.physics.greenhouseStrength)}
          </p>
        )}
      </div>

      <hr className="report-page__divider" />

      {/* 행성 변화 타임라인: 가로 2열 컴팩트 카드 그리드 방식 */}
      <CollapsibleSection title="행성 변화 타임라인">
        {timelineGroups.length ? (
          <div className="report-page__timeline-grid">
            {timelineGroups.map((group, i) => (
              <div key={i} className="report-page__timeline-card">
                <div className="report-page__timeline-card-header">
                  <span className="report-page__timeline-step-tag">Step {i + 1}</span>
                  <span className="report-page__timeline-stage">{group.stage}</span>
                  <div className="report-page__timeline-chips">
                    {group.entries.map((e, idx) => (
                      <span key={idx} className="report-page__timeline-chip">
                        {e.label}
                      </span>
                    ))}
                  </div>
                </div>

                <div className="report-page__timeline-explain">
                  {group.explanation.map((line, j) => (
                    <p key={j}>{line}</p>
                  ))}
                </div>

                <div className="report-page__timeline-metrics">
                  {group.entries.map((e, idx) => (
                    <span key={idx} className="report-page__metric-badge">
                      🌡️ {e.physics.currentTemperature.toFixed(1)}K · ΔE {formatSigned(e.physics.deltaEnergy)} ·{" "}
                      <span className={`report-page__metric-badge-label report-page__metric-badge-label--${labelTone(e.ml?.label)}`}>
                        {e.ml?.label ?? "-"}
                      </span>
                    </span>
                  ))}
                </div>
              </div>
            ))}
          </div>
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