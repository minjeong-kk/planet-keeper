import { useMemo } from "react";
import { analyzePlanetState, deltaEnergyLines } from "../../utils/planetAnalysis.js";
import { equilibriumTemperatureOf } from "../../utils/physicsEngine.js";

// 오른쪽 정보 패널. physicsResult/mlResult는 useGameStore가 매 단계(초기 생성,
// 아이템 사용) 실제 Physics Engine/AI로 채워준다 - 아직 아무것도 계산 전이면 null.
// 순수 Physics 수치(온도/ΔE/알베도 등)는 행성 위 stats-bar로 옮겨졌고, 여기는
// 그 수치를 해석한 요약(Planet Summary)과 ML 판정만 보여준다. ML 판정이 가장
// 먼저 봐야 할 정보라 맨 위에 두고, 그 판정을 왜 그렇게 봤는지 설명하는 수치
// 해석 문구를 같은 섹션에 붙여 보여준다(현재 상태 설명 + ML 예측을 한 곳에서).
function InfoPanel({ physicsResult, mlResult, co2Ppm, atmThickness }) {
  // GamePage가 1초마다 elapsedSeconds로 리렌더될 때도 physicsResult/mlResult/
  // co2Ppm/atmThickness가 그대로면 원인 분석을 다시 만들지 않는다.
  const analysis = useMemo(
    () => analyzePlanetState({ physicsResult, mlResult, co2Ppm, atmThickness }),
    [physicsResult, mlResult, co2Ppm, atmThickness],
  );

  return (
    <div className="game-page__side-box game-page__info-panel">
      {/* 1. ML Prediction 섹션 (현재 상태 해석 문구 포함) */}
      <section className="info-panel__section">
        <h3 className="info-panel__title">🤖 ML Prediction</h3>
        <div className="info-panel__ml-card">
          <div className="info-panel__ml-row">
            <span className="info-panel__label">State:</span>
            <span className="info-panel__badge">
              {mlResult ? mlResult.label : "대기 중..."}
            </span>
          </div>
          <div className="info-panel__ml-row">
            <span className="info-panel__label">Confidence:</span>
            <span className="info-panel__value">
              {mlResult?.confidence != null ? `${Math.round(mlResult.confidence * 100)}%` : "-"}
            </span>
          </div>
          {physicsResult && (
            <>
              <p className="game-page__stats-note">
                💡 {deltaEnergyLines(physicsResult.deltaEnergy)?.[1]}
              </p>
              <p className="game-page__stats-note">
                📍 현재 평균 온도는 예상 안정 온도를 향해 이동합니다.{" "}
                <strong>
                  {Math.abs(physicsResult.currentTemperature - equilibriumTemperatureOf(physicsResult)) < 0.5
                    ? "현재 안정 상태에 도달했습니다."
                    : "아직 안정 상태에 도달하지 않았습니다."}
                </strong>
              </p>
            </>
          )}
        </div>
      </section>

      <hr className="info-panel__divider" />

      {/* 2. Planet Summary 섹션 */}
      <section className="info-panel__section">
        <h3 className="info-panel__title">🌐 Planet Summary</h3>
        {analysis ? (
          <div className="info-panel__summary-container">
            {analysis.sections.map((sec, i) => (
              <div key={i} className="game-page__summary-block">
                {sec.title && <p className="game-page__summary-title">{sec.title}</p>}
                <ul className="game-page__summary-list">
                  {sec.lines.map((line, j) => (
                    <li key={j}>{line}</li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        ) : (
          <p className="info-panel__placeholder">아직 행성 상태를 계산하지 않았습니다.</p>
        )}
      </section>
    </div>
  );
}

export default InfoPanel;