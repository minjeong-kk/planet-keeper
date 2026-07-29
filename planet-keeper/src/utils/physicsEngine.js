/**
 * physicsEngine.js — 기후 물리 엔진 (순수 함수)
 *
 * React state / UI / Three.js 에 전혀 의존하지 않는 순수 계산 모듈이다.
 * 동일한 함수를 브라우저(제작 페이지)와 ML 데이터 생성 스크립트에서 그대로 import 해
 * 재사용할 수 있다.
 *
 *   import { computeClimate, mapSlidersToClimateInputs } from '.../utils/physicsEngine'
 *
 * 모델: 0차원(0-D) 에너지 평형 모델.
 *   흡수 단파복사(ASR) = S · (1 − 알베도)
 *   평형에서 ASR = 유효방출률 · σ · T⁴  →  T = ( ASR / (ε · σ) )^(1/4)
 *   온실효과가 강할수록 유효방출률 ε 이 낮아져 지표 온도 T 가 상승한다.
 *
 * 기준 수치(PLAN.md):
 *   - TOA 하향단파복사속 기준 상수 S = 100 (고정)
 *   - CO₂ 배경 농도 = 432 ppm (가중치 1.0)
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

// 지구 유사 기준 상태에서 REFERENCE_TEMP_K 가 나오도록 유효 σ 를 자동 보정한다.
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
 * 환경 변수로부터 평형 기온·복사 수치를 계산한다.
 *
 * @param {object} inputs
 * @param {number} inputs.glacierRatio 빙하 비율 0~1
 * @param {number} inputs.oceanRatio   바다 비율 0~1
 * @param {number} inputs.cloudRatio   구름 비율 0~1
 * @param {number} inputs.atmThickness 대기 두께(1 = 지구 기준, 0~2 권장)
 * @param {number} inputs.co2Ppm       CO₂ 농도(ppm)
 * @returns {{
 *   albedo:number, absorbedRadiation:number, outgoingRadiation:number,
 *   greenhouseStrength:number, effectiveEmissivity:number,
 *   temperatureK:number, temperatureC:number
 * }}
 */
export function computeClimate(inputs = {}) {
  const glacierRatio = clamp(inputs.glacierRatio ?? 0, 0, 1)
  const oceanRatio = clamp(inputs.oceanRatio ?? 0, 0, 1)
  const cloudRatio = clamp(inputs.cloudRatio ?? 0, 0, 1)
  const atmThickness = Math.max(0, inputs.atmThickness ?? 1)
  const co2Ppm = Math.max(0, inputs.co2Ppm ?? CO2_BASELINE_PPM)

  const albedo = albedoOf({ glacierRatio, oceanRatio, cloudRatio })
  const absorbedRadiation = SOLAR_CONSTANT * (1 - albedo)

  const greenhouseStrength = greenhouseStrengthOf({
    co2Ppm,
    atmThickness,
    cloudRatio,
  })
  const effectiveEmissivity = 1 - greenhouseStrength

  const temperatureK = Math.pow(
    absorbedRadiation / (effectiveEmissivity * EFFECTIVE_SIGMA),
    0.25,
  )

  return {
    albedo,
    absorbedRadiation, // ASR: 흡수 단파복사
    outgoingRadiation: absorbedRadiation, // 평형 상태이므로 OLR = ASR
    greenhouseStrength,
    effectiveEmissivity,
    temperatureK,
    temperatureC: temperatureK - 273.15,
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
