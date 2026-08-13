// 행성 만들기의 "특정 지점 선택" 목데이터. 실측 위경도 데이터가 들어오면 이
// 배열만 실측 소스로 교체하면 된다 - 화면(PlanetLocationPicker)과 위경도->화면
// 좌표 변환(utils/geo.js)은 이 배열의 형태({id, name, lat, lng, values, t2m,
// imageUrl})만 보고 동작하므로 그대로 재사용된다.
//
// values는 슬라이더가 아니라 실제 물리 단위다(co2는 ppm, atmThickness는
// physicsEngine.mapSlidersToClimateInputs가 쓰는 0.4~2.0 스케일) - iceThickness/
// ocean/cloud만 원래부터 0~100 슬라이더 스케일과 같다. useClimateStore.
// setValuesFromPoint가 co2/atmThickness만 슬라이더 스케일로 역변환한다.
//
// t2m(선택, 단위 K)은 그 지점의 대략적인 실측 기온이다 - 아직 KIM 실측 연동
// 전이라 문헌상 평년값으로 어림한 참고용 숫자다. 있으면 setValuesFromPoint가
// currentTemperature도 같이 세팅해서, "이 지점은 실제로 평형/불평형인가"를
// 그 자리에서 계산해 보여줄 수 있다(PlanetLocationPicker의 안내 문구 참고).
// 실측 KIM t2m이 들어오면 이 값만 교체하면 된다.
//
// imageUrl(선택)은 그 지점의 실제 사진 경로다. 사하라만 우선 채웠고(출처·
// 라이선스는 README.md "Assets & Licensing" 참고), 나머지는 아직 라이선스
// 확인 전이라 null로 비워두고 회색 플레이스홀더를 대신 보여준다(PlanetCreatePage
// 참고). 실제 이미지를 넣을 땐 CLAUDE.md 절차(라이선스 확인 → README.md에
// 출처·라이선스 기록)를 먼저 따르고, 이 필드만 경로로 채우면 나머지는 그대로
// 동작한다.
export const CLIMATE_POINTS = [
  {
    id: "seoul",
    name: "서울",
    lat: 37.5,
    lng: 127.0,
    values: { iceThickness: 5, ocean: 20, cloud: 45, atmThickness: 1.0, co2: 420 },
    t2m: 286.5,
    imageUrl: null,
  },
  {
    id: "sahara",
    name: "사하라 사막",
    lat: 23.4,
    lng: 8.7,
    values: { iceThickness: 0, ocean: 0, cloud: 5, atmThickness: 0.9, co2: 420 },
    t2m: 302.5,
    // NASA ISS 우주비행사 사진(ISS061-E-98063). 출처·라이선스는 README.md
    // "Assets & Licensing" 참고.
    imageUrl: "/assets/location-sahara.jpg",
  },
  {
    id: "antarctica",
    name: "남극",
    lat: -75.3,
    lng: 0.0,
    values: { iceThickness: 95, ocean: 5, cloud: 20, atmThickness: 1.0, co2: 420 },
    t2m: 223.0,
    imageUrl: null,
  },
  {
    id: "pacific",
    name: "태평양 중심",
    lat: 0.0,
    lng: -160.0,
    values: { iceThickness: 0, ocean: 98, cloud: 55, atmThickness: 1.0, co2: 420 },
    t2m: 300.0,
    imageUrl: null,
  },
  {
    id: "amazon",
    name: "아마존",
    lat: -3.5,
    lng: -60.0,
    values: { iceThickness: 0, ocean: 10, cloud: 70, atmThickness: 1.0, co2: 420 },
    t2m: 298.5,
    imageUrl: null,
  },
];
