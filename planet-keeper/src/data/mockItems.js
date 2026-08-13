// Item 단계 목데이터. 슬라이더(key, iceThickness/ocean/cloud/atmThickness/co2 - 전부
// 0~100 스케일)에 delta만큼 더해서 기후를 바꾼다.
//
// 원래 기획안의 effects(예: albedo: 0.05, albedoOffset: 0.08)는 실제로는 게임이
// 저장하는 입력값이 아니라 physicsEngine.js가 슬라이더로부터 매번 새로 계산해내는
// 출력값이라 직접 대입할 수 없다 - 그래서 같은 의도(빙하/구름 늘려 알베도 올리기,
// CO2 늘리고 줄이기, 대기 두께 조절)가 나오도록 실제 슬라이더에 대응시켰다.
//
// delta 폭은 원래 값(15/25/30)의 절반 가까이로 줄였다 - useGameStore.useItem이
// 이제 완전히 settle하지 않고 한 걸음만 진행하는데(computeItemStepResult), 원래
// 폭으로는 한 번에 ΔE=0을 훌쩍 지나쳐버려서 같은 방향 아이템만 반복해서는 절대
// epsilon(±5) 안에 못 들어가는 경우가 있었다.
//
// "이 아이템이 어느 ΔE 방향에 도움이 되는가"는 여기 정적 필드로 두지 않는다 -
// co2/atmThickness는 둘 다 같은 greenhouseStrength 상한(GREENHOUSE_MAX)을 거치므로, 한쪽이
// 이미 상한에 걸려 있으면 정적 태그와 달리 실제 효과가 0인 경우가 생긴다.
// useGameStore.pickVisibleItems가 매번 물리엔진으로 직접 계산해서 판단한다.

export const MOCK_ITEMS = [
  {
    id: "ice_restorer",
    name: "빙하 복구제",
    emoji: "🧊",
    description: "빙하 비율을 높여 지표면 알베도를 인위적으로 증가시키고 태양 에너지 반사량을 늘립니다.",
    key: "iceThickness",
    delta: 8,
  },
  {
    // ice_restorer의 반대 방향 - 빙하/구름/대기는 원래 증가만 가능해서, CO2를
    // 이미 최대로 낮춘 뒤에도 알베도가 계속 높으면 회복 경로가 없었다(소프트락).
    id: "ice_melter",
    name: "빙하 해빙제",
    emoji: "🔥",
    description: "빙하를 인위적으로 녹여 지표면 알베도를 낮추고 태양 에너지 흡수량을 늘립니다.",
    key: "iceThickness",
    delta: -8,
  },
  {
    id: "cloud_seeder",
    name: "인공 구름 생성기",
    emoji: "☁️",
    description: "대기 상층부에 구름을 형성하여 태양광 반사율(알베도)을 즉각적으로 끌어올립니다.",
    key: "cloud",
    delta: 12,
  },
  {
    id: "cloud_clearer",
    name: "구름 제거제",
    emoji: "🌤️",
    description: "대기 상층부의 구름을 흩어 태양광 반사율(알베도)을 낮추고 흡수량을 늘립니다.",
    key: "cloud",
    delta: -12,
  },
  {
    id: "carbon_capture",
    name: "탄소 포집 장치",
    emoji: "🏭",
    description: "대기 중 온실가스(CO2)를 흡수하여 대기 재복사 에너지를 줄이고 온도를 낮춥니다.",
    key: "co2",
    delta: -12,
  },
  {
    id: "greenhouse_emitter",
    name: "온실가스 방출기",
    emoji: "🌋",
    description: "지열을 자극해 CO2를 강제 방출하고 대기 재복사량을 늘려 극도의 저온 상태를 탈출합니다.",
    key: "co2",
    delta: 12,
  },
  {
    // ponytail: 원본 설명(태양 유입 에너지 총량 조정)은 지금 코드에 없는 값이다
    // (SOLAR_CONSTANT는 고정 상수, 슬라이더가 아님) - 반사판 효과를 구름 슬라이더로 근사함.
    // 실제로 "태양 유입 총량"을 조절하는 기능이 생기면 그때 제대로 연결할 것.
    id: "space_mirror",
    name: "반사판 설치",
    emoji: "☀️",
    description: "행성 외곽의 궤도 반사경을 조절해 태양 유입 에너지 총량과 알베도를 미세하게 조정합니다.",
    key: "cloud",
    delta: 8,
  },
  {
    id: "density_regulator",
    name: "대기 밀도 조절기",
    emoji: "🌫️",
    description: "대기의 전반적인 두께를 압축 및 팽창시켜 대기 흡수율과 복사 보유 능력을 동시 조정합니다.",
    key: "atmThickness",
    delta: 15,
  },
  {
    id: "atm_thinner",
    name: "대기 감압 장치",
    emoji: "🌬️",
    description: "대기를 강제로 얇게 압축해 온실효과를 줄이고 지표 복사가 우주로 더 잘 빠져나가게 합니다.",
    key: "atmThickness",
    delta: -15,
  },
];
