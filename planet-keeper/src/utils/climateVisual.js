// 슬라이더 값(0~100) → PlanetUI 3D 시각 props 매핑 (제작/게임 페이지 공통).
// store(useClimateStore) 와 분리해 두어 팀원 스토어와 충돌 없이 재사용한다.

import { sliderToCO2Ppm } from "./physicsEngine.js";

const s01 = (v) => Math.min(1, Math.max(0, (v ?? 0) / 100)); // 0~100 → 0~1

// CO₂ 슬라이더(%) → 실제 ppm. 변환식은 physicsEngine의 sliderToCO2Ppm 하나만
// 쓴다(CO2_BASELINE_PPM * (0.3 ~ 3.0)) - 여기 숫자를 복제해 두면 기준 농도가
// 바뀔 때 표시값만 조용히 어긋난다.
export const co2Ppm = (v) => Math.round(sliderToCO2Ppm(v));

/** 슬라이더 값 → PlanetUI 의 물리 요소별 3D props */
export function slidersToVisual(sliders) {
  return {
    oceanRatio: s01(sliders.ocean),
    glacierRatio: s01(sliders.iceThickness),
    cloudRatio: s01(sliders.cloud),
    co2Level: s01(sliders.co2),
    atmosphereScale: 1.05 + s01(sliders.atmThickness) * 0.4,
  };
}
