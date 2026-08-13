// ⚠️ 자동 생성 파일 — 직접 수정하지 마세요.
// data-pipeline/Analysis/derive_thresholds.py 를 실행하면 다시 생성됩니다.
//
// 근거: observed_kim_dataset.csv 관측 1498개 지점
//       관측 t2m 220.4~303.75 K (평균 291.55 K)
//       IQR 286.08~299.15 K
//       지구형 안정 범위 = 계획서 기준 15°C ± (관측 t2m IQR / 2). 관측 표본이 여름철·저위도로 치우쳐 있어(README 알려진 한계 2·6번) 관측 평균이 아니라 계획서 기준값을 중심으로 삼는다.
//
// climate_thresholds.json 과 같은 값이다(도출 근거는 그 파일의 derivation 필드).
//
// 에너지 평형 허용오차(epsilon)는 여기 없다 - 관측값이 아니라 설계값이라
// physicsEngine.js가 SOLAR_CONSTANT에서 직접 유도한다.

export const COLD_STABLE_MAX_K = 281.61
export const EARTH_LIKE_MAX_K = 294.69
export const EARTH_REFERENCE_TEMP_K = 288.15
