import { create } from "zustand";
import { persist } from "zustand/middleware";
import {
  REFERENCE_TEMP_K,
  computeClimateV2,
  mapSlidersToClimateInputs,
  stepTemperature,
  co2PpmToSlider,
  atmThicknessToSlider,
} from "../utils/physicsEngine.js";

// PlanetCreatePage 슬라이더 + GamePage 표시가 공유하는 변수 목록.
// Physics Engine(mapSlidersToClimateInputs)도 이 키 이름을 그대로 입력으로 쓴다.
export const CLIMATE_VARIABLES = [
  { key: "iceThickness", label: "빙하 면적" },
  { key: "ocean", label: "바다" },
  { key: "cloud", label: "구름 양" },
  { key: "atmThickness", label: "대기 두께" },
  { key: "co2", label: "CO2" },
];

// 빙하+바다 비율의 합은 항상 100을 넘을 수 없다(physicsEngine.albedoOf가
// landRatio = 1 - 빙하 - 바다로 전제). 순수 함수로 빼서 setValue·
// setValuesFromPoint·useGameStore.nextSliderValues가 전부 이거 하나만 쓴다 -
// 예전엔 setValue에만 이 규칙이 있고 nextSliderValues(아이템 적용 시 "다음 값"
// 계산)에는 없어서, 아이템 사용 시 리포트가 예상한 ΔE와 실제 스토어에 반영된
// ΔE가 갈라지는 버그가 있었다(예: 빙하20/바다80에서 빙하+8 아이템 → 예상은
// {28,80}, 실제 저장은 {28,72}). 한쪽을 밀어 올려 100을 넘기려 하면 반대쪽을
// 실시간으로 밀어내는 규칙이 이제 어디서 호출하든 항상 똑같이 적용된다.
export function applyIceOceanCoupling(values, key) {
  const coupledKey = key === "iceThickness" ? "ocean" : key === "ocean" ? "iceThickness" : null;
  if (!coupledKey) return values;
  if (values[key] + values[coupledKey] > 100) {
    return { ...values, [coupledKey]: 100 - values[key] };
  }
  return values;
}

// 전부 50(중립값)이면 우연히 이미 평형(Earth-like Stable)에 가까운 조성이 되어
// 1단계/아이템 단계를 건너뛰는 경우가 잦았다 - 뚜렷한 Energy Surplus(ΔE≈+43.2,
// 평형 허용범위 ±14.9의 약 3배)로 시작해 실제로 고칠 게 있는 상태에서 게임이
// 시작되도록 값을 조정했다. 이 값이
// 유일한 기준점이라 PlanetCreatePage(첫 진입)와 resetClimate(재도전) 둘 다 항상
// 같은 조성으로 시작한다.
const DEFAULT_VALUES = { ocean: 50, iceThickness: 20, cloud: 30, atmThickness: 50, co2: 40 };

// store는 "입력"만 들고 있는다 — 슬라이더 값(values)과 현재 온도.
// Physics 결과는 이 둘의 순수 함수이므로 store에 저장하지 않고 필요한 곳(예:
// useGameStore.computeSnapshotResult/computeSettledResult)에서 그때그때
// computeClimateV2로 파생시킨다. 게임 진행(문제/아이템/오답 횟수)은 useGameStore가
// 별도로 관리한다. currentTemperature는 useGameStore가 setCurrentTemperature로
// 직접 갱신하거나, useGameStore.applyClimateEvent가 advanceTemperature로 매 타이머
// 틱마다 지금 조성의 평형 방향으로 조금씩 옮긴다.
const useClimateStore = create(
  persist(
    (set) => ({
  values: { ...DEFAULT_VALUES },
  currentTemperature: REFERENCE_TEMP_K,

  // "지점별 이미지 ↔ 3D 지구" 전환용. selectedLocation은 마지막으로 고른 지점
  // (플레이스홀더에 이름/imageUrl을 보여주는 데 씀), isViewingLocationImage는
  // 지금 이미지 모드인지. 슬라이더를 실제로 움직이면(setValue) false로 내려가고,
  // 그 뒤 값을 지점 초기값으로 되돌려도 다시 true가 되지 않는다(세션 동안 유지) -
  // selectedLocation 자체는 안 지운다(false일 땐 어차피 안 쓰이고, 다음에 값이
  // 바뀔 때 굳이 또 체크할 이유가 없어서 그대로 둔다).
  selectedLocation: null,
  isViewingLocationImage: false,

  setValue: (key, value) =>
    set((state) => {
      const values = applyIceOceanCoupling({ ...state.values, [key]: value }, key);
      const changed = state.values[key] !== value;

      // 지표 구성(빙하/바다)을 실제로 바꾸면 그 지점의 실측 지표면 반사율은 더 이상
      // 이 행성을 설명하지 못하므로 버린다 - 안 버리면 빙하를 100까지 올려도
      // 알베도가 실측값에 고정돼 슬라이더가 먹지 않는 것처럼 보인다. 그때부터는
      // albedoOf가 슬라이더 기반 면적 가중으로 되돌아간다.
      const surfaceChanged = changed && (key === "iceThickness" || key === "ocean");
      if (surfaceChanged) delete values.measuredSurfaceAlbedo;

      // 값이 실제로 달라질 때만 이미지 모드를 끈다 - 클릭/포커스만으로는 안 꺼짐
      // (같은 값을 다시 세팅하는 호출은 "조작"으로 안 침).
      return {
        values,
        ...(changed && state.isViewingLocationImage ? { isViewingLocationImage: false } : {}),
      };
    }),

  setCurrentTemperature: (temp) => set({ currentTemperature: temp }),

  // "특정 지점 선택"(PlanetLocationPicker) 전용 - 지점 하나의 값을 슬라이더에 한
  // 번에 반영한다. point.values는 슬라이더 단위가 아니라 실제 물리 단위다(co2는
  // ppm, atmThickness는 mapSlidersToClimateInputs가 쓰는 0.4~2.0 스케일) - 이
  // 둘만 역함수(co2PpmToSlider/atmThicknessToSlider)로 슬라이더 스케일로 되돌리고,
  // iceThickness/ocean/cloud는 원래부터 0~100 슬라이더 스케일과 같아 그대로 쓴다.
  // "초기값"만 세팅할 뿐 잠그지 않으므로, 이후 setValue로 자유롭게 다시 조작할 수 있다.
  //
  // point.t2m(있으면)은 현재 온도도 그 지점의 실측 기온으로 같이 맞춘다 - 이래야
  // "이 지점이 실제로 평형인지"를 조성뿐 아니라 실제 온도로도 판정할 수 있다.
  // t2m이 없는 지점(레거시 목데이터)은 온도를 건드리지 않는다.
  setValuesFromPoint: (point) =>
    set((state) => {
      const clamp = (v) => Math.min(100, Math.max(0, v));

      return {
        values: {
          ...state.values,
          // 지점 프리셋의 iceThickness/ocean은 이미 지리적으로 유효한 조합(합≤100)이라
          // applyIceOceanCoupling을 거치지 않고 그대로 쓴다 - 거치면 항상 ocean이
          // 밀려나서(커플링 기준 키가 "iceThickness"로 고정) 빙하+바다가 둘 다 높은
          // 지점(예: 북극)에서 실측 ocean 값이 조용히 달라질 수 있다.
          iceThickness: clamp(point.values.iceThickness),
          ocean: clamp(point.values.ocean),
          cloud: clamp(point.values.cloud),
          atmThickness: atmThicknessToSlider(point.values.atmThickness),
          co2: co2PpmToSlider(point.values.co2),
          // 그 지점 육지의 실측 반사율(사하라 0.32 = 모래 / 아마존 0.14 = 열대림).
          // 슬라이더가 아닌데 values에 같이 담는 이유: 게임 전체가
          // mapSlidersToClimateInputs(values)를 거쳐 물리를 계산하므로, 여기 넣어두면
          // 모든 경로에 자동으로 전달된다. 별도 필드로 두면 computeClimateV2를 부르는
          // 여러 곳에서 각자 챙겨야 하고, 한 곳만 빠뜨려도 그 경로만 조용히 어긋난다.
          // 지점 없이 시작하면 undefined라 albedoOf가 기본값(ALBEDO_LAND)을 쓴다.
          // 생성기는 일사 표본이 없으면 null을 낸다. albedoOf의 typeof 검사가
          // 한 번 더 막지만, 여기서도 걸러 null이 store에 들어가지 않게 한다.
          measuredSurfaceAlbedo:
            typeof point.surfaceAlbedo === "number" ? point.surfaceAlbedo : undefined,
        },
        ...(typeof point.t2m === "number" ? { currentTemperature: point.t2m } : {}),
        selectedLocation: point,
        isViewingLocationImage: true,
      };
    }),

  // 피드백 타이머 한 틱: 현재 조성에서의 ΔE 방향으로 온도를 한 걸음 움직인다.
  // ΔE > 0 이면 온도 상승, ΔE < 0 이면 하강 → 평형온도로 수렴한다.
  // 컴포넌트의 오래된 클로저 문제를 피하려고 store 안에서 최신 상태를 직접 읽는다.
  advanceTemperature: () =>
    set((state) => {
      const physics = computeClimateV2({
        ...mapSlidersToClimateInputs(state.values),
        currentTemperature: state.currentTemperature,
      });
      const next = stepTemperature(state.currentTemperature, physics.deltaEnergy);
      // 평형에 사실상 도달했으면 상태를 바꾸지 않는다(불필요한 리렌더 방지).
      if (Math.abs(next - state.currentTemperature) < 1e-4) return {};
      return { currentTemperature: next };
    }),

  resetClimate: () =>
    set({
      values: { ...DEFAULT_VALUES },
      currentTemperature: REFERENCE_TEMP_K,
      selectedLocation: null,
      isViewingLocationImage: false,
    }),
    }),
    // 여기 저장되는 값(슬라이더 0~100, 온도 K)은 ΔE 스케일과 무관해서 그대로 둬도
    // 되지만, useGameStore가 초기화되는데 조성만 남으면 "새 게임인데 이전 판의
    // 행성"이 되어 헷갈린다. 두 store의 version을 같이 올려 항상 함께 초기화한다.
    //
    // version 2로 올린 이유가 두 가지 있다(둘 다 옛 저장본을 한 번 비워야 한다).
    //   1) 빙하+바다 상호제약(applyIceOceanCoupling) 도입 당시 버전을 안 올려서,
    //      그 이전 저장본(예: {iceThickness:80, ocean:80} 같은 합>100 조합)이
    //      migrate로 안 걸러지고 있었다.
    //   2) "이전 판이 지구형 안정으로 끝난 조성 + 그 평형온도(≈288K)"가 그대로
    //      남아 있어서, 새 게임이 시작부터 ΔE≈0 / 지구형 안정으로 뜨는 문제가
    //      있었다(StartPage가 resetClimate를 부르지 않았음 - 지금은 부른다).
    // migrate가 빈 객체를 반환하면 초기 상태와 병합되어 사실상 초기화된다.
    { name: "planet-keeper-climate", version: 2, migrate: () => ({}) },
  ),
);

export default useClimateStore;
