import { create } from "zustand";
import { STAGE1_QUESTIONS, STAGE2_QUESTIONS } from "../data/quizBank.js";
import useClimateStore from "./useClimateStore.js";
import {
  computeClimateV2,
  mapSlidersToClimateInputs,
  equilibriumTemperatureOf,
  co2PpmForTargetTemperature,
  co2PpmToSlider,
  REFERENCE_TEMP_K,
} from "../utils/physicsEngine.js";
import { predictClimateState } from "../utils/climateClassifier.js";
import { describeItemJudgment, describeFinalizeJudgment } from "../utils/planetAnalysis.js";

// 게임 진행(문제/아이템/오답 횟수) 전용 store. 행성 슬라이더 값은 useClimateStore가
// 들고 있고, 여기서는 아이템 사용 시 그 값을 바꾸고 물리엔진/ML을 재계산한다.
//
// 전체 흐름: 행성 생성 -> Physics+ML(초기 판정 - 조성이 우연히 이미 Earth-like
// Stable이면 1단계/아이템 없이 2단계로 직행) -> 1단계 문제 -> 아이템 사용(조성이
// 평형에 도달하면 실제로 몇 도가 되는지 계산 - equilibriumTemperatureOf는 시작
// 온도와 무관하게 조성만으로 정해지므로, 방향이 맞는 아이템은 Earth-like Stable에
// 가깝게, 틀린 아이템은 Cold/Warm Stable처럼 지구형 범위 밖으로 보낸다. clamp
// 한계 때문에 평형 자체가 존재하지 않는 극단적인 조성만 여전히 Energy Surplus/
// Deficit로 남는다) -> 에너지가 균형(Cold/Earth-like/Warm Stable 중 하나)이면
// 2단계로, 극단적으로 안 되면 새 1단계 문제로 돌아가 아이템을 다시 고른다(그
// 1단계 문제 자체를 틀리면 solveProblem이 목숨을 깎는다 - 아이템을 잘못 고른
// 것만으로는 목숨이 깎이지 않음). 2단계 승리 조건은 항상 "정답 3번"(finalizeGame의
// finalAttempts) - 정답을 맞힐 때마다 체크가 하나 채워지고(목숨은 깎이지 않음),
// 아직 지구형 범위 밖이면 CO2를 부족한 방향으로 조정한다(3번째 정답에서는 무한
// 루프를 막기 위해 강제로 정확히 평형). 2단계에서 오답이면 목숨이 깎이고 체크가
// 전부 0으로 초기화되며, 목숨이 다 떨어지면 게임오버로 리포트.
export const GAME_STAGES = {
  CREATOR: "creator",
  PROBLEM1: "problem1",
  ITEM: "item",
  FINAL: "final",
  REPORT: "report",
};

export const MAX_WRONG_COUNT = 3;
const EARTH_LIKE_STABLE_LABEL = "Earth-like Stable";
// energyStateOf/label_rules.py 기준 "에너지가 평형(|ΔE|≤5)인" 세 상태 - 아이템
// 적용 후 이 중 하나가 아니면(Energy Surplus/Deficit) 아이템이 틀린 방향이었다는 뜻이다.
const STABLE_LABELS = new Set(["Cold Stable", EARTH_LIKE_STABLE_LABEL, "Warm Stable"]);

// 2단계 문제를 맞혔는데도 아직 지구형 범위 밖(Warm/Cold Stable)일 때 CO2를 이
// 폭만큼 +-한다(carbon_capture/greenhouse_emitter 아이템과 같은 스케일 ±25).
const FINAL_CO2_STEP = 25;
// 이 조정을 반복해도 끝나지 않을 수 있으므로, 3번째 시도에서는 무한 루프를 막기
// 위해 co2PpmForTargetTemperature로 정확히 지구형 평형이 되도록 강제 조정한다.
// GamePage가 2단계 진행 체크(finalAttempts/MAX_FINAL_ATTEMPTS)를 표시하는 데도 쓴다.
export const MAX_FINAL_ATTEMPTS = 3;

// 타이머 한 틱마다 co2 슬라이더(0~100)에 더하는 양 - GamePage의 CLIMATE_TICK_MS(3초)
// 간격과 맞물려 방치 시 체감할 수 있을 정도로만 CO2가 오르게 조절한 값이다.
const CLIMATE_TICK_CO2_STEP = 1;

const pickRandom = (list) => list[Math.floor(Math.random() * list.length)];

// 행성 생성 직후의 있는 그대로의 스냅샷: 온도를 건드리지 않고 지금 조성이
// 에너지 과다/부족 상태인지를 Physics+AI로 보여준다(대개 Energy Surplus/Deficit).
async function computeSnapshotResult() {
  const { values, currentTemperature } = useClimateStore.getState();
  const climateInputs = mapSlidersToClimateInputs(values);
  const physics = computeClimateV2({ ...climateInputs, currentTemperature });
  const ml = await predictClimateState(climateInputs, physics);
  return { physics, ml };
}

// 조성이 실제로 평형에 도달하면 어떻게 되는지를 바로 계산한다(아이템 적용 후,
// 그리고 finalizeGame이 CO2를 조정한 뒤에도 다시 쓴다). equilibriumTemperatureOf는
// 어떤 온도를 넣어 계산하든 같은 결과가 나오므로(조성에만 의존, 수학적으로 입력
// 온도와 무관) 지금 온도를 그대로 넣어도 된다. 여기서 실제로 currentTemperature를
// 이 평형온도로 갱신해 둔다.
async function computeSettledResult() {
  const { values, currentTemperature, setCurrentTemperature } = useClimateStore.getState();
  const climateInputs = mapSlidersToClimateInputs(values);
  const rawPhysics = computeClimateV2({ ...climateInputs, currentTemperature });
  const settledTemperature = equilibriumTemperatureOf(rawPhysics);

  setCurrentTemperature(settledTemperature);

  const physics = computeClimateV2({ ...climateInputs, currentTemperature: settledTemperature });
  const ml = await predictClimateState(climateInputs, physics);
  return { physics, ml };
}

// 아이템 효과를 적용한 다음 슬라이더 값(0~100 범위로 clamp).
function nextSliderValues(values, item) {
  const nextValue = Math.min(100, Math.max(0, values[item.key] + item.delta));
  return { ...values, [item.key]: nextValue };
}

const useGameStore = create((set, get) => ({
  currentStage: GAME_STAGES.CREATOR,
  inventory: [],
  currentProblem: null,
  wrongCount: 0,
  finalAttempts: 0,
  physicsResult: null,
  mlResult: null,
  isComputing: false,
  // 아이템 사용 결과 / 최종 확인 결과 메시지. { ok: boolean, lines: string[] } | null
  notice: null,
  // REPORT 단계로 넘어간 이유: "planet_stabilized"(성공) | "life_over"(실패) | null(진행 중)
  gameOverReason: null,

  addItem: (item) => set((state) => ({ inventory: [...state.inventory, item] })),

  // 게임이 진행되는 내내(CREATOR/REPORT 제외) 호출되는 타이머 한 틱 - CO2가
  // 계속 배출되는 것을 흉내내 co2 슬라이더를 조금씩 올린다. CO2가 오르면
  // 온실효과가 커져 평형온도(equilibriumTemperatureOf) 자체가 올라가고,
  // advanceTemperature가 그 새 평형 방향으로 currentTemperature를 조금씩
  // 옮긴다 - "가만히 두면 계속 나빠진다"는 압박이 실제 조성 변화로 나타난다.
  // ML 재판정은 아이템 사용/최종 확인 같은 실제 행동 시점에만 하므로 여기서는 안 한다.
  tickClimate: () => {
    const { values, setValue, advanceTemperature } = useClimateStore.getState();
    setValue("co2", Math.min(100, values.co2 + CLIMATE_TICK_CO2_STEP));
    advanceTemperature();
    const { values: nextValues, currentTemperature } = useClimateStore.getState();
    const physics = computeClimateV2({ ...mapSlidersToClimateInputs(nextValues), currentTemperature });
    set({ physicsResult: physics });
  },

  // CREATOR -> PROBLEM1. 지금 조성의 있는 그대로의 에너지 상태를 Physics+AI로
  // 보여준 뒤 1단계 문제로 진행한다. 만든 조성이 우연히 이미 Earth-like Stable이면
  // 고칠 게 없으니 1단계/아이템 없이 2단계 확인 문제로 바로 간다(그래도 성공은
  // finalizeGame의 안정화 체크 3번을 다 채워야 한다 - 즉시 성공 처리하지 않음).
  nextProblem: async () => {
    if (get().currentStage !== GAME_STAGES.CREATOR) return;

    set({ isComputing: true });
    try {
      const { physics, ml } = await computeSnapshotResult();
      set({ physicsResult: physics, mlResult: ml });

      if (ml.label === EARTH_LIKE_STABLE_LABEL) {
        set({ currentStage: GAME_STAGES.FINAL, currentProblem: pickRandom(STAGE2_QUESTIONS) });
        return;
      }
    } catch (err) {
      console.error("[useGameStore] 초기 물리엔진/ML 계산 실패:", err);
    } finally {
      set({ isComputing: false });
      if (get().currentStage === GAME_STAGES.CREATOR) {
        set({ currentStage: GAME_STAGES.PROBLEM1, currentProblem: pickRandom(STAGE1_QUESTIONS) });
      }
    }
  },

  // 아이템 효과는 정답/오답 판정 없이 항상 실제로 슬라이더에 적용한 뒤, 그 조성이
  // 실제로 평형에 도달하면 몇 도가 되는지(computeSettledResult/equilibriumTemperatureOf)
  // 계산한다. 평형온도는 시작 온도와 무관하게 조성만으로 정해지므로(수학적으로
  // T_current가 상쇄됨), 대부분의 "방향이 틀린" 아이템도 에너지 자체는 결국
  // 균형에 도달하지만 그 온도가 Cold/Warm Stable(지구형 범위 밖)로 나온다 - 이게
  // 실제 "틀렸다"는 신호다. 알베도/온실효과가 clamp 한계에 걸려 물리적으로 그
  // 조성의 평형 자체가 존재하지 않는 극단적인 경우에만 여전히 Energy Surplus/
  // Deficit으로 남고, 그때만 1단계 문제부터 다시 시도한다(그 1단계 문제를 틀리면
  // solveProblem이 목숨을 깎는다 - 아이템을 잘못 고른 것 자체는 목숨을 깎지 않음).
  // 에너지가 균형에 도달했다면(Cold/Earth-like/Warm Stable 중 하나) 2단계로 넘어가고,
  // 지구형 범위 밖이면 2단계(finalizeGame)의 CO2 자동 조정이 마무리를 담당한다.
  useItem: async (item) => {
    const { physicsResult } = get();
    const { values, setValue } = useClimateStore.getState();

    if (!physicsResult) return;

    get().addItem(`${item.emoji} ${item.name}`);
    setValue(item.key, nextSliderValues(values, item)[item.key]);

    set({ isComputing: true });
    try {
      const { physics, ml } = await computeSettledResult();
      const balanced = STABLE_LABELS.has(ml.label);
      const lines = describeItemJudgment(item, physicsResult, physics, ml.label);
      set({
        physicsResult: physics,
        mlResult: ml,
        notice: { ok: balanced, lines },
        currentStage: balanced ? GAME_STAGES.FINAL : GAME_STAGES.PROBLEM1,
        currentProblem: pickRandom(balanced ? STAGE2_QUESTIONS : STAGE1_QUESTIONS),
      });
    } catch (err) {
      console.error("[useGameStore] 아이템 효과 재계산 실패:", err);
    } finally {
      set({ isComputing: false });
    }
  },

  // 정답이면 true, 오답이면 false를 반환한다(호출부가 오답 메시지를 띄울 때 사용).
  solveProblem: (answer) => {
    const { currentProblem, currentStage, wrongCount } = get();
    if (!currentProblem) return false;

    if (answer !== currentProblem.answer) {
      const nextWrongCount = wrongCount + 1;
      // 2단계 문제를 틀리면 그동안 쌓인 진행 체크(finalAttempts)도 전부 초기화된다 -
      // 목숨은 깎이고, 안정화 진행도는 처음부터 다시 쌓아야 한다.
      set(currentStage === GAME_STAGES.FINAL ? { wrongCount: nextWrongCount, finalAttempts: 0 } : { wrongCount: nextWrongCount });
      if (nextWrongCount >= MAX_WRONG_COUNT) {
        get().goReport("life_over");
      }
      return false;
    }

    if (currentStage === GAME_STAGES.FINAL) {
      // Final 문제는 게임을 끝내는 문제가 아니라 최종 확인 단계다.
      get().finalizeGame();
    } else {
      set({ currentStage: GAME_STAGES.ITEM, notice: null });
    }
    return true;
  },

  // 2단계 문제 정답 후 호출된다(오답은 solveProblem이 이미 처리하고 여긴 오지
  // 않는다 - 그래서 여기서는 절대 목숨을 깎지 않는다). 안정화 진행(finalAttempts)을
  // 한 칸 채우고, 3번째 칸을 채우는 순간 성공한다 - 조성이 우연히 이미 Earth-like
  // Stable이든(nextProblem 참고) CO2를 조정해가는 중이든 항상 "정답 3번"이 승리
  // 조건이다. 아직 지구형 범위 밖이면 CO2를 부족한 방향으로 조정하고(3번째 칸을
  // 채우는 시도에서는 무한 루프를 막기 위해 정확히 평형이 되도록 강제 조정),
  // 다음 2단계 문제로 이어간다.
  finalizeGame: async () => {
    const { mlResult, physicsResult, finalAttempts } = get();
    const nextAttempt = finalAttempts + 1;
    const forceStable = nextAttempt >= MAX_FINAL_ATTEMPTS;
    const alreadyStable = mlResult?.label === EARTH_LIKE_STABLE_LABEL;

    if (alreadyStable) {
      set({
        finalAttempts: nextAttempt,
        notice: { ok: true, lines: ["🌍 이미 지구형 평형 상태입니다.", `안정화 확인 ${nextAttempt}/${MAX_FINAL_ATTEMPTS}`] },
      });
      if (forceStable) {
        get().goReport("planet_stabilized");
        return;
      }
      set({ currentStage: GAME_STAGES.FINAL, currentProblem: pickRandom(STAGE2_QUESTIONS) });
      return;
    }

    set({ isComputing: true });
    try {
      const { values, setValue } = useClimateStore.getState();
      const prevCo2Slider = values.co2;

      if (forceStable) {
        const climateInputs = mapSlidersToClimateInputs(values);
        const co2Ppm = co2PpmForTargetTemperature(climateInputs, physicsResult.absorbedRadiation, REFERENCE_TEMP_K);
        setValue("co2", co2PpmToSlider(co2Ppm));
      } else {
        const direction = mlResult.label === "Warm Stable" ? -1 : 1;
        setValue("co2", Math.min(100, Math.max(0, values.co2 + direction * FINAL_CO2_STEP)));
      }

      const newCo2Slider = useClimateStore.getState().values.co2;
      const co2Increased = newCo2Slider === prevCo2Slider ? null : newCo2Slider > prevCo2Slider;
      const { physics, ml } = await computeSettledResult();
      const lines = describeFinalizeJudgment(physicsResult, physics, ml.label, { co2Increased });
      set({
        physicsResult: physics,
        mlResult: ml,
        finalAttempts: nextAttempt,
        notice: { ok: ml.label === EARTH_LIKE_STABLE_LABEL, lines },
      });
    } catch (err) {
      console.error("[useGameStore] 최종 확인 재계산 실패:", err);
    } finally {
      set({ isComputing: false });
    }

    if (forceStable) {
      get().goReport("planet_stabilized");
      return;
    }

    set({ currentStage: GAME_STAGES.FINAL, currentProblem: pickRandom(STAGE2_QUESTIONS) });
  },

  goReport: (reason = null) => set({ currentStage: GAME_STAGES.REPORT, gameOverReason: reason }),

  resetGame: () =>
    set({
      currentStage: GAME_STAGES.CREATOR,
      inventory: [],
      currentProblem: null,
      wrongCount: 0,
      finalAttempts: 0,
      physicsResult: null,
      mlResult: null,
      isComputing: false,
      notice: null,
      gameOverReason: null,
    }),
}));

export default useGameStore;
