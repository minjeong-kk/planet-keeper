import Term from "../common/Term.jsx";
import { ENERGY_BALANCE_EPSILON } from "../../utils/physicsEngine.js";
import { CLIMATE_CONCEPTS } from "../../data/climateConcepts.js";

// 왼쪽 패널 위쪽의 "행성 상태" 계기판 - 지금 행성의 핵심 수치만 한눈에 읽히도록
// 한 줄에 하나씩 크게 보여준다. 상태 판정과 그 원인/해결 방향은 오른쪽
// PlanetDiagnosis가 담당한다(여기서 문장까지 늘어놓으면 예전처럼 학습지가 된다).
//
// physicsResult는 useGameStore가 매 단계(초기 생성, 아이템 사용, 최종 확인,
// 이상기후)에 실제 Physics Engine으로 채워준다 - 아직 아무것도 계산 전이면 null.
// 용어에는 <Term>을 달아 두어 교과 개념 설명이 툴팁으로만 따라오게 한다.
function InfoPanel({ physicsResult, co2Ppm }) {
  const rows = physicsResult
    ? [
        {
          icon: "🌡",
          label: <Term concept={CLIMATE_CONCEPTS.currentTemperature}>행성 온도</Term>,
          value: `${physicsResult.currentTemperature.toFixed(1)} K`,
        },
        {
          icon: "⚡",
          label: <Term concept={CLIMATE_CONCEPTS.deltaEnergy}>에너지 불균형</Term>,
          value: `${physicsResult.deltaEnergy >= 0 ? "+" : ""}${physicsResult.deltaEnergy.toFixed(1)} W/m²`,
          ok: Math.abs(physicsResult.deltaEnergy) <= ENERGY_BALANCE_EPSILON,
        },
        {
          icon: "☁",
          label: <Term concept={CLIMATE_CONCEPTS.earthBaseline}>대기 조성</Term>,
          value: `CO₂ ${Math.round(co2Ppm)} ppm`,
        },
        {
          icon: "◐",
          label: <Term concept={CLIMATE_CONCEPTS.albedo}>알베도</Term>,
          value: physicsResult.albedo.toFixed(2),
        },
        {
          icon: "♨",
          label: <Term concept={CLIMATE_CONCEPTS.greenhouseEffect}>온실효과</Term>,
          value: physicsResult.greenhouseStrength.toFixed(2),
        },
      ]
    : [];

  return (
    <section className="panel panel--status" data-tour="status">
      <header className="panel__head">
        <h2 className="panel__title">행성 상태</h2>
      </header>

      {physicsResult ? (
        <ul className="status-list">
          {rows.map((row, i) => (
            <li key={i} className="status-row">
              <span className="status-row__icon" aria-hidden="true">
                {row.icon}
              </span>
              <span className="status-row__label">{row.label}</span>
              <span className={`status-row__value${row.ok ? " status-row__value--ok" : ""}`}>{row.value}</span>
            </li>
          ))}
        </ul>
      ) : (
        <p className="panel__placeholder">아직 행성 상태를 계산하지 않았습니다.</p>
      )}
    </section>
  );
}

export default InfoPanel;
