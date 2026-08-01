import { create } from "zustand";
import { REFERENCE_TEMP_K } from "../utils/physicsEngine.js";

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

// Physics Engine(computeClimateV2)은 PlanetCreatePage에서 슬라이더가 바뀔 때만
// 실행하고, 그 결과(physicsResult)를 여기 저장해서 GamePage/ReportPage/ML 추론이
// 전부 재계산 없이 같은 결과를 공유한다.
const useClimateStore = create((set) => ({
  values: { ...DEFAULT_VALUES },
  currentTemperature: REFERENCE_TEMP_K,
  physicsResult: null,

  setValue: (key, value) =>
    set((state) => ({ values: { ...state.values, [key]: value } })),

  setCurrentTemperature: (temp) => set({ currentTemperature: temp }),

  setPhysicsResult: (result) => set({ physicsResult: result }),

  resetClimate: () =>
    set({
      values: { ...DEFAULT_VALUES },
      currentTemperature: REFERENCE_TEMP_K,
      physicsResult: null,
    }),
}));

export default useClimateStore;
