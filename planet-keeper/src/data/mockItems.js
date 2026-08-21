// Item 단계 목데이터. 슬라이더(key, iceThickness/ocean/cloud/atmThickness/co2 - 전부
// 0~100 스케일)에 delta만큼 더해서 기후를 바꾼다.
//
// 원래 기획안의 effects(예: albedo: 0.05, albedoOffset: 0.08)는 실제로는 게임이
// 저장하는 입력값이 아니라 physicsEngine.js가 슬라이더로부터 매번 새로 계산해내는
// 출력값이라 직접 대입할 수 없다 - 그래서 같은 의도(빙하/구름 늘려 알베도 올리기,
// CO2 늘리고 줄이기, 대기 두께 조절)가 나오도록 실제 슬라이더에 대응시켰다.
//
// delta 폭은 원래 값(15/25/30)의 절반 가까이로 줄였다 - useGameStore.applyEquipment가
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
    description: "대기 상층부에 구름을 형성하여 태양광 반사율(알베도)을 즉각적으로 끌어올립니다. 구름은 온실효과에도 함께 작용해 나가는 복사를 붙잡는 양도 늘립니다.",
    key: "cloud",
    delta: 12,
  },
  {
    id: "cloud_clearer",
    name: "구름 제거제",
    emoji: "🌤️",
    description: "대기 상층부의 구름을 흩어 태양광 반사율(알베도)을 낮추고 흡수량을 늘립니다. 구름은 온실효과에도 함께 작용해 나가는 복사를 붙잡는 양도 줄입니다.",
    key: "cloud",
    delta: -12,
  },
  {
    // co2Term은 로그 응답이라 넓은 범위를 커버한다 - delta가 크면(원래 12) 빙하/구름을
    // 어떻게 세팅해도 이 아이템 두세 번으로 ΔE가 닫혀 항상 Earth-like Stable로
    // 수렴했다(빙하/구름 조성이 결과에 반영 안 됨). 6으로 줄여 다른 슬라이더의
    // 비중을 키운다.
    id: "carbon_capture",
    name: "탄소 포집 장치",
    emoji: "🏭",
    description: "대기 중 온실가스(CO2)를 흡수하여 대기 재복사 에너지를 줄이고 온도를 낮춥니다.",
    key: "co2",
    delta: -6,
  },
  {
    id: "greenhouse_emitter",
    name: "온실가스 방출기",
    emoji: "🌋",
    description: "지열을 자극해 CO2를 강제 방출하고 대기 재복사량을 늘려 극도의 저온 상태를 탈출합니다.",
    key: "co2",
    delta: 6,
  },
  {
    // 반사판 효과를 구름 슬라이더로 근사함 - "태양 유입 총량"(SOLAR_CONSTANT)은
    // 고정 상수라 태양 유입을 직접 줄일 수는 없다. 그 기능이 따로 생기면 연결할 것.
    //
    // 근사라는 사실을 description에도 적는다 - 예전에는 "지표면 알베도를 높인다"고만
    // 적혀 있었는데 두 군데가 틀렸다. (1) albedoOf에서 지표면 알베도는 빙하·바다·육지
    // 면적으로만 정해지고 구름은 그 위를 덮는 항이라, 이 아이템이 바꾸는 건 행성
    // 알베도다. (2) 구름 슬라이더라서 온실효과(cloudGreenhouseTerm)에도 같이 작용하는데
    // 그 말이 없어서, ItemInfoModal이 "온실효과 증가"를 함께 보여주면 설명과 모달이
    // 서로 다른 물건을 가리켰다.
    id: "space_mirror",
    name: "반사판 설치",
    emoji: "☀️",
    description: "행성 외곽의 궤도 반사경을 조절해 행성 알베도를 높이고 태양 에너지 반사량을 늘립니다. 이 게임에서는 구름 비율로 근사하므로 온실효과에도 함께 작용합니다.",
    key: "cloud",
    delta: 8,
  },
  {
    // CO2 계열과 마찬가지로 온실효과(greenhouseStrengthOf) 쪽 레버라 delta가 크면
    // 빙하/구름으로 세팅한 조성과 무관하게 이 아이템 몇 번만으로 ΔE가 닫혀버려서
    // 항상 Earth-like Stable로 수렴했다(원래 delta 15 - 아래 co2 delta 6과 같은
    // 이유로 축소). 두 계열(co2/atmThickness) 다 줄여야 빙하·구름 조성이 결과
    // 온도(Cold/Earth-like/Warm Stable)에 실제로 반영된다.
    id: "density_regulator",
    name: "대기 밀도 조절기",
    emoji: "🌫️",
    description: "대기의 전반적인 두께를 팽창시켜 온실효과를 강화하고 지표 복사가 우주로 빠져나가는 양을 줄입니다.",
    key: "atmThickness",
    delta: 8,
  },
  {
    id: "atm_thinner",
    name: "대기 감압 장치",
    emoji: "🌬️",
    description: "대기를 강제로 얇게 압축해 온실효과를 줄이고 지표 복사가 우주로 더 잘 빠져나가게 합니다.",
    key: "atmThickness",
    delta: -8,
  },
];
