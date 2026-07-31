import { createContext, useContext, useState } from "react";

// 행성 제작 슬라이더 값(0~100). 페이지 이동 간에도 유지되도록 Context 로 공유한다.
export const CLIMATE_INITIAL = {
  ocean: 50, // 바다 수위
  iceThickness: 20, // 빙하 면적
  cloud: 30, // 구름 양
  atmThickness: 50, // 대기 두께
  co2: 20, // CO₂ 농도
};

const s01 = (v) => Math.min(1, Math.max(0, (v ?? 0) / 100)); // 0~100 → 0~1

// CO₂ 슬라이더(%) → 실제 ppm (physicsEngine 매핑과 동일: 432 * (0.3 ~ 3.0))
export const co2Ppm = (v) => Math.round(432 * (0.3 + s01(v) * 2.7));

/** 슬라이더 값 → PlanetUI 의 물리 요소별 3D props (제작/게임/리포트 페이지 공통) */
export function slidersToVisual(sliders) {
  return {
    oceanRatio: s01(sliders.ocean),
    glacierRatio: s01(sliders.iceThickness),
    cloudRatio: s01(sliders.cloud),
    co2Level: s01(sliders.co2),
    atmosphereScale: 1.05 + s01(sliders.atmThickness) * 0.4,
  };
}

const ClimateContext = createContext(null);

export function ClimateProvider({ children }) {
  const [values, setValues] = useState(CLIMATE_INITIAL);
  const setValue = (key, value) =>
    setValues((prev) => ({ ...prev, [key]: value }));
  const reset = () => setValues(CLIMATE_INITIAL);

  return (
    <ClimateContext.Provider value={{ values, setValue, setValues, reset }}>
      {children}
    </ClimateContext.Provider>
  );
}

export function useClimate() {
  const ctx = useContext(ClimateContext);
  if (!ctx) throw new Error("useClimate must be used within <ClimateProvider>");
  return ctx;
}
