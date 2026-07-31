import { create } from "zustand";

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

const useClimateStore = create((set) => ({
  values: { ...DEFAULT_VALUES },

  setValue: (key, value) =>
    set((state) => ({ values: { ...state.values, [key]: value } })),

  reset: () => set({ values: { ...DEFAULT_VALUES } }),
}));

export default useClimateStore;
