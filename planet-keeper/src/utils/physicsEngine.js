/**
 * physicsEngine.js — 기후 물리 엔진 (순수 함수)
 *
 * React state / UI / Three.js에 전혀 의존하지 않는 순수 계산 모듈이다.
 * 게임의 물리 계산과 상태 판정(planetStateOf)이 모두 여기서 나온다.
 *
 *   import { computeClimateV2, mapSlidersToClimateInputs } from ".../utils/physicsEngine"
 *
 * ------------------------------------------------------------------
 * 모델
 * ------------------------------------------------------------------
 *
 * Planet Keeper는 평형온도(Equilibrium Temperature)를 계산하는 모델이 아니라,
 * 현재 행성 상태(Current State)의 에너지 균형을 평가하는 0차원(0-D)
 * 에너지 수지 모델을 사용한다.
 *
 * 입력된 현재 온도(Current Temperature)를 그대로 이용하여
 *
 *   ASR = S · (1 − Albedo)
 *   OLR = ε · σ · T⁴
 *
 * 를 계산하고,
 *
 *   ΔE = ASR − OLR
 *
 * 를 통해 현재 행성이
 *
 *   • 에너지 과다(Energy Surplus)
 *   • 에너지 부족(Energy Deficit)
 *   • 에너지 평형(Stable)
 *
 * 중 어느 상태인지를 평가한다.
 *
 * 이 엔진은 현재 온도를 자동으로 변경하거나
 * 평형온도를 계산하지 않는다.
 * 온도 변화는 게임 로직 또는 사용자 조작이 담당한다.
 *
 * ------------------------------------------------------------------
 * 기준 수치 (PLAN.md)
 * ------------------------------------------------------------------
 *
 * - TOA 하향단파복사속 기준 상수 S = 297.88 W/m² (KIM 실측)
 * - CO₂ 기준 농도 = 432 ppm
 * - 기준 온도 = 288 K
 */

// 라벨 임계값은 실측 데이터에서 도출된 생성 파일에서 읽는다.
// (data-pipeline/Analysis/derive_thresholds.py → src/data/climateThresholds.js)
import { COLD_STABLE_MAX_K, EARTH_LIKE_MAX_K } from "../data/climateThresholds.js"

// ── 과학적 기준 상수 (PLAN.md) ──────────────────────────────────
// TOA 하향단파복사. KIM 전지구 필드 평균 실측값(physics_reference.csv의 dswrtoa
// = 297.8821 W/m²)을 소수 둘째 자리로 반올림해서 쓴다.
//
// 계획서는 이 값을 100으로 두고 시작했고, 아래 ΔE 기반 상수들(평형 허용오차,
// 온도 틱)은 전부 그 스케일에서 보정된 값이다. S를 실측값으로 바꾸면 ΔE 전체가
// ENERGY_SCALE 배로 커지므로, 그 상수들도 같은 배율로 환산해야 판정이 유지된다.
// 숫자를 손으로 다시 적지 않고 SOLAR_CONSTANT에서 유도하는 이유가 이것이다 —
// 하나만 고치고 나머지를 빠뜨리면 에러 없이 조용히 판정 기준선만 어긋난다.
export const SOLAR_CONSTANT = 297.88 // TOA 하향단파복사속 기준 (KIM 실측)
// ΔE 단위(W/m²)로 표현된 임계값을 가진 다른 모듈들도 이 배율을 써서 환산한다.
export const ENERGY_SCALE = SOLAR_CONSTANT / 100 // 계획서 기준 스케일(S=100) 대비 배율
export const CO2_BASELINE_PPM = 432 // 기상청 안면도 실측 기준 배경 농도
export const REFERENCE_TEMP_K = 288 // 지구 평균 지표 기온(≈15°C) — 보정 목표값

const clamp = (x, lo, hi) => Math.min(hi, Math.max(lo, x))

/**
 * 지표/대기 구성에 따른 행성 알베도(반사율, 0~1).
 * 빙하·구름은 반사율을 높이고, 바다는 어두워 반사율을 살짝 낮춘다.
 *
 * 구름 계수 0.5는 개발계획서 (3)1의 알베도 공식(구름량 × 0.5)에서 온 값이다.
 * 이전 구현은 0.3이었는데, 그러면 기준 조성(빙하 0.1 / 바다 0.7 / 구름 0.3)의
 * 행성 알베도가 0.22가 되어 계획서 데이터 표의 지구 평균 0.30과 어긋났다.
 *
 *   구름 0.3 → 지표면분 0.130 + 구름분 0.090 = 0.220
 *   구름 0.5 → 지표면분 0.130 + 구름분 0.150 = 0.280   ← 실제 지구 ≈0.30
 *
 * 지표면분(0.130)은 실제 지구와 이미 맞았고, 어긋난 항은 구름 기여 하나였다.
 * 실제 지구에서도 행성 알베도의 절반 이상이 구름 몫이다.
 */
export function albedoOf({ glacierRatio, oceanRatio, cloudRatio }) {
  return clamp(
    0.12 + 0.45 * glacierRatio + 0.5 * cloudRatio - 0.05 * oceanRatio,
    0.05,
    0.9,
  )
}

/**
 * 온실효과 강도(0~0.8). 값이 클수록 지표 복사를 더 많이 되잡아 온난화된다.
 * CO₂는 로그 응답(복사강제력 ∝ log), 대기 두께와 구름도 기여한다.
 */
function greenhouseStrengthOf({ co2Ppm, atmThickness, cloudRatio }) {
  const co2Term = 0.25 * Math.log2(Math.max(co2Ppm, 1) / CO2_BASELINE_PPM)
  const atmTerm = 0.35 * (atmThickness - 1) // atmThickness=1 이 지구 기준
  const cloudTerm = 0.1 * cloudRatio
  return clamp(0.3 + co2Term + atmTerm + cloudTerm, 0, 0.8)
}

// 지구 기준 상태(288 K)에서 ASR ≈ OLR(deltaEnergy ≈ 0)가 되도록
// 유효 σ(EFFECTIVE_SIGMA)를 보정한다.
const BASELINE_STATE = {
  glacierRatio: 0.1,
  oceanRatio: 0.7,
  cloudRatio: 0.3,
  atmThickness: 1,
  co2Ppm: CO2_BASELINE_PPM,
}
const ABSORBED_BASE = SOLAR_CONSTANT * (1 - albedoOf(BASELINE_STATE))
const EMISSIVITY_BASE = 1 - greenhouseStrengthOf(BASELINE_STATE)
const EFFECTIVE_SIGMA =
  ABSORBED_BASE / (EMISSIVITY_BASE * Math.pow(REFERENCE_TEMP_K, 4))

/**
 * 환경 변수와 현재 온도로부터 현재 에너지 수지를 계산한다.
 *
 * 평형온도를 계산하지 않으며,
 * 입력된 현재 온도에서 ASR, OLR, deltaEnergy를 계산하여
 * 현재 기후 상태를 평가한다.
 *
 * @param {object} inputs
 * @param {number} inputs.glacierRatio 빙하 비율 0~1
 * @param {number} inputs.oceanRatio   바다 비율 0~1
 * @param {number} inputs.cloudRatio   구름 비율 0~1
 * @param {number} inputs.atmThickness 대기 두께(1 = 지구 기준, 0~2 권장)
 * @param {number} inputs.co2Ppm       CO₂ 농도(ppm)
 * @param {number} inputs.currentTemperature 현재 온도(K).
 * 게임에서 유지하는 현재 행성 온도이며,
 * Physics Engine은 이 값을 변경하지 않는다.
 * @returns {{
 *   albedo:number, absorbedRadiation:number, outgoingRadiation:number,
 *   greenhouseStrength:number, effectiveEmissivity:number,
 *   currentTemperature:number, deltaEnergy:number
 * }}
 */
export function computeClimateV2(inputs = {}) {
  const glacierRatio = clamp(inputs.glacierRatio ?? 0, 0, 1)
  const oceanRatio = clamp(inputs.oceanRatio ?? 0, 0, 1)
  const cloudRatio = clamp(inputs.cloudRatio ?? 0, 0, 1)
  const atmThickness = Math.max(0, inputs.atmThickness ?? 1)
  const co2Ppm = Math.max(0, inputs.co2Ppm ?? CO2_BASELINE_PPM)
  const currentTemperature = inputs.currentTemperature ?? REFERENCE_TEMP_K

  const albedo = albedoOf({ glacierRatio, oceanRatio, cloudRatio })
  const absorbedRadiation = SOLAR_CONSTANT * (1 - albedo)

  const greenhouseStrength = greenhouseStrengthOf({
    co2Ppm,
    atmThickness,
    cloudRatio,
  })
  const effectiveEmissivity = 1 - greenhouseStrength

  const outgoingRadiation =
    effectiveEmissivity * EFFECTIVE_SIGMA * Math.pow(currentTemperature, 4)

  const deltaEnergy = absorbedRadiation - outgoingRadiation

  return {
    albedo,
    absorbedRadiation, // ASR: 흡수 단파복사
    outgoingRadiation, // OLR: 현재 온도 기준 방출 장파복사 (평형 아님)
    greenhouseStrength,
    effectiveEmissivity,
    currentTemperature,
    deltaEnergy, // 양수: 에너지 과다(온난화 방향)
                 // 음수: 에너지 부족(냉각 방향)
                 // 0 근처: 에너지 평형
  }
}

/**
 * 제작 페이지 슬라이더(각 0~100)를 computeClimateV2 입력값으로 변환한다.
 * UI 슬라이더 스케일과 물리 단위 사이의 매핑을 한곳에 모아 둔다.
 *
 * @param {{iceThickness:number, ocean:number, cloud:number, atmThickness:number, co2:number}} sliders
 */
// CO₂ 슬라이더(0~100)를 ppm으로 변환한다(≈130~1296 ppm). climateVisual.js의
// co2Ppm() 표시용 변환도 이 함수를 그대로 써서 물리엔진과 항상 같은 값을 쓴다.
export function sliderToCO2Ppm(co2Slider) {
  return CO2_BASELINE_PPM * (0.3 + clamp((co2Slider ?? 0) / 100, 0, 1) * 2.7)
}

export function mapSlidersToClimateInputs(sliders = {}) {
  const s = (v) => clamp((v ?? 0) / 100, 0, 1)
  return {
    glacierRatio: s(sliders.iceThickness),
    oceanRatio: s(sliders.ocean),
    cloudRatio: s(sliders.cloud),
    atmThickness: 0.4 + s(sliders.atmThickness) * 1.6, // 0.4 ~ 2.0 (1≈지구)
    co2Ppm: sliderToCO2Ppm(sliders.co2),
  }
}

// 알베도/대기두께 "기준(중립)" 값 - Planet Summary 원인 분석(현재 값 vs 기준값 비교)에 쓴다.
// BASELINE_STATE(288K에서 deltaEnergy≈0이 되도록 보정한 조성)의 알베도를 그대로 쓴다.
export const BASELINE_ALBEDO = albedoOf(BASELINE_STATE)
export const BASELINE_ATM_THICKNESS = BASELINE_STATE.atmThickness // 1 (지구 기준)

// equilibriumTemperatureOf는 이 파일 아래(온도 동역학 섹션)에 정의돼 있다 -
// 병합 전 이쪽 브랜치가 만든 버전은 clamp/가드가 없어서, 그걸 포함하는
// clamp가 있는 버전으로 통합했다. 이름/시그니처는 그대로라 아래
// co2PpmForTargetTemperature나 useGameStore.js 쪽 호출부는 안 바뀐다.

/**
 * 2단계 문제를 맞혔지만 아직 지구형 범위 밖(Warm/Cold Stable)일 때, "부족한 부분"을
 * 목표 평형온도(targetTempK)까지 자동으로 계산해서 채워준다. CO₂만 조정하는 이유:
 * greenhouseStrengthOf의 co2Term(로그항)이 대기두께/구름과 달리 단독으로 역산 가능한
 * 유일한 항이라 닫힌 형태 해를 구할 수 있다(다른 항은 여러 슬라이더가 얽혀 있어
 * "얼마나 조정해야 하는지"가 하나로 정해지지 않는다).
 * ASR(absorbedRadiation)은 CO2와 무관하므로 그대로 두고, targetTempK에서
 * OLR=ASR이 되도록 필요한 온실효과 강도를 구한 뒤 co2Term을 역산한다.
 */
export function co2PpmForTargetTemperature({ atmThickness, cloudRatio }, absorbedRadiation, targetTempK) {
  const desiredEmissivity = absorbedRadiation / (EFFECTIVE_SIGMA * Math.pow(targetTempK, 4))
  const desiredGreenhouse = clamp(1 - desiredEmissivity, 0, 0.8)
  const atmTerm = 0.35 * (atmThickness - 1)
  const cloudTerm = 0.1 * cloudRatio
  const co2Term = desiredGreenhouse - 0.3 - atmTerm - cloudTerm
  const co2Ppm = CO2_BASELINE_PPM * Math.pow(2, co2Term / 0.25)
  return clamp(co2Ppm, CO2_BASELINE_PPM * 0.3, CO2_BASELINE_PPM * 3.0)
}

// sliderToCO2Ppm의 역함수 - 자동 조정된 ppm을 다시 슬라이더 값(0~100)으로 되돌린다.
export function co2PpmToSlider(co2Ppm) {
  return clamp(((co2Ppm / CO2_BASELINE_PPM - 0.3) / 2.7) * 100, 0, 100)
}

// 에너지 평형 판정 허용오차 - |ΔE| 가 이 값 이하면 "평형"으로 본다.
//
// 관측량이 아니라 설계 허용오차다(예전에는 derive_thresholds.py가 관측 임계값과
// 함께 내보냈지만, 관측에서 나오는 값이 아니라 여기 두는 것이 맞다. Python 쪽에
// 스케일 배율을 복제해 두면 한쪽만 바뀌었을 때 잡아낼 방법도 없다).
//
// 5.0은 S=100 스케일에서 "평형온도로부터 약 4.6 K 이내"에 해당하는 값이었고,
// ENERGY_SCALE을 곱해 지금 스케일에서도 같은 온도 폭을 유지한다.
export const ENERGY_BALANCE_EPSILON = 5.0 * ENERGY_SCALE

export function energyStateOf(deltaEnergy) {
  if (deltaEnergy > ENERGY_BALANCE_EPSILON) return "Energy Surplus"
  if (deltaEnergy < -ENERGY_BALANCE_EPSILON) return "Energy Deficit"
  return "Stable"
}

// ── 온도 동역학 ────────────────────────────────────────────────────
// computeClimateV2는 주어진 온도에서 수지만 평가하고 온도를 바꾸지 않는다.
// 온도를 실제로 움직이는 규칙은 게임 로직의 것이지만, 여러 호출부가 같은 규칙을
// 써야 하므로 순수 함수로 여기 모아 둔다.

// 온도가 물리적으로 의미 있는 범위를 벗어나 발산하지 않도록 하는 상하한.
export const TEMPERATURE_FLOOR_K = 150
export const TEMPERATURE_CEILING_K = 400

/**
 * 지금 조성 그대로 충분히 시간이 지나면 도달하는 평형온도(K).
 *
 * OLR = ε·σ·T⁴ 이므로 ASR = OLR 을 T에 대해 풀면
 *   T_eq = (ASR / (ε·σ))^(1/4) = T_current · (ASR / OLR)^(1/4)
 * 로 닫힌 형태로 구해진다(온도를 바꿔가며 반복 계산할 필요가 없다).
 *
 * 개발계획서의 T = 15 + ((Total_Energy − 142) × 0.5) 선형식은 계획서 고유의
 * 에너지 분배 모델(대기층 직접 흡수량 등)을 전제한 식이라 σT⁴ 기반인 이 엔진에
 * 그대로 옮기면 단위가 맞지 않는다. 그래서 같은 목적(평형온도 산출)을 이 엔진의
 * 자기 방정식을 역산하는 방식으로 구현한다.
 */
export function equilibriumTemperatureOf(physics) {
  if (!(physics.outgoingRadiation > 0)) return TEMPERATURE_CEILING_K
  return clamp(
    physics.currentTemperature *
      Math.pow(physics.absorbedRadiation / physics.outgoingRadiation, 0.25),
    TEMPERATURE_FLOOR_K,
    TEMPERATURE_CEILING_K,
  )
}

// 피드백 타이머 한 틱에 온도가 ΔE 방향으로 움직이는 정도.
// ΔE > 0(흡수 과다)이면 온도가 오르고, 오르면 OLR(∝T⁴)이 커져 ΔE가 줄어든다.
// 즉 평형온도로 단조 수렴하며 평형 근처에서는 ΔE가 작아져 자동으로 멈춘다.
// 한 틱 이동량에 상한을 둬서 극단적인 ΔE에서도 평형을 지나치지 않게 한다.
// 0.05는 S=100 스케일에서 보정된 값이다. ΔE가 ENERGY_SCALE 배로 커졌으므로
// 같은 배율로 나눠야 한 틱에 움직이는 온도가 그대로 유지된다.
export const TEMPERATURE_STEP_PER_ENERGY = 0.05 / ENERGY_SCALE
// 이쪽은 K 단위라 ΔE 스케일과 무관하다 - 환산하지 않는다.
export const MAX_TEMPERATURE_STEP_K = 3

/** 현재 온도에서 한 틱만큼 ΔE 방향으로 이동한 다음 온도(K). */
export function stepTemperature(currentTemperature, deltaEnergy) {
  const step = clamp(
    TEMPERATURE_STEP_PER_ENERGY * deltaEnergy,
    -MAX_TEMPERATURE_STEP_K,
    MAX_TEMPERATURE_STEP_K,
  )
  return clamp(
    currentTemperature + step,
    TEMPERATURE_FLOOR_K,
    TEMPERATURE_CEILING_K,
  )
}

// ── 행성 상태 5분류 ────────────────────────────────────────────────
// ΔE로 평형/불평형을 먼저 가르고, 평형이면 온도로 저온/지구형/고온을 가른다.
// 클래스 번호는 저온 → 고온 순서다.
// 온도 구간은 실측 데이터에서 도출된 값이다(derive_thresholds.py).
//
// 예전에는 이 판정을 학습된 ONNX 모델이 대신했지만, 라벨이 ΔE·온도만으로 완전히
// 결정되는 구조라 모델은 물리 규칙의 근사(정확도 0.9694)에 지나지 않았다.
// 지금은 게임이 이 함수를 직접 호출해 정확값을 쓴다.
export { COLD_STABLE_MAX_K, EARTH_LIKE_MAX_K }

export const PLANET_STATES = [
  { state: 0, label: "Energy Deficit", korean: "저온 불평형" },
  { state: 1, label: "Cold Stable", korean: "저온 안정" },
  { state: 2, label: "Earth-like Stable", korean: "지구형 안정" },
  { state: 3, label: "Warm Stable", korean: "고온 안정" },
  { state: 4, label: "Energy Surplus", korean: "고온 불평형" },
]

/** ΔE와 현재 온도로부터 행성 상태(0~4)를 판정한다. */
export function planetStateOf(deltaEnergy, temperatureK) {
  if (deltaEnergy < -ENERGY_BALANCE_EPSILON) return 0
  if (deltaEnergy > ENERGY_BALANCE_EPSILON) return 4
  if (temperatureK < COLD_STABLE_MAX_K) return 1
  if (temperatureK <= EARTH_LIKE_MAX_K) return 2
  return 3
}
