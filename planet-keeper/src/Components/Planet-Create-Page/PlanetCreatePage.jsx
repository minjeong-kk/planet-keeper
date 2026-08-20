import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Waves, Snowflake, Cloud, Wind, Factory } from "lucide-react";
import PlanetUI, { LocationPhoto3D } from "../Planet-ui.jsx";
import PlanetLocationPicker from "./PlanetLocationPicker.jsx";
import Tutorial from "../common/Tutorial.jsx";
import { CREATE_TOUR_STEPS } from "../common/tourSteps.js";
import useClimateStore, { CLIMATE_VARIABLES } from "../../store/useClimateStore";
import useGameStore, { GAME_STAGES } from "../../store/useGameStore";
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

// 슬라이더를 만졌을 때(포커스/드래그 시작) 설정 패널 아래에 뜨는 짧은 설명.
// 빙하/바다는 왜 가능 범위가 서로 달라지는지(커플링)를, 나머지는 각 변수가
// 물리엔진에서 실제로 어떤 역할을 하는지를 한 줄로 설명한다. 같은 문구를
// "? 도움말" 패널에서도 그대로 목록으로 보여준다.
const SLIDER_GUIDE = {
  iceThickness: "🧊 빙하와 바다는 합쳐서 100%를 넘을 수 없어요.",
  ocean: "🌊 바다와 빙하는 합쳐서 100%를 넘을 수 없어요.",
  cloud: "☁️ 구름은 햇빛을 반사해 식히고, 열도 가둬 데웁니다.",
  atmThickness: "💨 대기가 두꺼울수록 열을 더 오래 가둡니다.",
  co2: "🏭 CO₂가 늘수록 온실효과가 강해집니다.",
};

// 위 한 줄 설명의 전문 - 마우스를 올리면(title) 보인다. 패널 안 문구가 두 줄로
// 늘어나면 그만큼 페이지가 길어져 한 화면에 안 들어오므로 화면에는 한 줄만 둔다.
const SLIDER_GUIDE_FULL = {
  iceThickness: "빙하와 바다는 합쳐서 100%를 넘을 수 없어요. 빙하를 늘리면 바다의 최대치가 줄어듭니다.",
  ocean: "바다와 빙하는 합쳐서 100%를 넘을 수 없어요. 바다를 늘리면 빙하의 최대치가 줄어듭니다.",
  cloud: "구름은 태양빛을 반사해 식히면서도 열을 가둬 데웁니다. 알베도와 온실효과 모두에 영향을 줘요.",
  atmThickness: "대기가 두꺼울수록 열을 더 오래 가둬 온실효과가 강해집니다.",
  co2: "CO₂가 늘수록 온실효과가 강해지지만, 늘어날수록 증가폭은 점점 줄어들어요.",
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
      className="create-slider create-slider--custom"
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
      {/* 지금 이 슬라이더가 갈 수 있는 구간(빙하+바다 상호제약 결과) */}
      <span className="create-slider__usable" style={{ left: `${min}%`, width: `${cap - min}%` }} />
      <span className="create-slider__fill" style={{ width: `${value}%` }} />
      <span className="create-slider__thumb" style={{ left: `${value}%` }} />
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
    <div className="create__planet-photo" role="img" aria-label={location.name}>
      <LocationPhoto3D imageUrl={location.imageUrl} />
    </div>
  );
}

function PlanetCreatePage() {
  const navigate = useNavigate();
  const values = useClimateStore((state) => state.values);
  const currentTemperature = useClimateStore((state) => state.currentTemperature);
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
  // 주소창으로 /game 도중에 이 페이지에 직접 들어온 경우를 알아내려고 본다 - 그
  // 상태에서 슬라이더만 만지고 "완료"를 누르지 않은 채 빠져나가면, 행성(useClimateStore)
  // 은 바뀌었는데 진행 중인 타임라인/판정(useGameStore)은 이전 것으로 남는다.
  const currentStage = useGameStore((state) => state.currentStage);
  const gameInProgress = currentStage !== GAME_STAGES.CREATOR && currentStage !== GAME_STAGES.REPORT;

  // 지금 만지고 있는(포커스/드래그 중인) 슬라이더 - 설정 패널 맨 아래 한 줄 설명이
  // 이걸 보고 SLIDER_GUIDE에서 문구를 고른다. 손을 떼도 마지막 설명은 그대로 둔다
  // (다음 슬라이더를 만질 때까지 사라지면 오히려 읽을 시간이 부족하다).
  const [activeKey, setActiveKey] = useState(null);
  // 온보딩(첫 진입 시 자동, 이후에는 "? 도움말" 버튼으로 언제든). 예전 도움말
  // 드롭다운은 슬라이더별 설명 목록이었는데, 그건 패널 아래 한 줄 설명과 내용이
  // 같아서 중복이라 온보딩으로 대체했다.
  const [tourOpen, setTourOpen] = useState(false);
  const createTutorialPending = useGameStore((state) => state.createTutorialPending);
  const dismissCreateTutorial = useGameStore((state) => state.dismissCreateTutorial);

  // 시작 페이지를 거쳐 새로 들어온 경우에만 자동으로 열린다(리포트에서 "행성 다시
  // 만들기"로 온 경우에는 skipTutorials가 이미 꺼 둔다).
  useEffect(() => {
    if (createTutorialPending) setTourOpen(true);
  }, [createTutorialPending]);

  const handleTourFinish = () => {
    setTourOpen(false);
    dismissCreateTutorial();
  };

  // 지점을 고르면 그 지점의 실측 기온도 함께 반영된다 - 남극(230K)을 고르면
  // 얼어붙은 행성, 사하라(300K)를 고르면 메마른 행성으로 보인다(표시 전용 보정).
  const visual = slidersToVisual(values, currentTemperature);

  // Physics 결과는 store에 저장하지 않는다 - 슬라이더와 현재 온도만 있으면
  // 어디서든 다시 계산되는 순수 함수이므로, 쓰는 쪽(GamePage/ReportPage)에서
  // useMemo로 파생시킨다.

  // 대시보드 수치 표시(단위 포함). CO₂ 는 실제 ppm 으로 환산해 보여준다.
  const displayValue = (v) =>
    v.key === "co2" ? `${co2Ppm(values.co2)}` : `${values[v.key]}`;

  // replace로 건다 - push로 쌓으면 게임 도중 뒤로 가기로 이 페이지에 돌아올 수
  // 있고, 거기서 슬라이더를 만지면 행성과 게임 기록이 어긋난 채로 다시 /game에
  // 들어가게 된다(gameInProgress 안내는 그래도 남는 직접 진입용 방어다).
  const handleComplete = () => {
    resetGame();
    nextProblem();
    navigate("/game", { replace: true });
  };

  return (
    <div className="create">
      <div className="create__starfield" aria-hidden="true" />

      {/* ── 헤더: 단계 / 제목 / 도움말 ── */}
      <header className="create__header">
        <div className="create__heading">
          <span className="create__step">STEP 01</span>
          <h1 className="create__title">나만의 행성 만들기</h1>
          <p className="create__subtitle">행성의 특성을 설정하고 나만의 행성을 만들어보세요.</p>
        </div>
        {/* 도움말 = 온보딩 다시 보기. 예전 드롭다운(슬라이더별 설명 목록)은 패널
            아래 한 줄 설명과 내용이 겹쳐서 없애고 이 버튼에 온보딩을 연결했다. */}
        <button type="button" className="create__help-btn" onClick={() => setTourOpen(true)}>
          ? 도움말
        </button>
      </header>

      {/* 진행 중인 게임이 있는데 이 페이지에 들어온 경우(주소창 직접 입력 등).
          새 행성을 만들면 그 판이 사라진다는 걸 먼저 알리고, 돌아갈 길을 준다. */}
      {gameInProgress && (
        <div className="create__resume" role="status">
          <p className="create__resume-text">
            진행 중인 게임이 있습니다. 여기서 새 행성을 만들면 지금까지의 진행 내용은 사라집니다.
          </p>
          <button
            type="button"
            className="create__resume-btn"
            onClick={() => navigate("/game", { replace: true })}
          >
            게임으로 돌아가기
          </button>
        </div>
      )}

      {/* ── 본체: 큰 행성 + 오른쪽 특성 설정(2열) ── */}
      <main className="create__body">
        <div className="create__preview">
          {/* 3D 지구(PlanetUI)는 항상 마운트해둔다 - 이미지 모드에서 언마운트했다가
              슬라이더 조작 시 다시 마운트하면, 텍스처 로딩(Suspense)이 매번 새로
              걸려서 "이미지 → 빈 화면 → 지구" 처럼 한 박자 빈다. 대신 이미지는 그
              위에 겹쳐서 보여주고, 이미지 모드가 끝나면 그냥 덮개만 치운다 -
              지구는 밑에서 계속 준비된 상태라 즉시 나타난다. */}
          <div className="create__planet-frame" data-tour="create-planet">
            <div className="create__planet-glow" aria-hidden="true" />
            <div className="create__planet">
              <PlanetUI {...visual} />
              {isViewingLocationImage && selectedLocation && (
                <LocationPreview location={selectedLocation} />
              )}
            </div>
          </div>
          <p className="create__preview-note">슬라이더를 조절하면 행성이 실시간으로 변합니다.</p>
        </div>

        <aside className="create__panel" data-tour="create-panel">
          <h2 className="create__panel-title">행성 특성 설정</h2>

          <div className="create__controls">
            {VARIABLES.map((v) => {
              const Icon = v.Icon;
              const coupled = Boolean(COUPLED_KEYS[v.key]);
              return (
                <div key={v.key} className="create__control">
                  <div className="create__control-head">
                    <label htmlFor={v.key} className="create__control-label">
                      <Icon size={17} aria-hidden className="create__control-icon" />
                      {v.label}
                    </label>
                    <span className="create__control-value">
                      {displayValue(v)}
                      <em>{v.unit}</em>
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
                      className="create-slider create-slider--native"
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

          {/* 방금 만진 변수의 짧은 설명 - 떠 있는 창이 아니라 패널 안에 붙는다 */}
          <p className="create__panel-hint" title={activeKey ? SLIDER_GUIDE_FULL[activeKey] : undefined}>
            {activeKey ? SLIDER_GUIDE[activeKey] : "각 항목을 조절하면 여기에 설명이 표시됩니다."}
          </p>
        </aside>
      </main>

      {/* ── 지점 선택: 아래쪽 넓은 카드 하나(지도 + 선택 정보) ──
          카드 안의 "이 지점으로 시작"은 "행성 만들기 완료"와 같은 동작이라
          같은 핸들러를 그대로 넘긴다. */}
      <PlanetLocationPicker onStart={handleComplete} />

      {/* ── 하단 액션 ── */}
      <footer className="create__actions">
        <button type="button" className="create__back" onClick={() => navigate("/", { replace: true })}>
          ← 처음으로
        </button>
        <button type="button" className="create__cta" onClick={handleComplete} data-tour="create-cta">
          행성 만들기 완료 →
        </button>
      </footer>

      {tourOpen && <Tutorial steps={CREATE_TOUR_STEPS} onFinish={handleTourFinish} />}
    </div>
  );
}

export default PlanetCreatePage;
