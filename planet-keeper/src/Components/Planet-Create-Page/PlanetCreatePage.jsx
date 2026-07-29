import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import PlanetUI from "../Planet-ui.jsx";
import {
  computeClimate,
  mapSlidersToClimateInputs,
} from "../../utils/physicsEngine";
import "./PlanetCreatePage.css";

const VARIABLES = [
  { key: "iceThickness", label: "빙하 두께" },
  { key: "ocean", label: "바다" },
  { key: "cloud", label: "구름 양" },
  { key: "atmThickness", label: "대기 두께" },
  { key: "co2", label: "CO2" },
];

const s01 = (v) => Math.min(1, Math.max(0, (v ?? 0) / 100)); // 슬라이더 0~100 → 0~1

/**
 * 슬라이더 값을 PlanetUI 의 물리 요소별 3D 레이어 props 로 매핑한다.
 * (물리 엔진은 순수 계산만 담당, 시각 레이어 매핑은 UI 계층인 여기서 수행)
 */
function slidersToVisual(sliders) {
  return {
    oceanRatio: s01(sliders.ocean), // 바다 셸 상승/침수
    glacierRatio: s01(sliders.iceThickness), // 극지 빙하 캡 확장
    cloudRatio: s01(sliders.cloud), // 구름 밀도
    co2Level: s01(sliders.co2), // CO₂ 열기 글로우/아지랑이
    atmosphereScale: 1.05 + s01(sliders.atmThickness) * 0.4, // 대기 두께 → glow 스케일
  };
}

function PlanetCreatePage() {
  const navigate = useNavigate();
  const [values, setValues] = useState(
    Object.fromEntries(VARIABLES.map((v) => [v.key, 50]))
  );

  // 슬라이더 → 물리 엔진 → 시각 속성 (값이 바뀔 때만 재계산)
  const climate = useMemo(
    () => computeClimate(mapSlidersToClimateInputs(values)),
    [values]
  );
  const visual = useMemo(() => slidersToVisual(values), [values]);

  const handleChange = (key, value) => {
    setValues((prev) => ({ ...prev, [key]: value }));
  };

  return (
    <>
      <div className="planet-create-page">
        <div className="planet-create-page__planet">
          <div className="planet-create-page__planet-placeholder">
            <PlanetUI {...visual} />
          </div>
        </div>

        <div className="planet-create-page__controls">
          <p>변수 조작은 드래그 형식</p>

          <div className="planet-create-page__readout">
            <span>예상 평균 기온: {climate.temperatureC.toFixed(1)}°C</span>
            <span>알베도(반사율): {climate.albedo.toFixed(2)}</span>
            <span>흡수 복사에너지: {climate.absorbedRadiation.toFixed(1)}</span>
          </div>

          {VARIABLES.map((v) => (
            <div className="planet-create-page__control" key={v.key}>
              <label htmlFor={v.key}>{v.label}</label>
              <input
                id={v.key}
                type="range"
                min={0}
                max={100}
                value={values[v.key]}
                onChange={(e) => handleChange(v.key, Number(e.target.value))}
              />
            </div>
          ))}
        </div>
      </div>

      <div className="planet-create-page__actions">
        <button onClick={() => navigate("/")}>맨 처음 페이지로 가기</button>
        <button className="btn-primary" onClick={() => navigate("/game")}>
          행성 만들기 완료
        </button>
      </div>
    </>
  );
}

export default PlanetCreatePage;
