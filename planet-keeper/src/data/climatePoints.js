// ⚠️ 자동 생성 파일 — 직접 수정하지 마세요.
// data-pipeline/Analysis/build_presets.py 를 실행하면 다시 생성됩니다.
//
// 행성 만들기의 '특정 지점 선택'에 쓰는 지점별 실측값입니다.
// 출처: 기상청 KIM(수치예보모델) 지점 조회, 표본 20260217~20260814 12일
//
//   t2m          기온 실측 평균(K) - 그 지점의 시작 온도
//   cloud        전운량 tcld(0~1) 평균 × 100
//   surfaceAlbedo 1 − Σrss / Σdswrsfc (그 지점 지표면 전체의 반사율)
//   atmThickness 지면기압 ps / 101325
//   co2          지점별 관측이 없어 전지구 기준값 공통 적용
//   iceThickness/ocean  측정값이 아니라 지리적 사실(build_presets.py의 GEOGRAPHY)
//
// 한계: KIM 조회 구간이 약 180일이라 가을·겨울 표본이 없습니다.
// 단파복사(알베도)는 남극에 태양이 남아 있는 2~3월로 따로 고정했습니다.
// 자세한 내용은 README '알려진 한계' 참고.

export const CLIMATE_POINTS = [
  {
    id: "seoul",
    name: "서울",
    lat: 37.5,
    lng: 127.0,
    values: { iceThickness: 5, ocean: 20, cloud: 55, atmThickness: 1.003, co2: 429.53 },
    t2m: 288.9,
    surfaceAlbedo: 0.107,
    imageUrl: null,
  },
  {
    id: "sahara",
    name: "사하라 사막",
    lat: 23.4,
    lng: 8.7,
    values: { iceThickness: 0, ocean: 0, cloud: 21, atmThickness: 0.894, co2: 429.53 },
    t2m: 299.6,
    surfaceAlbedo: 0.323,
    imageUrl: "/assets/location-sahara.jpg",
  },
  {
    id: "antarctica",
    name: "남극",
    lat: -75.3,
    lng: 0.0,
    values: { iceThickness: 95, ocean: 5, cloud: 85, atmThickness: 0.665, co2: 429.53 },
    t2m: 230.4,
    surfaceAlbedo: 0.82,
    imageUrl: null,
  },
  {
    id: "pacific",
    name: "태평양 중심",
    lat: 0.0,
    lng: -160.0,
    values: { iceThickness: 0, ocean: 98, cloud: 98, atmThickness: 0.995, co2: 429.53 },
    t2m: 300.8,
    surfaceAlbedo: 0.042,
    imageUrl: null,
  },
  {
    id: "amazon",
    name: "아마존",
    lat: -3.5,
    lng: -60.0,
    values: { iceThickness: 0, ocean: 10, cloud: 87, atmThickness: 0.993, co2: 429.53 },
    t2m: 299.2,
    surfaceAlbedo: 0.144,
    imageUrl: "/assets/location-amazon.jpg",
  },
];
