import { create } from "zustand";
import { STAGE1_QUESTIONS, STAGE2_QUESTIONS } from "../data/quizBank.js";
import useClimateStore from "./useClimateStore.js";
import { computeClimateV2, mapSlidersToClimateInputs } from "../utils/physicsEngine.js";
import { predictClimateState } from "../utils/climateClassifier.js";

// 게임 진행(문제/아이템/오답 횟수) 전용 store. 행성 슬라이더 값은 useClimateStore가
// 들고 있고, 여기서는 아이템 사용 시 그 값을 바꾸고 물리엔진/ML을 재계산한다.
export const GAME_STAGES = {
  CREATOR: "creator",
  PROBLEM1: "problem1",
  ITEM: "item",
  FINAL: "final",
  REPORT: "report",
};

const MAX_WRONG_COUNT = 3;

const pickRandom = (list) => list[Math.floor(Math.random() * list.length)];

// 슬라이더(values) 현재값 기준으로 물리엔진 + ML을 실제로 재계산한다.
async function computeClimateResult() {
  const { values, currentTemperature } = useClimateStore.getState();
  const climateInputs = mapSlidersToClimateInputs(values);
  const physics = computeClimateV2({ ...climateInputs, currentTemperature });
  const ml = await predictClimateState(climateInputs, physics);
  return { physics, ml };
}

const useGameStore = create((set, get) => ({
  currentStage: GAME_STAGES.CREATOR,
  inventory: [],
  currentProblem: null,
  wrongCount: 0,
  physicsResult: null,
  mlResult: null,
  isComputing: false,
  // REPORT 단계로 넘어간 이유: "stable"(아이템 사용 후 평형 도달로 즉시 성공) |
  // "completed"(최종 문제까지 정답으로 완주) | "hearts"(오답 3회로 실패) | null(아직 진행 중)
  gameOverReason: null,

  addItem: (item) => set((state) => ({ inventory: [...state.inventory, item] })),

  // CREATOR -> PROBLEM1. 게임 페이지에 들어가면 먼저 물리엔진/ML을 계산해두고,
  // 그 결과가 나온 뒤에 첫 문제(STAGE1_QUESTIONS 중 무작위 1문항)를 보여준다.
  nextProblem: async () => {
    if (get().currentStage !== GAME_STAGES.CREATOR) return;

    set({ isComputing: true });
    try {
      const { physics, ml } = await computeClimateResult();
      set({ physicsResult: physics, mlResult: ml });
    } catch (err) {
      console.error("[useGameStore] 물리엔진/ML 재계산 실패:", err);
    } finally {
      set({
        isComputing: false,
        currentStage: GAME_STAGES.PROBLEM1,
        currentProblem: pickRandom(STAGE1_QUESTIONS),
      });
    }
  },

  // 아이템 선택 -> 슬라이더 값에 효과 적용 -> 물리엔진/ML 재계산.
  // 재계산 결과가 이미 Earth-like Stable(평형)이면 최종 문제 없이 바로 성공 종료,
  // 아직 아니면 FINAL 문제로 넘어간다. 고른 아이템이 실제로 평형에 도움이 되는지는
  // 여기서 판정하지 않는다 - 재계산된 deltaEnergy/ML 결과로 자연스럽게 드러나게 한다.
  useItem: async (item) => {
    get().addItem(item.id);

    const { values, setValue } = useClimateStore.getState();
    const nextValue = Math.min(100, Math.max(0, values[item.key] + item.delta));
    setValue(item.key, nextValue);

    set({ isComputing: true });
    let result = null;
    try {
      result = await computeClimateResult();
      set({ physicsResult: result.physics, mlResult: result.ml });
    } catch (err) {
      console.error("[useGameStore] 물리엔진/ML 재계산 실패:", err);
    }
    set({ isComputing: false });

    if (result?.ml?.label === "Earth-like Stable") {
      get().goReport("stable");
      return;
    }

    set({ currentStage: GAME_STAGES.FINAL, currentProblem: pickRandom(STAGE2_QUESTIONS) });
  },

  // 정답이면 true, 오답이면 false를 반환한다(호출부가 오답 메시지를 띄울 때 사용).
  solveProblem: (answer) => {
    const { currentProblem, currentStage, wrongCount } = get();
    if (!currentProblem) return false;

    if (answer !== currentProblem.answer) {
      const nextWrongCount = wrongCount + 1;
      set({ wrongCount: nextWrongCount });
      if (nextWrongCount >= MAX_WRONG_COUNT) {
        get().goReport("hearts");
      }
      return false;
    }

    if (currentStage === GAME_STAGES.FINAL) {
      // Final 문제를 맞았다고 끝나는 것이 아님
      // 아이템 지급 또는 Physics/ML 재계산 후 Stable 여부를 확인
      set({ currentStage: GAME_STAGES.ITEM });
    } else {
      set({ currentStage: GAME_STAGES.ITEM });
    }
    return true;
  },

  

  goReport: (reason = null) => set({ currentStage: GAME_STAGES.REPORT, gameOverReason: reason }),

  resetGame: () =>
    set({
      currentStage: GAME_STAGES.CREATOR,
      inventory: [],
      currentProblem: null,
      wrongCount: 0,
      physicsResult: null,
      mlResult: null,
      isComputing: false,
      gameOverReason: null,
    }),
}));

export default useGameStore;
