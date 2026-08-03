import { create } from "zustand";
import {
  REFERENCE_TEMP_K,
  computeClimateV2,
  mapSlidersToClimateInputs,
  stepTemperature,
} from "../utils/physicsEngine.js";

// PlanetCreatePage 슬라이더 + GamePage 표시가 공유하는 변수 목록.
// 나중에 Physics Engine/ML 추론도 이 키 이름을 그대로 입력으로 쓰게 된다.
export const CLIMATE_VARIABLES = [
  { key: "iceThickness", label: "빙하 두께" },
  { key: "ocean", label: "바다" },
  { key: "cloud", label: "구름 양" },
  { key: "atmThickness", label: "대기 두께" },
  { key: "co2", label: "CO2" },
];

const DEFAULT_VALUES = Object.fromEntries(
  CLIMATE_VARIABLES.map((v) => [v.key, 50])
);

// store는 "입력"만 들고 있는다 — 슬라이더 값(values)과 현재 온도.
// Physics 결과는 이 둘의 순수 함수이므로 store에 저장하지 않고 각 페이지에서
// useMemo로 파생시킨다(예전에는 physicsResult를 저장해 두어서, 제작 페이지를
// 거치지 않고 /game에 바로 들어오면 값이 null로 남는 문제가 있었다).
const useClimateStore = create((set) => ({
  values: { ...DEFAULT_VALUES },
  currentTemperature: REFERENCE_TEMP_K,

  setValue: (key, value) =>
    set((state) => ({ values: { ...state.values, [key]: value } })),

  setCurrentTemperature: (temp) => set({ currentTemperature: temp }),

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
    }),
}));

export default useClimateStore;
