import { useNavigate } from "react-router-dom";
import { Waves, Snowflake, Cloud, Wind, Factory } from "lucide-react";
import PlanetUI from "../Planet-ui.jsx";
import {
  useClimate,
  slidersToVisual,
  co2Ppm,
} from "../../store/ClimateContext.jsx";
import "./PlanetCreatePage.css";

const VARIABLES = [
  { key: "ocean", label: "바다 수위", Icon: Waves, unit: "%" },
  { key: "iceThickness", label: "빙하 면적", Icon: Snowflake, unit: "%" },
  { key: "cloud", label: "구름 양", Icon: Cloud, unit: "%" },
  { key: "atmThickness", label: "대기 두께", Icon: Wind, unit: "%" },
  { key: "co2", label: "CO₂ 농도", Icon: Factory, unit: "ppm" },
];

function PlanetCreatePage() {
  const navigate = useNavigate();
  const { values, setValue } = useClimate();

  const visual = slidersToVisual(values);

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
              return (
                <div key={v.key} className="planet-create-page__control">
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
                    onChange={(e) => setValue(v.key, Number(e.target.value))}
                  />
                </div>
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
