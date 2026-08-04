import { create } from "zustand";
import { STAGE1_QUESTIONS, STAGE2_QUESTIONS } from "../data/quizBank.js";
import { MOCK_ITEMS } from "../data/mockItems.js";
import useClimateStore from "./useClimateStore.js";
import {
  computeClimateV2,
  mapSlidersToClimateInputs,
  equilibriumTemperatureOf,
  stepTemperature,
  co2PpmForTargetTemperature,
  co2PpmToSlider,
  REFERENCE_TEMP_K,
  ENERGY_BALANCE_EPSILON,
} from "../utils/physicsEngine.js";
import { predictClimateState } from "../utils/climateClassifier.js";
import { describeItemJudgment, describeFinalizeJudgment } from "../utils/planetAnalysis.js";

// 게임 진행(문제/아이템/오답 횟수) 전용 store. 행성 슬라이더 값은 useClimateStore가
// 들고 있고, 여기서는 아이템 사용 시 그 값을 바꾸고 물리엔진/ML을 재계산한다.
//
// 전체 흐름: 행성 생성 -> Physics+ML(초기 판정 - 조성이 우연히 이미 Earth-like
// Stable이면 1단계/아이템 없이 2단계로 직행) -> 1단계 문제 -> 아이템 사용(완전히
// 평형까지 settle하지 않고 딱 한 걸음만 진행 - computeItemStepResult 참고. 맞는
// 방향 아이템이면 ΔE가 조금씩 0에 가까워지고, 틀린 방향이면 ΔE가 커지고 평형온도가
// 더 극단으로 이동해서 몇 번 더 골라야 할 수 있다) -> 에너지가 균형(Cold/Earth-like/
// Warm Stable 중 하나)이면 2단계로, 아직 아니면(Energy Surplus/Deficit 포함) 새
// 1단계 문제로 돌아가 아이템을 다시 고른다(그 1단계 문제 자체를 틀리면 solveProblem이
// 목숨을 깎는다 - 아이템을 잘못 고른 것만으로는 목숨이 깎이지 않음). 2단계 승리
// 조건은 항상 "정답 3번"(finalizeGame의
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

// 매 틱 지금 물리 상태(ΔE 부호)를 보고 어느 방향으로 악화시킬지 먼저 정한 뒤,
// 그 방향에 맞는 후보 중 하나를 무작위로 고른다 - "지금 에너지가 과다/부족하니까
// 이 현상이 일어난다"가 항상 실제 ΔE와 맞아떨어지게 하려는 것이다(ML은 최종
// 상태 판정만 하고, 방치 중 악화 방향은 물리 상태가 정한다). 스텝 크기는
// CLIMATE_TICK_INTERVAL_SECONDS 주기와 맞물려 방치 시 체감될 정도로 잡았다.
const WARMING_EVENTS = [
  { key: "co2", delta: 1, message: "🌡️ CO₂가 배출되고 있습니다." },
  { key: "iceThickness", delta: -1, message: "🧊 빙하가 녹고 있습니다." },
  { key: "cloud", delta: -1, message: "☁️ 구름이 옅어지고 있습니다." },
];
const COOLING_EVENTS = [
  { key: "iceThickness", delta: 1, message: "🧊 빙하가 늘어나고 있습니다." },
  { key: "co2", delta: -1, message: "🌡️ CO₂가 줄어들고 있습니다." },
];

// 몇 초마다 고정된 이상기후 이벤트를 한 번씩 적용할지. elapsedSeconds(1초마다
// 증가하는 총 경과 시간)가 이 배수가 될 때마다 GamePage가 applyClimateEvent를 부른다.
export const CLIMATE_TICK_INTERVAL_SECONDS = 3;

const pickRandom = (list) => list[Math.floor(Math.random() * list.length)];

// Fisher-Yates - 원본 배열은 건드리지 않는다.
function shuffled(list) {
  const arr = [...list];
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

// ITEM 단계에 보여줄 아이템은 9개 전부가 아니라 이 개수만 무작위로 고른다.
const ITEM_CHOICES_SHOWN = 4;

// 이보다 작은 ΔE 변화는 "효과 없음"으로 본다 - co2/atmThickness가 이미
// greenhouseStrength clamp(0.8) 상한에 걸린 경우 등, 슬라이더를 움직여도 실제로는
// 아무 것도 안 바뀌는 경우가 있다(부동소수 오차 여유도 겸한다).
const ITEM_EFFECT_EPSILON = 0.01;

// 이 아이템을 지금 조성/온도에 적용하면 ΔE가 실제로 얼마나 움직이는지(적용 전후
// 차이). 정적 태그가 아니라 매번 물리엔진으로 직접 계산한다 - 정적 태그만 보면
// clamp에 걸려 효과가 0인 아이템도 "맞는 방향"으로 보이기 때문이다.
function itemDeltaEnergyChange(item, values, currentTemperature) {
  const before = computeClimateV2({ ...mapSlidersToClimateInputs(values), currentTemperature }).deltaEnergy;
  const after = computeClimateV2({
    ...mapSlidersToClimateInputs(nextSliderValues(values, item)),
    currentTemperature,
  }).deltaEnergy;
  return after - before;
}

// 지금 ΔE 방향에 실제로 도움이 되는(clamp에 걸려 무효화되지 않은) 아이템이 후보에
// 최소 하나는 포함되도록 먼저 하나를 고정으로 뽑은 뒤, 나머지를 무작위로 채운다 -
// 안 그러면 무작위로 고른 4개가 전부 틀린 방향(또는 전부 효과 없는 아이템)이라
// 이번 라운드에 답이 없는 경우가 생길 수 있다.
function pickVisibleItems(deltaEnergy, values, currentTemperature) {
  const neededDirection =
    deltaEnergy > ENERGY_BALANCE_EPSILON ? "cooling" : deltaEnergy < -ENERGY_BALANCE_EPSILON ? "warming" : null;

  if (!neededDirection) return shuffled(MOCK_ITEMS).slice(0, ITEM_CHOICES_SHOWN);

  const working = MOCK_ITEMS.filter((item) => {
    const change = itemDeltaEnergyChange(item, values, currentTemperature);
    return neededDirection === "cooling" ? change < -ITEM_EFFECT_EPSILON : change > ITEM_EFFECT_EPSILON;
  });
  // 극단적으로 9개 전부 clamp에 걸려 효과가 없는 경우(사실상 거의 불가능한
  // 안전망) 보장 없이 무작위로만 채운다.
  if (working.length === 0) return shuffled(MOCK_ITEMS).slice(0, ITEM_CHOICES_SHOWN);

  const guaranteed = pickRandom(working);
  const rest = shuffled(MOCK_ITEMS.filter((item) => item.id !== guaranteed.id)).slice(0, ITEM_CHOICES_SHOWN - 1);
  return shuffled([guaranteed, ...rest]);
}

// 행성 생성 직후의 있는 그대로의 스냅샷: 온도를 건드리지 않고 지금 조성이
// 에너지 과다/부족 상태인지를 Physics+AI로 보여준다(대개 Energy Surplus/Deficit).
async function computeSnapshotResult() {
  const { values, currentTemperature } = useClimateStore.getState();
  const climateInputs = mapSlidersToClimateInputs(values);
  const physics = computeClimateV2({ ...climateInputs, currentTemperature });
  const ml = await predictClimateState(climateInputs, physics);
  return { physics, ml };
}

// 조성이 실제로 평형에 도달하면 어떻게 되는지를 바로 계산한다(finalizeGame이
// 2단계 CO2를 조정한 뒤 쓴다 - 2단계는 "정답 3번"이 승리 조건이라 매번 완전히
// settle해도 무한 루프가 되지 않는다). equilibriumTemperatureOf는 어떤 온도를
// 넣어 계산하든 같은 결과가 나오므로(조성에만 의존, 수학적으로 입력 온도와 무관)
// 지금 온도를 그대로 넣어도 된다. 여기서 실제로 currentTemperature를 이 평형온도로
// 갱신해 둔다.
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

// 1단계 아이템 적용 직후 - 온도는 그대로 둔 채 새 조성으로 ΔE가 어떻게 움직이는지
// 본다. 완전히 settle하면(computeSettledResult) 항상 ΔE≈0이 되어 아이템이 맞는
// 방향이었는지 구분할 수 없으므로, 여기서는 딱 한 걸음(stepTemperature, 최대
// MAX_TEMPERATURE_STEP_K)만 그 ΔE 방향으로 온도를 옮긴다. 맞는 방향 아이템은
// |ΔE|가 줄고 온도도 조금 개선되며, 틀린 방향이면 |ΔE|가 커지고 평형온도 자체가
// 더 극단으로 이동한다 - 여러 번의 아이템 선택에 걸쳐 서서히 수렴하거나 악화된다.
async function computeItemStepResult(nextValues) {
  const { currentTemperature, setCurrentTemperature } = useClimateStore.getState();
  const climateInputs = mapSlidersToClimateInputs(nextValues);
  const immediate = computeClimateV2({ ...climateInputs, currentTemperature });
  const nextTemperature = stepTemperature(currentTemperature, immediate.deltaEnergy);

  setCurrentTemperature(nextTemperature);

  const physics = computeClimateV2({ ...climateInputs, currentTemperature: nextTemperature });
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
  // ITEM 단계에 보여줄 무작위 후보(ITEM_CHOICES_SHOWN개) - solveProblem이 ITEM으로
  // 넘어갈 때마다 pickVisibleItems로 새로 채운다.
  visibleItems: [],
  currentProblem: null,
  wrongCount: 0,
  finalAttempts: 0,
  physicsResult: null,
  mlResult: null,
  isComputing: false,
  // 아이템 사용 결과 / 최종 확인 결과 메시지. { ok: boolean, lines: string[] } | null
  notice: null,
  // 방치 타이머가 마지막으로 일으킨 이상기후 이벤트 문구 - notice(아이템/최종 확인
  // 판정)와는 별개다. 판정 문구를 덮어쓰지 않도록 GamePage가 다른 자리에 표시한다.
  climateEvent: null,
  // 타이머가 돈 총 경과 시간(초) - GamePage가 1초마다 +1 하고, REPORT로 넘어가면
  // 더 이상 증가하지 않아 그 값 그대로 ReportPage에서 "총 걸린 시간"으로 보여준다.
  elapsedSeconds: 0,
  // REPORT 단계로 넘어간 이유: "planet_stabilized"(성공) | "life_over"(실패) | null(진행 중)
  gameOverReason: null,

  addItem: (item) => set((state) => ({ inventory: [...state.inventory, item] })),

  // 지금 ΔE 부호를 보고 악화 방향(온난화/냉각)을 정한 뒤, 그 방향 후보 중 하나를
  // 무작위로 골라 적용한다. 이미 평형(|ΔE|≤ENERGY_BALANCE_EPSILON)이면 악화시킬
  // 방향이 없으므로 아무것도 하지 않는다. 조성이 바뀌면 평형온도(equilibriumTemperatureOf)
  // 자체가 움직이고, advanceTemperature가 그 새 평형 방향으로 currentTemperature를
  // 조금씩 옮긴다. ML 재판정은 아이템 사용/최종 확인 같은 실제 행동 시점에만
  // 하므로 여기서는 안 한다.
  applyClimateEvent: () => {
    const { physicsResult } = get();
    if (!physicsResult) return;
    const { deltaEnergy } = physicsResult;
    const pool =
      deltaEnergy > ENERGY_BALANCE_EPSILON ? WARMING_EVENTS : deltaEnergy < -ENERGY_BALANCE_EPSILON ? COOLING_EVENTS : null;
    if (!pool) return;

    const event = pickRandom(pool);
    const { values, setValue, advanceTemperature } = useClimateStore.getState();
    setValue(event.key, nextSliderValues(values, event)[event.key]);
    advanceTemperature();
    const { values: nextValues, currentTemperature } = useClimateStore.getState();
    const physics = computeClimateV2({ ...mapSlidersToClimateInputs(nextValues), currentTemperature });
    set({ physicsResult: physics, climateEvent: event.message });
  },

  // GamePage가 1초마다 부르는 심장박동 - 경과 시간을 늘리고, CLIMATE_TICK_INTERVAL_SECONDS
  // 배수가 될 때마다 고정 이상기후를 한 번 적용한다.
  tickSecond: () => {
    const elapsedSeconds = get().elapsedSeconds + 1;
    set({ elapsedSeconds });
    if (elapsedSeconds % CLIMATE_TICK_INTERVAL_SECONDS === 0) {
      get().applyClimateEvent();
    }
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

  // 아이템 효과는 정답/오답 판정 없이 항상 실제로 슬라이더에 적용한 뒤,
  // computeItemStepResult로 딱 한 걸음만 진행한다(완전히 settle하지 않음) - 맞는
  // 방향 아이템이면 ΔE가 조금씩 0에 가까워지고 온도도 조금 개선되며, 틀린 방향이면
  // ΔE가 더 커지고 평형온도가 더 극단으로 이동한다. 한 번에 끝나지 않을 수 있으므로
  // (특히 틀린 아이템을 고른 뒤에는) 아직 지구형 범위 밖(Energy Surplus/Deficit
  // 포함)이면 새 1단계 문제로 돌아가 아이템을 다시 고른다(그 1단계 문제 자체를
  // 틀리면 solveProblem이 목숨을 깎는다 - 아이템을 잘못 고른 것 자체는 목숨을
  // 깎지 않음). 에너지가 균형에 도달했다면(Cold/Earth-like/Warm Stable 중 하나)
  // 2단계로 넘어가고, 지구형 범위 밖이면 2단계(finalizeGame)의 CO2 자동 조정이
  // 마무리를 담당한다.
  useItem: async (item) => {
    const { physicsResult } = get();
    const { values, setValue } = useClimateStore.getState();

    if (!physicsResult) return;

    get().addItem(`${item.emoji} ${item.name}`);
    const nextValues = nextSliderValues(values, item);
    setValue(item.key, nextValues[item.key]);

    set({ isComputing: true });
    try {
      const { physics, ml } = await computeItemStepResult(nextValues);
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
      const { physicsResult } = get();
      const { values, currentTemperature } = useClimateStore.getState();
      set({
        currentStage: GAME_STAGES.ITEM,
        notice: null,
        visibleItems: pickVisibleItems(physicsResult?.deltaEnergy ?? 0, values, currentTemperature),
      });
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
      visibleItems: [],
      currentProblem: null,
      wrongCount: 0,
      finalAttempts: 0,
      physicsResult: null,
      mlResult: null,
      isComputing: false,
      notice: null,
      climateEvent: null,
      elapsedSeconds: 0,
      gameOverReason: null,
    }),
}));

export default useGameStore;
