import { useNavigate } from "react-router-dom";
import { Waves, Snowflake, Cloud, Wind, Factory } from "lucide-react";
import PlanetUI from "../Planet-ui.jsx";
import useClimateStore, { CLIMATE_VARIABLES } from "../../store/useClimateStore";
import { slidersToVisual, co2Ppm } from "../../utils/climateVisual.js";
import "./PlanetCreatePage.css";

// label은 CLIMATE_VARIABLES(store)가 원본 - GamePage/ReportPage와 항상 같은 문구를 쓴다.
// 여기 순서(바다 먼저)만 표시 순서로 별도 유지.
const VARIABLE_ICONS = [
  { key: "ocean", Icon: Waves, unit: "%" },
  { key: "iceThickness", Icon: Snowflake, unit: "%" },
  { key: "cloud", Icon: Cloud, unit: "%" },
  { key: "atmThickness", Icon: Wind, unit: "%" },
  { key: "co2", Icon: Factory, unit: "ppm" },
];
const LABEL_BY_KEY = Object.fromEntries(CLIMATE_VARIABLES.map((v) => [v.key, v.label]));
const VARIABLES = VARIABLE_ICONS.map((v) => ({ ...v, label: LABEL_BY_KEY[v.key] }));

// 첫 로드 시 '아름다운 지구' 기본값으로 초기화. (공유 store 기본은 all-50 이지만,
// store 파일은 팀원과 바이트 동일하게 유지하고 초기값은 여기서만 override → store 충돌 방지)
useClimateStore.setState({
  values: { ocean: 50, iceThickness: 20, cloud: 30, atmThickness: 50, co2: 20 },
});

function PlanetCreatePage() {
  const navigate = useNavigate();
  const values = useClimateStore((state) => state.values);
  const setValue = useClimateStore((state) => state.setValue);

  const visual = slidersToVisual(values);

  // Physics 결과는 store에 저장하지 않는다 - 슬라이더와 현재 온도만 있으면
  // 어디서든 다시 계산되는 순수 함수이므로, 쓰는 쪽(GamePage/ReportPage)에서
  // useMemo로 파생시킨다.

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
