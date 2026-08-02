import { SOLAR_CONSTANT } from "../../utils/physicsEngine.js";
import { analyzePlanetState } from "../../utils/planetAnalysis.js";

const fmt = (value, digits = 2) => (value == null ? "-" : value.toFixed(digits));

// 오른쪽 정보 패널. physicsResult/mlResult는 useGameStore가 매 단계(초기 생성,
// 아이템 사용) 실제 Physics Engine/AI로 채워준다 - 아직 아무것도 계산 전이면 null.
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

      <hr />

      <section>
        <h3>Physics Result</h3>
        <p>Temperature: {physicsResult ? `${fmt(physicsResult.currentTemperature, 1)} K` : "-"}</p>
        <p>Delta Energy: {physicsResult ? `${fmt(physicsResult.deltaEnergy)} W/m²` : "-"}</p>
        <p>Incoming Radiation: {SOLAR_CONSTANT}</p>
        <p>Outgoing Radiation: {fmt(physicsResult?.outgoingRadiation)}</p>
        <p>Absorbed Radiation: {fmt(physicsResult?.absorbedRadiation)}</p>
        <p>Albedo: {fmt(physicsResult?.albedo)}</p>
        <p>Greenhouse Strength: {fmt(physicsResult?.greenhouseStrength)}</p>
        <p>CO₂: {co2Ppm.toFixed(0)} ppm</p>
        <p>Atmosphere Thickness: {atmThickness.toFixed(2)}</p>
      </section>
    </div>
  );
}

export default InfoPanel;
