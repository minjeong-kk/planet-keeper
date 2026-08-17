import { useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Waves, Snowflake, Cloud, Wind, Factory } from "lucide-react";
import PlanetUI, { LocationPhoto3D } from "../Planet-ui.jsx";
import PlanetLocationPicker from "./PlanetLocationPicker.jsx";
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

// (b) 슬라이더를 조작해서 갈 수 있는 값의 범위. 예전엔 10~80으로 좁혀서 0%/100%
// 같은 극단값에서 시작 못 하게 했는데, 그러면 "바다 10%일 때 빙하가 90%까지
// 갈 수 있어야 하는" 정상적인 조합도 막히고, 지점 데이터(사하라 바다 0%, 남극
// 빙하 95%, 태평양 바다 98%)와도 충돌했다. 그래서 0~100으로 완전히 열고,
// 실제로 불가능한 조합(빙하+바다>100)만 applyIceOceanCoupling으로 막는다.
// "시작할 때 극단값이면 안 된다"는 건 useClimateStore.DEFAULT_VALUES가 이미
// 담당하고 있어서(그 자체가 0/100이 아님) 여기 범위를 여는 것과 무관하다.
const SLIDER_RANGE = { min: 0, max: 100 };

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

// 슬라이더를 만졌을 때(포커스/드래그 시작) 옆에 띄우는 짧은 설명. 빙하/바다는
// 왜 가능 범위가 서로 달라지는지(커플링)를, 나머지는 각 변수가 물리엔진에서
// 실제로 어떤 역할을 하는지를 한 줄로 설명한다.
const SLIDER_GUIDE = {
  iceThickness:
    "🧊 빙하와 바다는 합쳐서 100%를 넘을 수 없어요. 빙하를 늘리면 바다의 최대치가 줄어듭니다.",
  ocean:
    "🌊 바다와 빙하는 합쳐서 100%를 넘을 수 없어요. 바다를 늘리면 빙하의 최대치가 줄어듭니다.",
  cloud:
    "☁️ 구름은 태양빛을 반사해 식히면서도 열을 가둬 데웁니다. 알베도와 온실효과 모두에 영향을 줘요.",
  atmThickness:
    "💨 대기가 두꺼울수록 열을 더 오래 가둬 온실효과가 강해집니다.",
  co2:
    "🏭 CO₂가 늘수록 온실효과가 강해지지만, 늘어날수록 증가폭은 점점 줄어들어요.",
};

// 빙하/바다에만 쓰는 커스텀 슬라이더 - 트랙은 항상 0~100 스케일로 그리고(그래서
// 두 슬라이더가 같은 칸 크기로 보인다), 실제로 손잡이가 갈 수 있는 값은
// [min, cap]으로만 막는다. 나머지 세 슬라이더(대기두께/구름/CO2)는 서로 얽힐 일이
// 없어서 그냥 네이티브 <input type="range">를 그대로 쓴다(더 가볍고 매끄럽다).
//
// pointermove마다 getBoundingClientRect를 다시 재는 건 레이아웃을 다시 읽는
// 비용이 있어서, 드래그를 시작하는 순간(pointerdown) 한 번만 재고 ref에 담아
// 드래그가 끝날 때까지 재사용한다(트랙 크기는 드래그 중 안 바뀌므로 안전하다).
function Slider({ id, value, min, cap, onChange, onGrab }) {
  const trackRef = useRef(null);
  const dragRectRef = useRef(null);

  const setFromClientX = (clientX, rect) => {
    const ratio = (clientX - rect.left) / rect.width;
    const raw = Math.round(ratio * 100);
    onChange(Math.min(cap, Math.max(min, raw)));
  };

  const handlePointerDown = (e) => {
    onGrab?.();
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
      onFocus={onGrab}
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

// 지점 선택 직후(슬라이더를 아직 안 만졌을 때) 3D 지구 대신 보여주는 자리.
// imageUrl이 있는 지점(지금은 사하라만)만 그 사진을 작은 3D 액자(LocationPhoto3D)에
// 넣어 살짝 흔들리는 입체감을 준다 - 실제 지리 정보는 없는 순수 시각 효과다.
// imageUrl이 없는 지점(아직 라이선스 확인 전)은 아무것도 덮지 않는다 - 이미
// 밑에 항상 켜져 있는 PlanetUI가 그 지점의 슬라이더 값(빙하·바다·구름 등)을
// 실시간으로 반영하고 있어서, 따로 플레이스홀더를 덮으면 오히려 "그냥 파란
// 원"으로만 보이고 정보가 없다. null을 반환하면 PlanetCreatePage가 렌더링을
// 생략하고 PlanetUI가 그대로 드러난다.
function LocationPreview({ location }) {
  if (!location.imageUrl) return null;
  return (
    <div className="planet-create-page__location-preview" role="img" aria-label={location.name}>
      <LocationPhoto3D imageUrl={location.imageUrl} />
    </div>
  );
}

function PlanetCreatePage() {
  const navigate = useNavigate();
  const values = useClimateStore((state) => state.values);
  const setValue = useClimateStore((state) => state.setValue);
  const selectedLocation = useClimateStore((state) => state.selectedLocation);
  const isViewingLocationImage = useClimateStore((state) => state.isViewingLocationImage);
  const nextProblem = useGameStore((state) => state.nextProblem);
  // "행성 만들기 완료"는 항상 새 판의 시작이다 - nextProblem은 currentStage가
  // CREATOR가 아니면 아무것도 하지 않고 그냥 반환하므로(이중 실행 방지 가드),
  // 이전 판이 진행 중이거나 끝난 상태로 이 페이지에 다시 들어온 경우(뒤로 가기,
  // /planet-create 새로고침 등)에는 초기 물리 판정이 아예 다시 계산되지 않고
  // 이전 판의 physicsResult 스냅샷이 그대로 화면에 남았다(온도·ΔE·판정 전부).
  // 시작 직전에 게임 상태만 초기화해서 항상 CREATOR에서 출발하게 한다 - 방금
  // 만든 슬라이더 값과 지점 선택은 useClimateStore 쪽이라 그대로 유지된다.
  const resetGame = useGameStore((state) => state.resetGame);

  // 지금 만지고 있는(포커스/드래그 중인) 슬라이더 - 옆 설명 패널이 이걸 보고
  // SLIDER_GUIDE에서 문구를 골라 보여준다. 손을 떼도 마지막 설명은 그대로 둔다
  // (다음 슬라이더를 만질 때까지 사라지면 오히려 읽을 시간이 부족하다).
  const [activeKey, setActiveKey] = useState(null);

  const visual = slidersToVisual(values);

  // Physics 결과는 store에 저장하지 않는다 - 슬라이더와 현재 온도만 있으면
  // 어디서든 다시 계산되는 순수 함수이므로, 쓰는 쪽(GamePage/ReportPage)에서
  // useMemo로 파생시킨다.

  // 대시보드 수치 표시(단위 포함). CO₂ 는 실제 ppm 으로 환산해 보여준다.
  const displayValue = (v) =>
    v.key === "co2" ? `${co2Ppm(values.co2)} ${v.unit}` : `${values[v.key]}${v.unit}`;

  return (
    <>
      {/* GamePage 우측 상단 플로팅 타이머와 같은 자리/스타일 - 슬라이더를 만지면
          그 변수 설명이 뜬다. */}
      <div className="planet-create-page__guide">
        <span className="planet-create-page__guide-eyebrow">GUIDE</span>
        <p className="planet-create-page__guide-text">
          {activeKey ? SLIDER_GUIDE[activeKey] : "슬라이더를 움직이면 여기에 설명이 표시됩니다."}
        </p>
      </div>

      <div className="planet-create-page">
        <div className="planet-create-page__planet">
          {/* 3D 지구(PlanetUI)는 항상 마운트해둔다 - 이미지 모드에서 언마운트했다가
              슬라이더 조작 시 다시 마운트하면, 텍스처 로딩(Suspense)이 매번 새로
              걸려서 "이미지 → 빈 화면 → 지구" 처럼 한 박자 빈다. 대신 이미지는 그
              위에 겹쳐서 보여주고, 이미지 모드가 끝나면 그냥 덮개만 치운다 -
              지구는 밑에서 계속 준비된 상태라 즉시 나타난다. */}
          <div className="planet-create-page__planet-placeholder">
            <PlanetUI {...visual} />
            {isViewingLocationImage && selectedLocation && (
              <LocationPreview location={selectedLocation} />
            )}
          </div>
          <PlanetLocationPicker />
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
                      onGrab={() => setActiveKey(v.key)}
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
                      onFocus={() => setActiveKey(v.key)}
                      onPointerDown={() => setActiveKey(v.key)}
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
            resetGame();
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
