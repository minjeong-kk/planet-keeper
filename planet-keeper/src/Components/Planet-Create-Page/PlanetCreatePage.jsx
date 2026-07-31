import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Waves, Snowflake, Cloud, Wind, Factory } from "lucide-react";
import PlanetUI from "../Planet-ui.jsx";
import "./PlanetCreatePage.css";

const VARIABLES = [
  { key: "ocean", label: "바다 수위", Icon: Waves, unit: "%" },
  { key: "iceThickness", label: "빙하 면적", Icon: Snowflake, unit: "%" },
  { key: "cloud", label: "구름 양", Icon: Cloud, unit: "%" },
  { key: "atmThickness", label: "대기 두께", Icon: Wind, unit: "%" },
  { key: "co2", label: "CO₂ 농도", Icon: Factory, unit: "ppm" },
];

// 아름다운 지구 첫인상을 주는 기본 세팅
const INITIAL_VALUES = {
  ocean: 50,
  iceThickness: 20,
  cloud: 30,
  atmThickness: 50,
  co2: 20,
};

const s01 = (v) => Math.min(1, Math.max(0, (v ?? 0) / 100)); // 0~100 → 0~1

// CO₂ 슬라이더(%) → 실제 ppm (physicsEngine 매핑과 동일: 432 * (0.3 ~ 3.0))
const co2Ppm = (v) => Math.round(432 * (0.3 + s01(v) * 2.7));

/** 슬라이더 값을 PlanetUI 의 물리 요소별 3D props 로 매핑 */
function slidersToVisual(sliders) {
  return {
    oceanRatio: s01(sliders.ocean),
    glacierRatio: s01(sliders.iceThickness),
    cloudRatio: s01(sliders.cloud),
    co2Level: s01(sliders.co2),
    atmosphereScale: 1.05 + s01(sliders.atmThickness) * 0.4,
  };
}

function PlanetCreatePage() {
  const navigate = useNavigate();
  const [values, setValues] = useState(INITIAL_VALUES);
  const [activeKey, setActiveKey] = useState("ocean");

  const visual = slidersToVisual(values);

  const handleChange = (key, value) =>
    setValues((prev) => ({ ...prev, [key]: value }));

  // 대시보드 수치 표시(단위 포함). CO₂ 는 실제 ppm 으로 환산해 보여준다.
  const displayValue = (v) =>
    v.key === "co2" ? `${co2Ppm(values.co2)} ${v.unit}` : `${values[v.key]}${v.unit}`;

  return (
    <>
      <div className="planet-create-page">
        <div className="planet-create-page__planet">
          <div className="planet-create-page__planet-placeholder">
            <PlanetUI {...visual} />
          </div>
        </div>

        <div className="planet-create-page__controls">
          {/* ── 타이틀 영역 ── */}
          <div className="planet-create-page__titlebar">
            <span className="planet-create-page__step">
              STEP 01 · PLANET INITIALIZATION
            </span>
            <h2 className="planet-create-page__title">
              <span className="planet-create-page__title-accent" />
              나만의 행성 만들기
            </h2>
          </div>

          {/* ── 슬라이더 컨트롤 ── */}
          <div className="planet-create-page__sliders">
            {VARIABLES.map((v) => {
              const Icon = v.Icon;
              const active = v.key === activeKey;
              return (
                <div
                  key={v.key}
                  className={
                    "planet-create-page__control" + (active ? " is-active" : "")
                  }
                >
                  <div className="planet-create-page__control-header">
                    <label
                      htmlFor={v.key}
                      className="planet-create-page__control-label"
                    >
                      <Icon size={16} aria-hidden className="planet-create-page__control-icon" />
                      {v.label}
                    </label>
                    <span className="planet-create-page__control-value">
                      {displayValue(v)}
                    </span>
                  </div>
                  <input
                    id={v.key}
                    className="planet-create-page__slider"
                    type="range"
                    min={0}
                    max={100}
                    value={values[v.key]}
                    style={{ "--fill": `${values[v.key]}%` }}
                    onFocus={() => setActiveKey(v.key)}
                    onChange={(e) => handleChange(v.key, Number(e.target.value))}
                  />
                </div>
              );
            })}
          </div>

          {/* ── 하단 아이콘 탭바 (글래스모피즘 · 활성 네온 · 호버 툴팁) ── */}
          <div className="planet-create-page__tabbar" role="tablist">
            {VARIABLES.map((v) => {
              const Icon = v.Icon;
              const active = v.key === activeKey;
              return (
                <button
                  key={v.key}
                  type="button"
                  role="tab"
                  aria-selected={active}
                  aria-label={v.label}
                  data-label={v.label}
                  className={
                    "planet-create-page__tab" + (active ? " is-active" : "")
                  }
                  onClick={() => {
                    setActiveKey(v.key);
                    document.getElementById(v.key)?.focus();
                  }}
                >
                  <Icon size={20} aria-hidden />
                </button>
              );
            })}
          </div>
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
