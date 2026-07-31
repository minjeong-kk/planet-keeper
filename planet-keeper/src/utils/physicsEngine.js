/**
 * physicsEngine.js — 기후 물리 엔진 (순수 함수)
 *
 * React state / UI / Three.js에 전혀 의존하지 않는 순수 계산 모듈이다.
 * 동일한 함수를 브라우저(게임)와 머신러닝 데이터 생성 스크립트에서 그대로
 * import하여 재사용한다.
 *
 *   import { computeClimate, mapSlidersToClimateInputs } from ".../utils/physicsEngine"
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
 * - TOA 하향단파복사속 기준 상수 S = 100
 * - CO₂ 기준 농도 = 432 ppm
 * - 기준 온도 = 288 K
 */

// ── 과학적 기준 상수 (PLAN.md) ──────────────────────────────────
export const SOLAR_CONSTANT = 100 // TOA 하향단파복사속 기준
export const CO2_BASELINE_PPM = 432 // 기상청 안면도 실측 기준 배경 농도
export const REFERENCE_TEMP_K = 288 // 지구 평균 지표 기온(≈15°C) — 보정 목표값

const clamp = (x, lo, hi) => Math.min(hi, Math.max(lo, x))

/**
 * 지표/대기 구성에 따른 행성 알베도(반사율, 0~1).
 * 빙하·구름은 반사율을 높이고, 바다는 어두워 반사율을 살짝 낮춘다.
 */
function albedoOf({ glacierRatio, oceanRatio, cloudRatio }) {
  return clamp(
    0.12 + 0.45 * glacierRatio + 0.3 * cloudRatio - 0.05 * oceanRatio,
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
 * 제작 페이지 슬라이더(각 0~100)를 computeClimate 입력값으로 변환한다.
 * UI 슬라이더 스케일과 물리 단위 사이의 매핑을 한곳에 모아 둔다.
 *
 * @param {{iceThickness:number, ocean:number, cloud:number, atmThickness:number, co2:number}} sliders
 */
export function mapSlidersToClimateInputs(sliders = {}) {
  const s = (v) => clamp((v ?? 0) / 100, 0, 1)
  return {
    glacierRatio: s(sliders.iceThickness),
    oceanRatio: s(sliders.ocean),
    cloudRatio: s(sliders.cloud),
    atmThickness: 0.4 + s(sliders.atmThickness) * 1.6, // 0.4 ~ 2.0 (1≈지구)
    co2Ppm: CO2_BASELINE_PPM * (0.3 + s(sliders.co2) * 2.7), // ≈130 ~ 1296 ppm
  }
}
