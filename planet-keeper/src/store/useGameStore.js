import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";
import { STAGE3_QUESTIONS, STAGE4_QUESTIONS } from "../data/quizBank.js";
import { MOCK_ITEMS } from "../data/mockItems.js";
import useClimateStore, { CLIMATE_VARIABLES } from "./useClimateStore.js";
import {
  computeClimateV2,
  mapSlidersToClimateInputs,
  equilibriumTemperatureOf,
  stepTemperature,
  co2PpmForTargetTemperature,
  co2PpmToSlider,
  planetStateOf,
  PLANET_STATES,
  REFERENCE_TEMP_K,
  ENERGY_BALANCE_EPSILON,
  ENERGY_SCALE,
} from "../utils/physicsEngine.js";
import { describeItemJudgment, describeFinalizeJudgment } from "../utils/planetAnalysis.js";

// 게임 진행(문제/아이템/오답 횟수) 전용 store. 행성 슬라이더 값은 useClimateStore가
// 들고 있고, 여기서는 아이템 사용 시 그 값을 바꾸고 물리엔진을 재계산한다.
//
// 전체 흐름: 행성 생성 -> Physics(초기 판정 - 조성이 우연히 이미 Earth-like
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
// energyStateOf 기준 "에너지가 평형(|ΔE|≤epsilon)인" 세 상태 - 아이템
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
// 이 현상이 일어난다"가 항상 실제 ΔE와 맞아떨어지게 하려는 것이다. warning은 경고
// 단계(triggerClimateEvent)에서, message는 응답 시간이 끝나 실제로 적용될 때
// (resolveClimateEvent가 플레이어 대응이 없었을 때의 fallback으로) 보여준다.
const WARMING_EVENTS = [
  { key: "co2", delta: 1, warning: "🌡️ CO₂가 배출되려 합니다!", message: "🌡️ CO₂가 배출되었습니다." },
  { key: "iceThickness", delta: -1, warning: "🧊 빙하가 녹으려 합니다!", message: "🧊 빙하가 녹았습니다." },
  { key: "cloud", delta: -1, warning: "☁️ 구름이 옅어지려 합니다!", message: "☁️ 구름이 옅어졌습니다." },
];
const COOLING_EVENTS = [
  { key: "iceThickness", delta: 1, warning: "🧊 빙하가 늘어나려 합니다!", message: "🧊 빙하가 늘어났습니다." },
  { key: "co2", delta: -1, warning: "🌡️ CO₂가 줄어들려 합니다!", message: "🌡️ CO₂가 줄어들었습니다." },
];

// 이상기후 경고 사이 간격(초) - 매번 이 범위에서 무작위로 다음 시각을 정한다
// (정확히 고정 주기로 오면 예측 가능해지므로 약간의 무작위성을 둔다). tickSecond가
// elapsedSeconds(1초마다 증가하는 총 경과 시간)가 nextClimateEventAt을 넘을 때마다
// triggerClimateEvent를 부른다(이미 응답 대기 중인 경고가 있으면 새로 뽑지 않는다).
const CLIMATE_EVENT_INTERVAL_RANGE = [15, 25];
function pickClimateEventInterval() {
  const [min, max] = CLIMATE_EVENT_INTERVAL_RANGE;
  return min + Math.floor(Math.random() * (max - min + 1));
}
// 경고가 뜬 뒤 플레이어가 슬라이더(행성 만들기와 같은 5개 전부를 보여준다)로
// 대응할 수 있는 시간(초). 이 안에 손대지 않으면 resolveClimateEvent가 경고에
// 걸린 그대로(기존 자동 악화와 동일하게) 적용한다.
export const CLIMATE_EVENT_RESPONSE_SECONDS = 5;

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
// ΔE 단위(W/m²)라 SOLAR_CONSTANT 스케일을 따라간다 - 0.01은 S=100 기준으로 잡은 값이다.
// ItemInfoModal("지금 사용하면" 미리보기)도 같은 기준을 써야 판정이 어긋나지 않는다.
export const ITEM_EFFECT_EPSILON = 0.01 * ENERGY_SCALE;

// 이 아이템을 지금 조성/온도에 적용하면 ΔE가 실제로 얼마나 움직이는지(적용 전후
// 차이). 정적 태그가 아니라 매번 물리엔진으로 직접 계산한다 - 정적 태그만 보면
// clamp에 걸려 효과가 0인 아이템도 "맞는 방향"으로 보이기 때문이다.
export function itemDeltaEnergyChange(item, values, currentTemperature) {
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

// 행성 상태(0~4) 판정. 예전에는 학습된 ONNX 모델(climateClassifier.js)이 했지만,
// 라벨은 ΔE와 온도만으로 완전히 결정되므로 모델은 물리 규칙의 근사(정확도 0.9694)에
// 지나지 않았다. 물리엔진의 planetStateOf를 직접 쓰면 근사가 아니라 정확값이 나온다.
function classifyPlanetState(physics) {
  const state = planetStateOf(physics.deltaEnergy, physics.currentTemperature);
  return { state, label: PLANET_STATES[state].label };
}

// 행성 생성 직후의 있는 그대로의 스냅샷: 온도를 건드리지 않고 지금 조성이
// 에너지 과다/부족 상태인지를 보여준다(대개 Energy Surplus/Deficit).
function computeSnapshotResult() {
  const { values, currentTemperature } = useClimateStore.getState();
  const climateInputs = mapSlidersToClimateInputs(values);
  const physics = computeClimateV2({ ...climateInputs, currentTemperature });
  return { physics, ml: classifyPlanetState(physics) };
}

// 조성이 실제로 평형에 도달하면 어떻게 되는지를 바로 계산한다(finalizeGame이
// 2단계 CO2를 조정한 뒤 쓴다 - 2단계는 "정답 3번"이 승리 조건이라 매번 완전히
// settle해도 무한 루프가 되지 않는다). equilibriumTemperatureOf는 어떤 온도를
// 넣어 계산하든 같은 결과가 나오므로(조성에만 의존, 수학적으로 입력 온도와 무관)
// 지금 온도를 그대로 넣어도 된다. 여기서 실제로 currentTemperature를 이 평형온도로
// 갱신해 둔다.
function computeSettledResult() {
  const { values, currentTemperature, setCurrentTemperature } = useClimateStore.getState();
  const climateInputs = mapSlidersToClimateInputs(values);
  const rawPhysics = computeClimateV2({ ...climateInputs, currentTemperature });
  const settledTemperature = equilibriumTemperatureOf(rawPhysics);

  setCurrentTemperature(settledTemperature);

  const physics = computeClimateV2({ ...climateInputs, currentTemperature: settledTemperature });
  return { physics, ml: classifyPlanetState(physics) };
}

// 1단계 아이템 적용 직후 - 온도는 그대로 둔 채 새 조성으로 ΔE가 어떻게 움직이는지
// 본다. 완전히 settle하면(computeSettledResult) 항상 ΔE≈0이 되어 아이템이 맞는
// 방향이었는지 구분할 수 없으므로, 여기서는 딱 한 걸음(stepTemperature, 최대
// MAX_TEMPERATURE_STEP_K)만 그 ΔE 방향으로 온도를 옮긴다. 맞는 방향 아이템은
// |ΔE|가 줄고 온도도 조금 개선되며, 틀린 방향이면 |ΔE|가 커지고 평형온도 자체가
// 더 극단으로 이동한다 - 여러 번의 아이템 선택에 걸쳐 서서히 수렴하거나 악화된다.
function computeItemStepResult(nextValues) {
  const { currentTemperature, setCurrentTemperature } = useClimateStore.getState();
  const climateInputs = mapSlidersToClimateInputs(nextValues);
  const immediate = computeClimateV2({ ...climateInputs, currentTemperature });
  const nextTemperature = stepTemperature(currentTemperature, immediate.deltaEnergy);

  setCurrentTemperature(nextTemperature);

  const physics = computeClimateV2({ ...climateInputs, currentTemperature: nextTemperature });
  return { physics, ml: classifyPlanetState(physics) };
}

// 아이템 효과를 적용한 다음 슬라이더 값(0~100 범위로 clamp).
function nextSliderValues(values, item) {
  const nextValue = Math.min(100, Math.max(0, values[item.key] + item.delta));
  return { ...values, [item.key]: nextValue };
}

const useGameStore = create(
  persist(
    (set, get) => ({
  currentStage: GAME_STAGES.CREATOR,
  inventory: [],
  // ITEM 단계에 보여줄 무작위 후보(ITEM_CHOICES_SHOWN개) - solveProblem이 ITEM으로
  // 넘어갈 때마다 pickVisibleItems로 새로 채운다.
  visibleItems: [],
  // 행성 생성 시점의 슬라이더 조성 스냅샷 - replayGame이 "같은 행성으로 다시
  // 시작"할 때 이 값으로 되돌린다. nextProblem이 채운다.
  initialValues: null,
  // 리포트 페이지의 "행성 변화 타임라인" - 행성 생성/아이템 사용/최종 확인마다
  // { stage: "초기"|"아이템"|"최종", label, physics, ml } 하나씩 쌓인다.
  timeline: [],
  // 리포트 페이지의 "문제 풀이 결과" - 1단계/2단계 문제를 풀 때마다
  // { title, choices, selectedAnswer, correctAnswer, correct, explanation, concepts, isRetry, stage } 하나씩 쌓인다.
  quizLog: [],
  // 이번 플레이에서 한 번이라도 출제된 문제 id 집합 - pickNextProblem이 "아직 안
  // 나온 문제 우선" 판단에 쓴다.
  seenIds: new Set(),
  // 이번 플레이에서 정답을 맞힌 문제 id 집합 - pickNextProblem이 다시는 출제하지 않는다.
  correctIds: new Set(),
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
  // 응답 대기 중인 이상기후 경고 - { key, delta, warning, message, startValues,
  // expiresAt } | null. 뜬 직후에는 슬라이더를 바꾸지 않고 이 필드만 채워서
  // GamePage가 슬라이더 5개 + 카운트다운을 보여주게 한다. resolveClimateEvent가
  // expiresAt(elapsedSeconds 기준)에 도달하면 실제로 값을 적용한다.
  pendingClimateEvent: null,
  // 다음 이상기후 경고를 몇 초째에 다시 검토할지(elapsedSeconds 기준) - tickSecond가
  // 이 시각을 넘을 때마다 triggerClimateEvent를 부른다. 매번 새 무작위 간격으로
  // 다시 잡힌다(pickClimateEventInterval).
  nextClimateEventAt: pickClimateEventInterval(),
  // 타이머가 돈 총 경과 시간(초) - GamePage가 1초마다 +1 하고, REPORT로 넘어가면
  // 더 이상 증가하지 않아 그 값 그대로 ReportPage에서 "총 걸린 시간"으로 보여준다.
  elapsedSeconds: 0,
  // REPORT 단계로 넘어간 이유: "planet_stabilized"(성공) | "life_over"(실패) | null(진행 중)
  gameOverReason: null,

  addItem: (item) => set((state) => ({ inventory: [...state.inventory, item] })),

  pushTimeline: (stage, label, physics, ml) =>
    set((state) => ({ timeline: [...state.timeline, { stage, label, physics, ml }] })),

  // 이번 플레이에서 정답을 맞힌 문제(correctIds)는 절대 다시 내지 않는다. 아직 한
  // 번도 안 나온 문제(seenIds에 없는 것)를 우선 내고, 풀 전체가 이미 나왔으면
  // 틀렸던 문제 중에서 재출제한다(반환값의 isRetry로 표시 - QuizModal/ReportPage가
  // "재도전 문제" 배지를 보여준다). 정답 처리된 것을 빼고도 후보가 하나도 없는
  // 극단적인 경우(사실상 거의 불가능한 안전망)만 전체 풀에서 다시 무작위로 낸다.
  pickNextProblem: (pool) => {
    const { seenIds, correctIds } = get();
    const available = pool.filter((q) => !correctIds.has(q.id));
    const unseen = available.filter((q) => !seenIds.has(q.id));
    const isRetry = unseen.length === 0 && available.length > 0;
    const question = pickRandom(unseen.length > 0 ? unseen : available.length > 0 ? available : pool);

    set((state) => ({ seenIds: new Set(state.seenIds).add(question.id) }));
    return { ...question, isRetry };
  },

  // 지금 ΔE 부호를 보고 악화 방향(온난화/냉각)을 정한 뒤, 그 방향 후보 중 하나를
  // 무작위로 골라 경고만 띄운다(아직 슬라이더는 바꾸지 않음). 이미 펜딩 경고가
  // 떠 있으면(응답 시간이 아직 안 끝났으면) 겹쳐서 새로 뽑지 않는다. 이미 평형
  // (|ΔE|≤ENERGY_BALANCE_EPSILON)이면 악화시킬 방향이 없으므로 아무것도 하지 않는다.
  triggerClimateEvent: () => {
    const { physicsResult, pendingClimateEvent, elapsedSeconds } = get();
    if (!physicsResult || pendingClimateEvent) return;
    // 이번에 실제로 경고가 뜨는지와 무관하게 다음 검토 시각을 항상 다시 잡는다 -
    // 안 그러면 이미 평형이라 pool이 없는 동안 매초 다시 시도하게 된다.
    set({ nextClimateEventAt: elapsedSeconds + pickClimateEventInterval() });

    const { deltaEnergy } = physicsResult;
    const pool =
      deltaEnergy > ENERGY_BALANCE_EPSILON ? WARMING_EVENTS : deltaEnergy < -ENERGY_BALANCE_EPSILON ? COOLING_EVENTS : null;
    if (!pool) return;

    const event = pickRandom(pool);
    const { values } = useClimateStore.getState();
    set({
      pendingClimateEvent: {
        ...event,
        startValues: { ...values },
        expiresAt: elapsedSeconds + CLIMATE_EVENT_RESPONSE_SECONDS,
      },
      climateEvent: event.warning,
    });
  },

  // pendingClimateEvent의 응답 시간이 끝나면 tickSecond가 부른다. 플레이어가 미니
  // 슬라이더를 이미 움직여 뒀으면(useClimateStore.setValue로 실시간 반영됨) 그
  // 값 그대로 재계산하고, 손대지 않았으면 경고에 걸린 원래 방향으로 강제
  // 적용한다(기존 자동 악화와 동일한 fallback). 조성이 바뀌면 평형온도가 움직이고
  // advanceTemperature가 그 방향으로 currentTemperature를 조금씩 옮긴다. 상태
  // 재판정은 아이템 사용/최종 확인 같은 실제 행동 시점에만 하므로 여기서는 안
  // 한다. 성공/실패 어느 쪽이든 pushTimeline을 불러 리포트 타임라인에 남긴다 -
  // 예전 applyClimateEvent는 이걸 전혀 남기지 않아 방치 중 변화가 타임라인에서
  // 통째로 빠져 있었다.
  resolveClimateEvent: () => {
    const { pendingClimateEvent, physicsResult: before } = get();
    if (!pendingClimateEvent || !before) return;

    const { key, delta, startValues, message } = pendingClimateEvent;
    const { values, setValue, advanceTemperature } = useClimateStore.getState();
    // 경고가 지목한 슬라이더가 아니어도(행성 만들기 때와 같은 5개 전부를 보여준다)
    // 뭐라도 움직였으면 "대응했다"로 본다 - 성공 여부는 아래 물리엔진 재계산이
    // |ΔE| 변화로 판정한다.
    const playerActed = CLIMATE_VARIABLES.some((v) => values[v.key] !== startValues[v.key]);

    if (!playerActed) {
      setValue(key, nextSliderValues(values, { key, delta })[key]);
    }

    advanceTemperature();
    const { values: nextValues, currentTemperature } = useClimateStore.getState();
    const physics = computeClimateV2({ ...mapSlidersToClimateInputs(nextValues), currentTemperature });

    const worsened = Math.abs(physics.deltaEnergy) > Math.abs(before.deltaEnergy) + ITEM_EFFECT_EPSILON;
    const improved = Math.abs(physics.deltaEnergy) < Math.abs(before.deltaEnergy) - ITEM_EFFECT_EPSILON;
    const resultMessage = !playerActed
      ? message
      : improved
        ? `✅ 반대로 대응해서 위기를 막았습니다!`
        : worsened
          ? `⚠️ 반대 방향으로 대응했지만 오히려 악화됐습니다.`
          : `🤝 대응했지만 위기를 상쇄하는 데 그쳤습니다.`;

    get().pushTimeline("이상기후", resultMessage, physics, null);
    set({ physicsResult: physics, climateEvent: resultMessage, pendingClimateEvent: null });
  },

  // GamePage가 1초마다 부르는 심장박동 - 경과 시간을 늘리고, 펜딩 경고의 응답
  // 시간이 끝났으면 resolveClimateEvent로 마무리하고, 아니면(펜딩 경고가 없을
  // 때만) nextClimateEventAt을 넘겼을 때 새 경고를 검토한다.
  tickSecond: () => {
    const elapsedSeconds = get().elapsedSeconds + 1;
    set({ elapsedSeconds });

    const { pendingClimateEvent, nextClimateEventAt, currentStage } = get();
    if (pendingClimateEvent) {
      if (elapsedSeconds >= pendingClimateEvent.expiresAt) {
        get().resolveClimateEvent();
      }
      return;
    }
    // 아이템 선택/2단계 문제 풀이 중에는 새 경고를 띄우지 않는다 - 카드를 고르는
    // 중에 슬라이더 대응 UI까지 겹치면 어느 쪽에 반응해야 할지 헷갈린다.
    // nextClimateEventAt은 그대로 둬서, 이 단계를 벗어나는 다음 tick에 밀린
    // 경고가 바로 뜬다(더 미뤄지지 않음).
    const overlapsOtherStage = currentStage === GAME_STAGES.ITEM || currentStage === GAME_STAGES.FINAL;
    if (!overlapsOtherStage && elapsedSeconds >= nextClimateEventAt) {
      get().triggerClimateEvent();
    }
  },

  // CREATOR -> PROBLEM1. 지금 조성의 있는 그대로의 에너지 상태를 물리엔진으로
  // 보여준 뒤 1단계 문제로 진행한다. 만든 조성이 우연히 이미 Earth-like Stable이면
  // 고칠 게 없으니 1단계/아이템 없이 2단계 확인 문제로 바로 간다(그래도 성공은
  // finalizeGame의 안정화 체크 3번을 다 채워야 한다 - 즉시 성공 처리하지 않음).
  nextProblem: async () => {
    if (get().currentStage !== GAME_STAGES.CREATOR) return;

    set({ isComputing: true, initialValues: { ...useClimateStore.getState().values } });
    try {
      const { physics, ml } = computeSnapshotResult();
      set({ physicsResult: physics, mlResult: ml });
      get().pushTimeline("초기", "행성 생성", physics, ml);

      if (ml.label === EARTH_LIKE_STABLE_LABEL) {
        set({ currentStage: GAME_STAGES.FINAL, currentProblem: get().pickNextProblem(STAGE4_QUESTIONS) });
        return;
      }
    } catch (err) {
      console.error("[useGameStore] 초기 물리엔진 계산 실패:", err);
    } finally {
      set({ isComputing: false });
      if (get().currentStage === GAME_STAGES.CREATOR) {
        set({ currentStage: GAME_STAGES.PROBLEM1, currentProblem: get().pickNextProblem(STAGE3_QUESTIONS) });
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
      const { physics, ml } = computeItemStepResult(nextValues);
      const balanced = STABLE_LABELS.has(ml.label);
      const lines = describeItemJudgment(item, physicsResult, physics, ml.label);
      get().pushTimeline("아이템", `${item.emoji} ${item.name}`, physics, ml);
      set({
        physicsResult: physics,
        mlResult: ml,
        notice: { ok: balanced, lines },
        currentStage: balanced ? GAME_STAGES.FINAL : GAME_STAGES.PROBLEM1,
        currentProblem: get().pickNextProblem(balanced ? STAGE4_QUESTIONS : STAGE3_QUESTIONS),
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

    const correct = answer === currentProblem.answer;
    set((state) => ({
      quizLog: [
        ...state.quizLog,
        {
          id: currentProblem.id,
          title: currentProblem.title,
          selectedAnswer: answer,
          correctAnswer: currentProblem.answer,
          explanation: currentProblem.explanation,
          concepts: currentProblem.concepts,
          isRetry: currentProblem.isRetry ?? false,
          correct,
          stage: currentStage,
        },
      ],
      // 정답을 맞힌 문제는 pickNextProblem이 다시는 후보에 넣지 않도록 기록한다.
      ...(correct ? { correctIds: new Set(state.correctIds).add(currentProblem.id) } : {}),
    }));

    if (!correct) {
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
    const { physicsResult, finalAttempts } = get();
    const nextAttempt = finalAttempts + 1;
    const forceStable = nextAttempt >= MAX_FINAL_ATTEMPTS;

    set({ isComputing: true });
    try {
      // mlResult는 캐시다 - resolveClimateEvent(이상기후)는 physicsResult(진짜 ΔE)만
      // 갱신하고 mlResult는 그대로 둔다. 그래서 "예전에 한 번 Earth-like Stable을
      // 찍었다"는 사실만 보고 alreadyStable을 판정하면, 그 이후 방치 중 이상기후로
      // ΔE가 한참 벗어났는데도 옛 라벨을 그대로 우려먹어 성공 처리해버리는 버그가
      // 있었다. 지름길을 타기 전에 항상 지금 physicsResult로 다시 판정한다.
      const climateInputs = mapSlidersToClimateInputs(useClimateStore.getState().values);
      const freshMl = classifyPlanetState(physicsResult);
      const alreadyStable = freshMl.label === EARTH_LIKE_STABLE_LABEL;

      if (alreadyStable) {
        get().pushTimeline("최종", `최종 확인 ${nextAttempt}/${MAX_FINAL_ATTEMPTS}`, physicsResult, freshMl);
        set({
          mlResult: freshMl,
          finalAttempts: nextAttempt,
          notice: { ok: true, lines: ["🌍 이미 지구형 평형 상태입니다.", `안정화 확인 ${nextAttempt}/${MAX_FINAL_ATTEMPTS}`] },
        });
      } else {
        const { values, setValue } = useClimateStore.getState();
        const prevCo2Slider = values.co2;

        if (forceStable) {
          const co2Ppm = co2PpmForTargetTemperature(climateInputs, physicsResult.absorbedRadiation, REFERENCE_TEMP_K);
          setValue("co2", co2PpmToSlider(co2Ppm));
        } else {
          const direction = freshMl.label === "Warm Stable" ? -1 : 1;
          setValue("co2", Math.min(100, Math.max(0, values.co2 + direction * FINAL_CO2_STEP)));
        }

        const newCo2Slider = useClimateStore.getState().values.co2;
        const co2Increased = newCo2Slider === prevCo2Slider ? null : newCo2Slider > prevCo2Slider;
        const { physics, ml } = computeSettledResult();
        const lines = describeFinalizeJudgment(physicsResult, physics, ml.label, { co2Increased });
        get().pushTimeline("최종", `최종 확인 ${nextAttempt}/${MAX_FINAL_ATTEMPTS}`, physics, ml);
        set({
          physicsResult: physics,
          mlResult: ml,
          finalAttempts: nextAttempt,
          notice: { ok: ml.label === EARTH_LIKE_STABLE_LABEL, lines },
        });
      }
    } catch (err) {
      console.error("[useGameStore] 최종 확인 재계산 실패:", err);
    } finally {
      set({ isComputing: false });
    }

    if (forceStable) {
      get().goReport("planet_stabilized");
      return;
    }

    set({ currentStage: GAME_STAGES.FINAL, currentProblem: get().pickNextProblem(STAGE4_QUESTIONS) });
  },

  goReport: (reason = null) => set({ currentStage: GAME_STAGES.REPORT, gameOverReason: reason }),

  resetGame: () =>
    set({
      currentStage: GAME_STAGES.CREATOR,
      inventory: [],
      visibleItems: [],
      initialValues: null,
      timeline: [],
      quizLog: [],
      seenIds: new Set(),
      correctIds: new Set(),
      currentProblem: null,
      wrongCount: 0,
      finalAttempts: 0,
      physicsResult: null,
      mlResult: null,
      isComputing: false,
      notice: null,
      climateEvent: null,
      pendingClimateEvent: null,
      nextClimateEventAt: pickClimateEventInterval(),
      elapsedSeconds: 0,
      gameOverReason: null,
    }),

  // "다시 플레이" - 행성을 새로 만들지 않고 이번에 만들었던 조성(initialValues) 그대로
  // 처음부터 다시 시작한다. "행성 다시 만들기"(resetClimate + /planet-create)와 달리
  // 슬라이더를 다시 만지지 않아도 된다.
  replayGame: async () => {
    const { initialValues } = get();
    get().resetGame();
    useClimateStore.setState({
      values: initialValues ? { ...initialValues } : useClimateStore.getState().values,
      currentTemperature: REFERENCE_TEMP_K,
    });
    await get().nextProblem();
  },
    }),
    {
      name: "planet-keeper-game",
      // SOLAR_CONSTANT를 100 -> 297.88로 바꾸면서 ΔE 스케일이 2.9788배가 됐다.
      // physicsResult/timeline에는 저장 시점 스케일의 ΔE가 그대로 들어 있어서,
      // 옛 저장본을 그대로 복원하면 새 판정 기준(epsilon 14.894)과 뒤섞인다 -
      // 예전 "+14.5"(= 지금 +43.2에 해당)가 평형 범위 안으로 잘못 읽혀서
      // 이상기후가 안 뜨거나, 아이템 후보 선정이 방향을 잃거나, 최종 확인이
      // 공짜로 통과되는 문제가 생긴다.
      //
      // 진행 중인 판의 ΔE를 일일이 환산하는 것보다 새로 시작하는 편이 안전하고,
      // 게임 한 판이 짧아 손실도 작다. 빈 객체를 반환하면 초기 상태와 병합되어
      // 사실상 초기화된다. 앞으로 저장 구조를 바꿀 때도 version을 올리면 된다.
      version: 1,
      migrate: () => ({}),
      // isComputing은 새로고침 순간의 진행 중 상태일 뿐이라 저장하지 않는다 -
      // 저장해두면 새로고침 시 항상 "계산하는 중..."에서 멈춘 것처럼 보인다.
      partialize: ({ isComputing: _isComputing, ...rest }) => rest,
      // seenIds/correctIds는 Set이라 JSON.stringify/parse가 기본으로는 배열로
      // 날려버린다 - Set임을 표시해뒀다가 복원 시 되돌린다.
      storage: createJSONStorage(() => localStorage, {
        replacer: (_key, value) => (value instanceof Set ? { __isSet: true, values: [...value] } : value),
        reviver: (_key, value) => (value?.__isSet ? new Set(value.values) : value),
      }),
    },
  ),
);

export default useGameStore;
