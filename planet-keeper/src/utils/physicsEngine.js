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
 * - CO₂ 기준 농도 = 429.53 ppm (기상청 관측소 3곳 2024년 실측 평균)
 * - 기준 온도 = 288.15 K (15°C, 판정 밴드의 중심과 같은 값)
 */

// 라벨 임계값은 실측 데이터에서 도출된 생성 파일에서 읽는다.
// (data-pipeline/Analysis/derive_thresholds.py → src/data/climateThresholds.js)
import {
  COLD_STABLE_MAX_K,
  EARTH_LIKE_MAX_K,
  EARTH_REFERENCE_TEMP_K,
} from "../data/climateThresholds.js"

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
// 기상청 관측소 3곳(울릉도·독도 428.29 / 안면도 431.02 / 고산 429.29)의 2024년
// 월별 실측 36개를 평균한 값(physics_reference.csv의 co2). 계획서는 432로 두고
// 시작했는데 그건 어느 관측소 값과도 맞지 않아서 실측 평균으로 교체했다.
//
// 이 상수는 sliderToCO2Ppm(슬라이더→ppm)과 greenhouseStrengthOf의 co2Term(ppm→로그
// 응답) 양쪽에 들어가고 서로 나눠지므로 약분된다 - 즉 값이 바뀌어도 같은 슬라이더
// 위치에서 온실효과·ΔE·판정은 그대로다. 화면에 표시되는 ppm 숫자만 달라진다.
export const CO2_BASELINE_PPM = 429.53
// 지구 평균 지표 기온(15°C = 288.15 K) — 유효 σ 보정의 목표값이다.
//
// 숫자를 여기 적지 않고 climateThresholds.js에서 가져오는 이유: 판정 밴드
// (COLD_STABLE_MAX_K ~ EARTH_LIKE_MAX_K)가 derive_thresholds.py에서 이 값을
// 중심으로 ±(관측 IQR/2) 하게 계산된다. 엔진이 평형을 맞추는 온도와 밴드의
// 중심이 다르면 "평형인데 지구형이 아닌" 구간이 생기므로 같은 값을 써야 한다.
// 예전에는 여기 288, 저기 288.15로 0.15 K 어긋나 있었다.
export const REFERENCE_TEMP_K = EARTH_REFERENCE_TEMP_K

const clamp = (x, lo, hi) => Math.min(hi, Math.max(lo, x))

// 지표 구성별 반사율(문헌 통념값). 계수 자체가 "이 지표는 얼마나 밝은가"라는
// 물리량이라, 값만 봐도 타당한지 판단할 수 있다.
// 빙하 슬라이더 100%는 "행성이 눈·얼음으로 완전히 덮인 상태"이므로 신적설 쪽 값을
// 쓴다(신적설 0.8~0.9 / 해빙 0.5~0.7 / 빙하빙 0.4~0.6). 스노우볼 지구의 알베도
// 추정치도 0.6~0.8이라 그 상단에 해당한다.
export const ALBEDO_ICE = 0.8
export const ALBEDO_OCEAN = 0.08 // 해양 (0.06~0.10)
export const ALBEDO_LAND = 0.2 // 육지 평균 (숲 0.15 ~ 사막 0.35)
export const ALBEDO_CLOUD = 0.5 // 구름 — 개발계획서 (3)1의 값

/**
 * 지표/대기 구성에 따른 행성 알베도(반사율, 0~1).
 *
 *   육지   = 1 − 빙하 − 바다                     (남는 면적)
 *   지표면 = 각 지표의 면적 가중 평균
 *   행성   = 지표면 × (1 − 구름) + 구름 × 0.5    (구름이 지표를 가림)
 *
 * 예전에는 `0.12 + 0.45·빙하 + 0.5·구름 − 0.05·바다` 라는 덧셈식이었다.
 * 계획서에서 온 값은 구름 계수 0.5 하나뿐이었고 나머지 세 계수는 출처가 없었는데,
 * 극단 조성에서 실제와 크게 어긋났다.
 *
 *   바다 100% → 0.22 (실제 해양 ≈0.1)    사막(육지 100%) → 0.145 (실제 ≈0.2~0.35)
 *   구름 100% → 0.62 (지표가 안 보이는데도 지표분이 남아 있음)
 *
 * 원인은 구름을 "지표에 더하는" 항으로 둔 것이다. 구름은 지표를 가리므로 면적
 * 가중으로 결합해야 하고, 그렇게 하면 구름 100%에서 정확히 구름 알베도 0.5가
 * 나온다. 계획서의 0.5는 버리지 않고 "구름 자체의 반사율"로 그대로 쓴다.
 *
 * 빙하·바다 슬라이더는 서로 독립이라 합이 1을 넘을 수 있다. 그때는 육지가 0이 되고
 * 두 지표의 비율로 정규화된다(예: 빙하 100 + 바다 100 → 반반 섞인 지표).
 *
 * landAlbedo(선택): 육지의 반사율을 지점별 실측값으로 바꾼다. 지구의 육지는
 * 사막 0.35 ~ 열대림 0.13 으로 편차가 커서, 평균값 하나로는 "사하라 행성"과
 * "아마존 행성"이 같은 밝기가 되어 버린다. 지점 선택(climatePoints.js)이 KIM
 * 실측에서 역산한 값을 넘긴다. 안 넘기면 기존과 똑같이 ALBEDO_LAND를 쓴다.
 */
export function albedoOf({ glacierRatio, oceanRatio, cloudRatio, landAlbedo = ALBEDO_LAND }) {
  const landRatio = Math.max(0, 1 - glacierRatio - oceanRatio)
  const totalSurface = glacierRatio + oceanRatio + landRatio // 항상 ≥ 1
  const surfaceAlbedo =
    (glacierRatio * ALBEDO_ICE + oceanRatio * ALBEDO_OCEAN + landRatio * landAlbedo) /
    totalSurface

  return clamp(
    surfaceAlbedo * (1 - cloudRatio) + cloudRatio * ALBEDO_CLOUD,
    0.05,
    0.9,
  )
}

// 기준 조성에서의 온실효과 상수항.
//
// 실제 지구의 유효 온실효과는 OLR(≈240 W/m²)과 지표 복사(σ·288.15⁴ = 390.92 W/m²)에서
//   g_earth = 1 − 240 / 390.92 = 0.386
// 로 구해진다. 여기에 기준 조성의 구름 기여(0.1 × 0.3 = 0.03)가 더해지므로,
// 상수항은 0.386 − 0.03 = 0.356 으로 둬야 기준 조성의 온실효과가 실제 지구와 같아진다.
//
// 예전에는 0.30이었는데 출처가 어디에도 없었다(계획서에도 없음). 기준 조성에서
// 0.33이 나와 실제 지구 0.386과 어긋났다.
const GREENHOUSE_BASE = 0.356

// 온실효과 상한. g = 1 − ε 이고 금성이 g ≈ 0.99이므로 "폭주 직전"에 해당한다.
// 예전 상한 0.8에서는 무작위 조성의 27%가 벽에 붙어, 그 구간에서 CO₂·대기두께
// 아이템을 써도 clamp가 잘라내 화면상 아무 변화가 없었다(0.85에서는 21%).
const GREENHOUSE_MAX = 0.85

// 온실효과의 각 항. co2PpmForTargetTemperature(역함수)도 같은 식을 써야 하므로
// 계수를 양쪽에 적지 않고 여기 한 번만 둔다 - 예전에는 복제돼 있어서, 상수를
// 한쪽만 고쳤을 때 2단계 강제 안정화가 조용히 빗나갔다.
const co2GreenhouseTerm = (co2Ppm) =>
  0.25 * Math.log2(Math.max(co2Ppm, 1) / CO2_BASELINE_PPM)
const atmGreenhouseTerm = (atmThickness) => 0.35 * (atmThickness - 1) // 1 = 지구 기준
const cloudGreenhouseTerm = (cloudRatio) => 0.1 * cloudRatio

/**
 * 온실효과 강도(0~GREENHOUSE_MAX). 값이 클수록 지표 복사를 더 많이 되잡아 온난화된다.
 * CO₂는 로그 응답(복사강제력 ∝ log), 대기 두께와 구름도 기여한다.
 */
function greenhouseStrengthOf({ co2Ppm, atmThickness, cloudRatio }) {
  const co2Term = co2GreenhouseTerm(co2Ppm)
  const atmTerm = atmGreenhouseTerm(atmThickness)
  const cloudTerm = cloudGreenhouseTerm(cloudRatio)
  return clamp(GREENHOUSE_BASE + co2Term + atmTerm + cloudTerm, 0, GREENHOUSE_MAX)
}

// 지구 기준 상태(288.15 K)에서 ASR ≈ OLR(deltaEnergy ≈ 0)가 되도록
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

  // landAlbedo는 지점 선택에서만 넘어온다(그 지점 육지의 실측 반사율). 안 넘어오면
  // albedoOf가 기본값 ALBEDO_LAND를 쓰므로 기존 동작과 같다.
  const albedo = albedoOf({ glacierRatio, oceanRatio, cloudRatio, landAlbedo: inputs.landAlbedo })
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
    // landAlbedo는 슬라이더가 아니라 지점 선택이 실어 보내는 값이라 변환 없이
    // 그대로 통과시킨다. 여기서 처리하는 이유: 게임 전체가 computeClimateV2를
    // 부를 때 항상 이 함수를 거치므로, 호출부마다 따로 챙기지 않아도 자동으로
    // 전달된다(호출부에 맡기면 한 곳만 빠뜨려도 그 경로만 조용히 어긋난다).
    // 없으면 undefined가 되고 albedoOf가 기본값 ALBEDO_LAND를 쓴다.
    landAlbedo: sliders.landAlbedo,
  }
}

// 알베도/대기두께 "기준(중립)" 값 - Planet Summary 원인 분석(현재 값 vs 기준값 비교)에 쓴다.
// BASELINE_STATE(288.15K에서 deltaEnergy≈0이 되도록 보정한 조성)의 알베도를 그대로 쓴다.
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
  // greenhouseStrengthOf의 역함수다 - 상수와 각 항을 그쪽과 공유해서 어긋날 수 없게 한다.
  const desiredEmissivity = absorbedRadiation / (EFFECTIVE_SIGMA * Math.pow(targetTempK, 4))
  const desiredGreenhouse = clamp(1 - desiredEmissivity, 0, GREENHOUSE_MAX)
  const co2Term =
    desiredGreenhouse -
    GREENHOUSE_BASE -
    atmGreenhouseTerm(atmThickness) -
    cloudGreenhouseTerm(cloudRatio)
  const co2Ppm = CO2_BASELINE_PPM * Math.pow(2, co2Term / 0.25)
  return clamp(co2Ppm, CO2_BASELINE_PPM * 0.3, CO2_BASELINE_PPM * 3.0)
}

// sliderToCO2Ppm의 역함수 - 자동 조정된 ppm을 다시 슬라이더 값(0~100)으로 되돌린다.
// 슬라이더는 정수 퍼센트라, 부동소수점 나눗셈이 남기는 37.499999999999996
// 같은 오차를 여기서 반올림해 지운다(호출부마다 반올림하면 빠뜨리기 쉬움).
export function co2PpmToSlider(co2Ppm) {
  return Math.round(clamp(((co2Ppm / CO2_BASELINE_PPM - 0.3) / 2.7) * 100, 0, 100))
}

// mapSlidersToClimateInputs의 atmThickness(0.4~2.0) 역함수 - 지점 선택처럼 이미
// 물리 단위로 된 값을 슬라이더 값(0~100)으로 되돌릴 때 쓴다. co2PpmToSlider와
// 같은 이유로 정수 반올림한다(예: atmThickness=1.0 → 37.5가 아니라
// 37.49999999999999로 뜨는 부동소수점 오차 방지).
export function atmThicknessToSlider(atmThickness) {
  return Math.round(clamp(((atmThickness - 0.4) / 1.6) * 100, 0, 100))
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
