import { useMemo } from "react";
import { analyzePlanetState, deltaEnergyLines, labelTone } from "../../utils/planetAnalysis.js";
import { ENERGY_BALANCE_EPSILON } from "../../utils/physicsEngine.js";

// 오른쪽 정보 패널. physicsResult/mlResult는 useGameStore가 매 단계(초기 생성,
// 아이템 사용) 실제 Physics Engine으로 채워준다 - 아직 아무것도 계산 전이면 null.
// 순수 Physics 수치(온도/ΔE/알베도 등)는 행성 위 stats-bar로 옮겨졌고, 여기는
// 그 수치를 해석한 요약(Planet Summary)과 상태 판정만 보여준다. 상태 판정이 가장
// 먼저 봐야 할 정보라 맨 위에 두고, 그 판정을 왜 그렇게 봤는지 설명하는 수치
// 해석 문구를 같은 섹션에 붙여 보여준다(현재 상태 설명 + 판정을 한 곳에서).
function InfoPanel({ physicsResult, mlResult, co2Ppm, atmThickness }) {
  // GamePage가 1초마다 elapsedSeconds로 리렌더될 때도 physicsResult/mlResult/
  // co2Ppm/atmThickness가 그대로면 원인 분석을 다시 만들지 않는다.
  const analysis = useMemo(
    () => analyzePlanetState({ physicsResult, mlResult, co2Ppm, atmThickness }),
    [physicsResult, mlResult, co2Ppm, atmThickness],
  );

  return (
    <div className="game-page__side-box game-page__info-panel">
      {/* 1. 행성 상태 판정 섹션 (현재 상태 해석 문구 포함) */}
      <section className="info-panel__section">
        <h3 className="info-panel__title">🪐 행성 상태 판정</h3>
        <div className="info-panel__ml-card">
          <div className="info-panel__ml-row">
            <span className="info-panel__label">State:</span>
            <span className={`info-panel__badge info-panel__badge--${labelTone(mlResult?.label)}`}>
              {mlResult ? mlResult.label : "대기 중..."}
            </span>
          </div>
          {physicsResult && (
            <>
              <p className="game-page__stats-note">
                💡 {deltaEnergyLines(physicsResult.deltaEnergy)?.[1]}
              </p>
              {/* 판정 기준을 |ΔE| ≤ epsilon 으로 통일한다. 예전에는 "평형온도와의
                  온도차 0.5K 이내"라는 별도 기준을 썼는데, epsilon은 온도로 환산하면
                  약 5.4K라 10배 이상 엄격했다. 그래서 상태 배지가 Stable이고 ΔE 카드가
                  초록인데 이 문장만 "아직 도달하지 않았다"고 말하는 모순이 있었다. */}
              <p className="game-page__stats-note">
                📍 현재 평균 온도는 예상 안정 온도를 향해 이동합니다.{" "}
                <strong>
                  {Math.abs(physicsResult.deltaEnergy) <= ENERGY_BALANCE_EPSILON
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