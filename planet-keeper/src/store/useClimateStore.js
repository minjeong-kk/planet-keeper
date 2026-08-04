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

// 전부 50(중립값)이면 우연히 이미 평형(Earth-like Stable)에 가까운 조성이 되어
// 1단계/아이템 단계를 건너뛰는 경우가 잦았다 - 뚜렷한 Energy Surplus(ΔE≈+14.5)로
// 시작해 실제로 고칠 게 있는 상태에서 게임이 시작되도록 값을 조정했다. 이 값이
// 유일한 기준점이라 PlanetCreatePage(첫 진입)와 resetClimate(재도전) 둘 다 항상
// 같은 조성으로 시작한다.
const DEFAULT_VALUES = { ocean: 50, iceThickness: 20, cloud: 30, atmThickness: 50, co2: 40 };

// store는 "입력"만 들고 있는다 — 슬라이더 값(values)과 현재 온도.
// Physics 결과는 이 둘의 순수 함수이므로 store에 저장하지 않고 필요한 곳(예:
// useGameStore.computeSnapshotResult/computeSettledResult)에서 그때그때
// computeClimateV2로 파생시킨다. 게임 진행(문제/아이템/오답 횟수)은 useGameStore가
// 별도로 관리한다. currentTemperature는 useGameStore가 setCurrentTemperature로
// 직접 갱신하거나, useGameStore.tickClimate가 advanceTemperature로 매 타이머
// 틱마다 지금 조성의 평형 방향으로 조금씩 옮긴다.
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

  decayClimate: () =>
    set((state) => ({
      currentTemperature: Math.min(TEMPERATURE_CEILING_K, state.currentTemperature + CLIMATE_DECAY_STEP_K),
    })),

  resetClimate: () =>
    set({
      values: { ...DEFAULT_VALUES },
      currentTemperature: REFERENCE_TEMP_K,
    }),
}));

export default useClimateStore;
