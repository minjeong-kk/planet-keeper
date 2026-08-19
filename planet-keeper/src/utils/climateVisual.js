// 슬라이더 값(0~100) → PlanetUI 3D 시각 props 매핑 (제작/게임 페이지 공통).
// store(useClimateStore) 와 분리해 두어 팀원 스토어와 충돌 없이 재사용한다.

import {
  sliderToCO2Ppm,
  COLD_STABLE_MAX_K,
  EARTH_LIKE_MAX_K,
  REFERENCE_TEMP_K,
} from "./physicsEngine.js";

const s01 = (v) => Math.min(1, Math.max(0, (v ?? 0) / 100)); // 0~100 → 0~1
const clamp01 = (v) => Math.min(1, Math.max(0, v));

// CO₂ 슬라이더(%) → 실제 ppm. 변환식은 physicsEngine의 sliderToCO2Ppm 하나만
// 쓴다(CO2_BASELINE_PPM * (0.3 ~ 3.0)) - 여기 숫자를 복제해 두면 기준 농도가
// 바뀔 때 표시값만 조용히 어긋난다.
export const co2Ppm = (v) => Math.round(sliderToCO2Ppm(v));

// 지구형 안정 구간(COLD_STABLE_MAX_K ~ EARTH_LIKE_MAX_K)을 벗어난 뒤 이만큼 더
// 벗어나면 연출이 최대가 된다. 안정 구간 안에서는 heat/cold가 0이라 조성(슬라이더)
// 그대로 보이고, 벗어난 만큼만 행성이 극단적으로 변한다.
const HEAT_SPAN_K = 26;
const COLD_SPAN_K = 26;

/**
 * 슬라이더 값 → PlanetUI 의 물리 요소별 3D props.
 *
 * currentTemperature를 넘기면 조성뿐 아니라 "지금 온도"까지 외형에 반영한다 -
 * 장비를 써서 온도가 움직였을 때 숫자만 바뀌고 행성은 그대로인 문제를 없애기
 * 위한 것이다. 물리 계산에는 전혀 관여하지 않는 표시 전용 보정이다
 * (physicsEngine은 슬라이더 원본값만 본다).
 *
 *   더울수록  바다가 증발해 해수면이 낮아지고 대륙이 메마르며, 빙하가 녹고
 *             대기 링이 붉어진다.
 *   추울수록  극지에서 빙하가 번져 스노우볼에 가까워진다.
 *
 * 온도를 넘기지 않으면(기존 호출부) 기준 온도로 계산해 보정이 0이 된다.
 */
export function slidersToVisual(sliders, currentTemperature = REFERENCE_TEMP_K) {
  const ocean = s01(sliders.ocean);
  const glacier = s01(sliders.iceThickness);
  const co2 = s01(sliders.co2);

  const heat = clamp01((currentTemperature - EARTH_LIKE_MAX_K) / HEAT_SPAN_K);
  const cold = clamp01((COLD_STABLE_MAX_K - currentTemperature) / COLD_SPAN_K);

  return {
    // 고온이면 해수면이 물러나고(uSeaLevel↓) 대륙 초록도 함께 옅어진다(uOcean↓).
    oceanRatio: clamp01(ocean * (1 - 0.5 * heat)),
    // 저온이면 남은 지표를 빙하가 덮어 나가고, 고온이면 있던 빙하가 녹는다.
    glacierRatio: clamp01(glacier * (1 - 0.8 * heat) + (1 - glacier) * 0.85 * cold),
    cloudRatio: s01(sliders.cloud),
    // 대기 프레넬 링 색(파랑 → 보라 → 붉은빛) - 더우면 붉은 쪽으로 밀어준다.
    co2Level: clamp01(co2 + 0.4 * heat),
    atmosphereScale: 1.05 + s01(sliders.atmThickness) * 0.4,
  };
}
