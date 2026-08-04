import { analyzePlanetState } from "../../utils/planetAnalysis.js";

// 오른쪽 정보 패널. physicsResult/mlResult는 useGameStore가 매 단계(초기 생성,
// 아이템 사용) 실제 Physics Engine/AI로 채워준다 - 아직 아무것도 계산 전이면 null.
// 순수 Physics 수치(온도/ΔE/알베도 등)는 행성 위 stats-bar로 옮겨졌고, 여기는
// 그 수치를 해석한 요약(Planet Summary)과 ML 판정만 보여준다.
function InfoPanel({ physicsResult, mlResult, co2Ppm, atmThickness }) {
  const analysis = analyzePlanetState({ physicsResult, mlResult, co2Ppm, atmThickness });

  return (
    <div className="game-page__side-box game-page__info-panel">
      <section>
        <h3>Planet Summary</h3>
        {analysis ? (
          <>
            {analysis.sections.map((sec, i) => (
              <div key={i} className="game-page__summary-block">
                {sec.title && <p className="game-page__summary-title">{sec.title}</p>}
                {sec.lines.map((line, j) => (
                  <p key={j}>{line}</p>
                ))}
              </div>
            ))}
          </>
        ) : (
          <p>아직 행성 상태를 계산하지 않았습니다.</p>
        )}
      </section>

      <hr />

      <section>
        <h3>ML Prediction</h3>
        <p>Label: {mlResult ? mlResult.label : "-"}</p>
        {/* TODO: predictClimateState()가 확률(confidence)까지 반환하도록 확장되면 여기 연결 */}
        <p>Confidence: {mlResult?.confidence != null ? `${Math.round(mlResult.confidence * 100)}%` : "-"}</p>
      </section>
    </div>
  );
}

export default InfoPanel;
