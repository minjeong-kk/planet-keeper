import { SOLAR_CONSTANT } from "../../utils/physicsEngine.js";

// mlResult.label(climateClassifier.js STATE_LABELS와 동일한 문자열)에 따라
// 자동으로 바뀌는 행성 한줄 설명.
const PLANET_SUMMARY_BY_LABEL = {
  "Earth-like Stable": "현재 행성은 지구와 유사한 안정 상태입니다.",
  "Warm Stable": "현재 행성은 다소 높은 온도에서 안정적으로 유지되고 있습니다.",
  "Cold Stable": "현재 행성은 낮은 온도지만 안정적인 기후를 유지하고 있습니다.",
  "Energy Surplus": "현재 행성은 과도한 에너지로 인해 온도가 계속 상승하고 있습니다.",
  "Energy Deficit": "현재 행성은 에너지 부족으로 지속적인 냉각이 발생하고 있습니다.",
};

const fmt = (value, digits = 2) => (value == null ? "-" : value.toFixed(digits));

// 오른쪽 정보 패널. physicsResult/mlResult는 useGameStore가 아이템 사용 후
// 실제 Physics Engine/ML로 채워준다 - 그 전(문제1 단계)에는 null이라 "-"로 표시.
function InfoPanel({ physicsResult, mlResult, co2Ppm, atmThickness }) {
  const summary = mlResult
    ? PLANET_SUMMARY_BY_LABEL[mlResult.label] ?? "행성 상태를 판단할 수 없습니다."
    : "아직 행성 상태를 계산하지 않았습니다.";

  return (
    <div className="game-page__side-box game-page__info-panel">
      <section>
        <h3>Planet Summary</h3>
        <p>{summary}</p>
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
