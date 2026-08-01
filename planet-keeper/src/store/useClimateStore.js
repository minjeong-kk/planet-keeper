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

// 게임 진행 단계. PLANET_CREATE -> ANALYZE -> QUIZ -> ITEM -> STABLE
// -> FINAL_QUIZ -> REPORT 순서로 전환된다(순서 자체는 각 페이지가 조건 충족 시
// setGameStage로 넘긴다 - store는 현재 단계만 들고 있는다).
export const GAME_STAGES = {
  PLANET_CREATE: "PLANET_CREATE",
  ANALYZE: "ANALYZE",
  QUIZ: "QUIZ",
  ITEM: "ITEM",
  STABLE: "STABLE",
  FINAL_QUIZ: "FINAL_QUIZ",
  REPORT: "REPORT",
};

const DEFAULT_HEARTS = 3;

// Physics Engine(computeClimateV2)은 PlanetCreatePage에서 슬라이더가 바뀔 때만
// 실행하고, 그 결과(physicsResult)를 여기 저장해서 GamePage/ReportPage/ML 추론이
// 전부 재계산 없이 같은 결과를 공유한다.
const useClimateStore = create((set) => ({
  values: { ...DEFAULT_VALUES },
  currentTemperature: REFERENCE_TEMP_K,
  physicsResult: null,
  gameStage: GAME_STAGES.PLANET_CREATE,
  hearts: DEFAULT_HEARTS,

  setValue: (key, value) =>
    set((state) => ({ values: { ...state.values, [key]: value } })),

  setCurrentTemperature: (temp) => set({ currentTemperature: temp }),

  setPhysicsResult: (result) => set({ physicsResult: result }),

  setGameStage: (stage) => set({ gameStage: stage }),

  loseHeart: () => set((state) => ({ hearts: Math.max(0, state.hearts - 1) })),

  resetClimate: () =>
    set({
      values: { ...DEFAULT_VALUES },
      currentTemperature: REFERENCE_TEMP_K,
      physicsResult: null,
    }),

  // 행성 만들기로 되돌아가는 전체 재시작 - climate 값과 진행 단계/하트를 모두 초기화한다.
  resetGame: () =>
    set({
      values: { ...DEFAULT_VALUES },
      currentTemperature: REFERENCE_TEMP_K,
      physicsResult: null,
      gameStage: GAME_STAGES.PLANET_CREATE,
      hearts: DEFAULT_HEARTS,
    }),
}));

export default useClimateStore;
