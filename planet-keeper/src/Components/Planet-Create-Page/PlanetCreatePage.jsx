import { useRef } from "react";
import { useNavigate } from "react-router-dom";
import { Waves, Snowflake, Cloud, Wind, Factory } from "lucide-react";
import PlanetUI from "../Planet-ui.jsx";
import useClimateStore, { CLIMATE_VARIABLES } from "../../store/useClimateStore";
import useGameStore from "../../store/useGameStore";
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

// (b) 슬라이더를 조작해서 갈 수 있는 값의 범위 - 0%/100% 같은 극단값에서 시작하지
// 못하도록 실제 조작 가능 범위를 좁힌다. useClimateStore.DEFAULT_VALUES(페이지
// 진입 시 보이는 기본값)와는 다른 개념이라 그건 그대로 두고, 여기서만 min/max를 좁힌다.
const SLIDER_RANGE = { min: 10, max: 80 };

// (a) 빙하+바다 비율의 합이 100을 넘지 않게 하는 건 이제 useClimateStore.setValue가
// 직접 한다(어느 쪽을 밀어도 실시간으로 반대쪽을 밀어냄) - 그래서 여기서는 그
// 결과값 기준으로 "지금 이 슬라이더가 더 갈 수 있는 최대치"만 계산하면 된다.
// 커스텀 Slider(아래)는 손잡이 위치를 항상 value/100으로 그리기 때문에(min/max에
// 얽매이지 않음), cap이 실시간으로 바뀌어도 안 만진 슬라이더의 손잡이가 따라
// 움직이는 문제가 생기지 않는다 - 예전에 네이티브 input의 max를 실시간으로
// 바꿔봤다가 이 버그로 되돌렸던 것과 달리, 이번엔 매 렌더마다 그냥 다시 계산해도 된다.
const COUPLED_KEYS = { iceThickness: "ocean", ocean: "iceThickness" };

function couplingCapFor(key, values) {
  const coupledKey = COUPLED_KEYS[key];
  if (!coupledKey) return SLIDER_RANGE.max;
  return Math.max(SLIDER_RANGE.min, Math.min(SLIDER_RANGE.max, 100 - values[coupledKey]));
}

// 빙하/바다에만 쓰는 커스텀 슬라이더 - 트랙은 항상 0~100 스케일로 그리고(그래서
// 두 슬라이더가 같은 칸 크기로 보인다), 실제로 손잡이가 갈 수 있는 값은
// [min, cap]으로만 막는다. 나머지 세 슬라이더(대기두께/구름/CO2)는 서로 얽힐 일이
// 없어서 그냥 네이티브 <input type="range">를 그대로 쓴다(더 가볍고 매끄럽다).
//
// pointermove마다 getBoundingClientRect를 다시 재는 건 레이아웃을 다시 읽는
// 비용이 있어서, 드래그를 시작하는 순간(pointerdown) 한 번만 재고 ref에 담아
// 드래그가 끝날 때까지 재사용한다(트랙 크기는 드래그 중 안 바뀌므로 안전하다).
function Slider({ id, value, min, cap, onChange }) {
  const trackRef = useRef(null);
  const dragRectRef = useRef(null);

  const setFromClientX = (clientX, rect) => {
    const ratio = (clientX - rect.left) / rect.width;
    const raw = Math.round(ratio * 100);
    onChange(Math.min(cap, Math.max(min, raw)));
  };

  const handlePointerDown = (e) => {
    const rect = trackRef.current.getBoundingClientRect();
    dragRectRef.current = rect;
    trackRef.current.setPointerCapture(e.pointerId);
    setFromClientX(e.clientX, rect);
  };

  const handlePointerMove = (e) => {
    if (e.buttons !== 1 || !dragRectRef.current) return;
    setFromClientX(e.clientX, dragRectRef.current);
  };

  const handleKeyDown = (e) => {
    if (e.key === "ArrowRight" || e.key === "ArrowUp") onChange(Math.min(cap, value + 1));
    if (e.key === "ArrowLeft" || e.key === "ArrowDown") onChange(Math.max(min, value - 1));
  };

  return (
    <div
      id={id}
      ref={trackRef}
      className="planet-create-page__slider-track"
      role="slider"
      tabIndex={0}
      aria-valuemin={min}
      aria-valuemax={cap}
      aria-valuenow={value}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onKeyDown={handleKeyDown}
    >
      <span
        className="planet-create-page__slider-usable"
        style={{ left: `${min}%`, width: `${cap - min}%` }}
      />
      <span className="planet-create-page__slider-fill" style={{ width: `${value}%` }} />
      <span className="planet-create-page__slider-thumb" style={{ left: `${value}%` }} />
    </div>
  );
}

function PlanetCreatePage() {
  const navigate = useNavigate();
  const values = useClimateStore((state) => state.values);
  const setValue = useClimateStore((state) => state.setValue);
  const nextProblem = useGameStore((state) => state.nextProblem);

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
              const coupled = Boolean(COUPLED_KEYS[v.key]);
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
                  {coupled ? (
                    // 빙하/바다만 커스텀 슬라이더 - 서로 캡을 실시간으로 밀어내야 해서.
                    <Slider
                      id={v.key}
                      value={values[v.key]}
                      min={SLIDER_RANGE.min}
                      cap={couplingCapFor(v.key, values)}
                      onChange={(next) => setValue(v.key, next)}
                    />
                  ) : (
                    // 나머지는 서로 얽힐 일이 없어 네이티브 슬라이더 그대로 - 더 가볍고 매끄럽다.
                    <input
                      id={v.key}
                      className="planet-create-page__slider"
                      type="range"
                      min={SLIDER_RANGE.min}
                      max={SLIDER_RANGE.max}
                      value={values[v.key]}
                      style={{
                        "--fill": `${((values[v.key] - SLIDER_RANGE.min) / (SLIDER_RANGE.max - SLIDER_RANGE.min)) * 100}%`,
                      }}
                      onChange={(e) => setValue(v.key, Number(e.target.value))}
                    />
                  )}
                </div>
              );
            })}
          </div>
        </div>
      </div>

      <div className="planet-create-page__actions">
        <button onClick={() => navigate("/")}>맨 처음 페이지로 가기</button>
        <button
          className="btn-primary"
          onClick={() => {
            nextProblem();
            navigate("/game");
          }}
        >
          행성 만들기 완료
        </button>
      </div>
    </>
  );
}

export default PlanetCreatePage;
