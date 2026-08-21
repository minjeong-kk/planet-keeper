// 학습 화면(문제은행·용어집·도감)이 인용하는 기준 수치를 물리엔진에서 유도한다.
//
// 왜 필요한가: physics-merge.py는 재수집할 때 physicsEngine.js의 SOLAR_CONSTANT /
// CO2_BASELINE_PPM 두 줄만 정규식으로 덮어쓰고, derive_thresholds.py는
// climateThresholds.js를, build_presets.py는 climatePoints.js를 다시 생성한다.
// 그래서 학습 문구에 "296.4 W/m²", "429.53ppm", "흡수 216 W/m²", "277.22 ~ 299.08K"
// 같은 숫자를 손으로 적어 두면 재수집 뒤에 그 문구만 조용히 낡는다 - 화면에는 새 값으로
// 계산한 ΔE가 뜨는데 문제 힌트는 옛 숫자로 설명하는, 학생 입장에서 검산이 안 되는
// 상태가 된다. physicsEngine.js 머리 주석이 "여기(설명)에 숫자를 또 적으면 갱신에서
// 빠져 조용히 낡으므로 적지 않는다"고 못 박아 둔 것과 같은 이유다.
//
// 그래서 여기서 만든 문자열을 템플릿 리터럴로 끼워 쓴다. 값이 바뀌면 문구도 함께 바뀐다.
//
// ── 여기 두지 않는 것 ────────────────────────────────────────────
// 실제 지구의 관측값(지표 복사 391 W/m², OLR 240 W/m², 지구 알베도 0.30, 금성
// 0.77 / g 0.99 / 460℃)과 교육용 가상 수치(흡수 270 · 방출 250 인 행성 등)는
// 이 엔진에서 나오는 값이 아니므로 문구에 그대로 적는다 - 엔진을 따라 움직이면
// 오히려 틀린 값이 된다. 이 엔진의 절대 플럭스는 유효 σ 보정 때문에 실제 지구의
// 약 0.87배라, 두 계열을 섞으면 안 된다(LIMITATIONS.md 1번).

import {
  SOLAR_CONSTANT,
  CO2_BASELINE_PPM,
  CO2_LOG_COEFFICIENT,
  CLOUD_GREENHOUSE_COEFFICIENT,
  ALBEDO_ICE,
  ALBEDO_OCEAN,
  ALBEDO_LAND,
  ALBEDO_CLOUD,
  BASELINE_ALBEDO,
  BASELINE_GREENHOUSE,
  BASELINE_COMPOSITION,
  REFERENCE_TEMP_K,
  ENERGY_BALANCE_EPSILON,
  COLD_STABLE_MAX_K,
  EARTH_LIKE_MAX_K,
  albedoOf,
} from "../utils/physicsEngine.js";

const int = (v) => String(Math.round(v));
const pct = (ratio) => `${Math.round(ratio * 100)}%`;

// ── 들어오는 단파복사 ────────────────────────────────────────────
/** 유입 단파복사 S (W/m²). 태양 상수(1361 W/m²)가 아니라 TOA 하향단파복사속이다. */
export const S = SOLAR_CONSTANT.toFixed(1);

// 흡수·반사량은 "화면에 적힌 알베도"로 계산한다. 문구가 "알베도 0.27 이라 흡수
// 216 W/m²"라고 말하면 학생이 그 두 숫자로 직접 검산하는데, 여기서 반올림 전
// 알베도(0.2732)를 쓰면 215가 나와 글과 산수가 어긋난다.
// albedo 인자는 숫자와 "0.27" 같은 표시용 문자열을 모두 받는다(아래 A_* 상수가
// 문자열이라 그대로 넘길 수 있게) - 그래서 계산 전에 명시적으로 Number로 바꾼다.
/** 알베도 a 인 표면이 흡수하는 양 S(1−a), 정수 W/m² */
export const asr = (albedo) => int(SOLAR_CONSTANT * (1 - Number(albedo)));
/** 알베도 a 인 표면이 되돌려 보내는 양 S·a, 정수 W/m² */
export const reflected = (albedo) => int(SOLAR_CONSTANT * Number(albedo));

// ── CO₂ ─────────────────────────────────────────────────────────
/** 기준 CO₂ 농도 (ppm) */
export const CO2 = String(CO2_BASELINE_PPM);
/** 기준 농도의 2배 (ppm, 정수) — "CO₂만 두 배로" 문제들이 쓴다 */
export const CO2_X2 = int(CO2_BASELINE_PPM * 2);
/** g 의 CO₂ 항 계수 (농도 2배마다 g 가 이만큼 커진다) */
export const CO2_COEF = String(CO2_LOG_COEFFICIENT);
/** g 의 구름 항 계수 (구름 비율 × 이 값) */
export const CLOUD_COEF = String(CLOUD_GREENHOUSE_COEFFICIENT);

// ── 지표별 반사율(문헌값) ────────────────────────────────────────
export const A_ICE = String(ALBEDO_ICE);
export const A_OCEAN = String(ALBEDO_OCEAN);
export const A_LAND = String(ALBEDO_LAND);
export const A_CLOUD = String(ALBEDO_CLOUD);

// ── 지구 기준 조성 ──────────────────────────────────────────────
/** 기준 조성의 빙하/바다/구름 비율 — "빙하 10% · 바다 70% · 구름 30%" */
export const BASE_ICE_PCT = pct(BASELINE_COMPOSITION.glacierRatio);
export const BASE_OCEAN_PCT = pct(BASELINE_COMPOSITION.oceanRatio);
export const BASE_CLOUD_PCT = pct(BASELINE_COMPOSITION.cloudRatio);
export const BASE_ATM = String(BASELINE_COMPOSITION.atmThickness);

/** 기준 조성 알베도 — "0.27" */
export const A_BASE = BASELINE_ALBEDO.toFixed(2);
/** 기준 조성이 흡수하는 양 — "216" */
export const ASR_BASE = asr(Number(A_BASE));
/** 기준 조성 온실효과 g — "0.386" */
export const G_BASE = BASELINE_GREENHOUSE.toFixed(3);
/** 그 방출률 (1 − g) — "0.614" */
export const EMISS_BASE = (1 - BASELINE_GREENHOUSE).toFixed(3);

// 기준 조성에서 한 변수만 바꾼 알베도 - 문제들이 "빙하를 20%로 늘리면 알베도가
// 0.27 → 0.32" 처럼 인용한다. 계수(빙하 0.8 / 구름 0.5 등)를 고치면 이 숫자도
// 함께 움직여야 하므로 albedoOf를 그대로 다시 부른다.
const albedoWith = (override) => albedoOf({ ...BASELINE_COMPOSITION, ...override }).toFixed(2);
/** 기준 조성에서 구름만 60%로 — "0.37" */
export const A_CLOUD60 = albedoWith({ cloudRatio: 0.6 });
/** 기준 조성에서 빙하만 20%로 — "0.32" */
export const A_ICE20 = albedoWith({ glacierRatio: 0.2 });
/** 기준 조성에서 빙하를 0%로 — "0.23" */
export const A_ICE0 = albedoWith({ glacierRatio: 0 });

// ── 판정 기준 ───────────────────────────────────────────────────
/** 평형 판정 허용오차 |ΔE| — "14.8" */
export const EPS = ENERGY_BALANCE_EPSILON.toFixed(1);
/** 지구형 안정 구간 하한 — "277.22" (derive_thresholds.py 산출) */
export const COLD_MAX = COLD_STABLE_MAX_K.toFixed(2);
/** 지구형 안정 구간 상한 — "299.08" (derive_thresholds.py 산출) */
export const EARTH_MAX = EARTH_LIKE_MAX_K.toFixed(2);
/** 판정 밴드의 중심이자 유효 σ 보정의 목표 온도 — "288.15" */
export const REFERENCE_TEMP_TEXT = String(REFERENCE_TEMP_K);
