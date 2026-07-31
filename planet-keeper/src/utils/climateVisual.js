// 슬라이더 값(0~100) → PlanetUI 3D 시각 props 매핑 (제작/게임 페이지 공통).
// store(useClimateStore) 와 분리해 두어 팀원 스토어와 충돌 없이 재사용한다.

const s01 = (v) => Math.min(1, Math.max(0, (v ?? 0) / 100)); // 0~100 → 0~1

// CO₂ 슬라이더(%) → 실제 ppm (physicsEngine 매핑과 동일: 432 * (0.3 ~ 3.0))
export const co2Ppm = (v) => Math.round(432 * (0.3 + s01(v) * 2.7));

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
