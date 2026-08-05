import { useState } from "react";
import { useNavigate } from "react-router-dom";
import useClimateStore from "../../store/useClimateStore";
import useGameStore from "../../store/useGameStore";
import { PLANET_STATES, planetStateOf } from "../../utils/physicsEngine.js";
import { describeTransition, deltaEnergyLines } from "../../utils/planetAnalysis.js";
import { CLIMATE_CONCEPTS } from "../../data/climateConcepts.js";
import "./ReportPage.css";

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
  },
  life_over: {
    title: "💔 미션 실패 - 목숨 소진",
    detail: "오답이 3회 누적되어 행성을 안정시키지 못한 채 게임이 종료됐습니다.",
  },
};

const KOREAN_BY_STATE = Object.fromEntries(PLANET_STATES.map(({ state, korean }) => [state, korean]));

const fmt = (value, digits = 2) => (value == null ? "-" : value.toFixed(digits));

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
  };

  // timeline[0]=행성 생성 시점, 마지막=최종 상태. 정상 플레이라면 항상 최소 1개는
  // 있지만(nextProblem이 "초기"를 채운다), 방어적으로 없을 때도 깨지지 않게 한다.
  const initial = timeline[0] ?? null;
  const final = timeline[timeline.length - 1] ?? null;
  const finalRuleState = final ? planetStateOf(final.physics.deltaEnergy, final.physics.currentTemperature) : null;

  const correctLog = quizLog.filter((q) => q.correct);
  const wrongLog = quizLog.filter((q) => !q.correct);

  // "문제 풀이 결과" 목록에서 클릭한 문제 - 인덱스로 저장해서 클릭할 때마다 다시
  // 최신 quizLog를 참조한다(값 자체를 복사해두지 않음).
  const [selectedQuizIndex, setSelectedQuizIndex] = useState(null);
  const selectedQuiz = selectedQuizIndex != null ? quizLog[selectedQuizIndex] : null;

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

      {/* 최종 결과 */}
      <div className="report-page__section">
        <h2>{resultBanner.title}</h2>
        {resultBanner.detail && <p>{resultBanner.detail}</p>}
        <p>⏱️ 총 걸린 시간: {elapsedSeconds}초</p>
      </div>

      <hr className="report-page__divider" />

      {/* 최종 행성 상태 / ML 분류 결과 */}
      <div className="report-page__section">
        <h3>최종 행성 상태</h3>
        <p>{final ? `${KOREAN_BY_STATE[finalRuleState]} (물리엔진 규칙 판정)` : "-"}</p>
        <h3>ML 분류 결과</h3>
        <p>{final?.ml ? `${final.ml.label}${final.ml.confidence != null ? ` (확신도 ${Math.round(final.ml.confidence * 100)}%)` : ""}` : "-"}</p>
      </div>

      <hr className="report-page__divider" />

      {/* 행성 변화 타임라인: 초기 → 아이템 → 최종 */}
      <div className="report-page__section">
        <h3>행성 변화 타임라인</h3>
        {timeline.length ? (
          <ol className="report-page__timeline">
            {timeline.map((entry, i) => {
              const prev = i > 0 ? timeline[i - 1] : null;
              // 왜 이렇게 됐는지: 이전 단계와 비교해서 원인 -> 과정 -> 결과 순서로 설명한다.
              // 첫 단계(행성 생성)는 비교할 이전 값이 없으니 ΔE 방향 설명만 보여준다.
              const explanation = prev
                ? describeTransition(prev.physics, entry.physics, entry.ml?.label)
                : deltaEnergyLines(entry.physics.deltaEnergy);
              return (
                <li key={i} className="report-page__timeline-item">
                  <span className="report-page__timeline-stage">{entry.stage}</span>
                  <span className="report-page__timeline-label">{entry.label}</span>
                  <span>
                    {entry.physics.currentTemperature.toFixed(1)}K · ΔE {entry.physics.deltaEnergy >= 0 ? "+" : ""}
                    {entry.physics.deltaEnergy.toFixed(1)} · {entry.ml?.label ?? "-"}
                  </span>
                  <div className="report-page__timeline-explain">
                    {explanation.map((line, j) => (
                      <p key={j}>{line}</p>
                    ))}
                  </div>
                </li>
              );
            })}
          </ol>
        ) : (
          <p>기록된 변화가 없습니다.</p>
        )}
      </div>

      <hr className="report-page__divider" />

      {/* 초기 / 최종 물리값 비교 */}
      <div className="report-page__section">
        <h3>초기 / 최종 물리값 비교</h3>
        {initial && final ? (
          <table className="report-page__compare-table">
            <thead>
              <tr>
                <th></th>
                <th>초기</th>
                <th>최종</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td>평균 온도</td>
                <td>{fmt(initial.physics.currentTemperature, 1)} K</td>
                <td>{fmt(final.physics.currentTemperature, 1)} K</td>
              </tr>
              <tr>
                <td>ΔEnergy</td>
                <td>{fmt(initial.physics.deltaEnergy)} W/m²</td>
                <td>{fmt(final.physics.deltaEnergy)} W/m²</td>
              </tr>
              <tr>
                <td>알베도</td>
                <td>{fmt(initial.physics.albedo)}</td>
                <td>{fmt(final.physics.albedo)}</td>
              </tr>
              <tr>
                <td>온실효과</td>
                <td>{fmt(initial.physics.greenhouseStrength)}</td>
                <td>{fmt(final.physics.greenhouseStrength)}</td>
              </tr>
            </tbody>
          </table>
        ) : (
          <p>비교할 데이터가 없습니다.</p>
        )}
      </div>

      <hr className="report-page__divider" />

      {/* 문제 풀이 결과 */}
      <div className="report-page__section">
        <h3>문제 풀이 결과</h3>
        <p>
          맞은 문제 {correctLog.length}개 / 틀린 문제 {wrongLog.length}개 — 문제를 클릭하면 해설을 볼 수 있습니다.
        </p>

        {quizLog.length ? (
          <ul className="report-page__quiz-list">
            {quizLog.map((q, i) => (
              <li
                key={i}
                className={`report-page__quiz-item ${
                  q.correct ? "report-page__quiz-item--correct" : "report-page__quiz-item--wrong"
                }`}
                onClick={() => setSelectedQuizIndex(i)}
              >
                <span className="report-page__quiz-mark">{q.correct ? "✓" : "✗"}</span>
                <span className="report-page__quiz-title">{q.title}</span>
                {q.isRetry && <span className="report-page__quiz-retry-badge">재도전 문제</span>}
              </li>
            ))}
          </ul>
        ) : (
          <p>푼 문제가 없습니다.</p>
        )}
      </div>

      {selectedQuiz && (
        <div className="report-page__modal-overlay" onClick={() => setSelectedQuizIndex(null)}>
          <div className="report-page__modal" onClick={(e) => e.stopPropagation()}>
            <p className="report-page__modal-question">{selectedQuiz.title}</p>
            <p>내 답: {selectedQuiz.selectedAnswer}</p>
            <p>정답: {selectedQuiz.correctAnswer}</p>
            <hr className="report-page__divider" />
            {selectedQuiz.explanation && (
              <>
                <h4>해설</h4>
                <p>{selectedQuiz.explanation}</p>
              </>
            )}
            {selectedQuiz.concepts?.length > 0 && (
              <>
                <h4>관련 개념</h4>
                <ul className="report-page__concept-list">
                  {selectedQuiz.concepts.map((concept) => {
                    const matched = lookupConcept(concept);
                    return (
                      <li key={concept}>
                        <strong>{concept}</strong>
                        {matched && <span> — {matched.detail}</span>}
                      </li>
                    );
                  })}
                </ul>
              </>
            )}
            <button onClick={() => setSelectedQuizIndex(null)}>닫기</button>
          </div>
        </div>
      )}

      <hr className="report-page__divider" />

      {/* 사용한 아이템 */}
      <div className="report-page__section">
        <h3>사용한 아이템</h3>
        <p>{inventory.length ? inventory.join(", ") : "없음"}</p>
      </div>

      <hr className="report-page__divider" />

      {/* 교과 개념 정리 - 지구과학Ⅰ 수준으로 핵심 개념만 짧게 다시 정리한다. */}
      <div className="report-page__section">
        <h3>핵심 개념 정리</h3>
        <div className="report-page__concept-grid">
          {Object.values(CLIMATE_CONCEPTS).map((concept) => (
            <div key={concept.term} className="report-page__concept-card">
              <p className="report-page__concept-card-term">{concept.term}</p>
              <p>{concept.detail}</p>
            </div>
          ))}
        </div>
      </div>

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
