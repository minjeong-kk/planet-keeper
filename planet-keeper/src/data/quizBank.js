// 기후 퀴즈 문제 은행. QuizModal이 기대하는 모양({id, title, choices, answer})에 맞춤.
// STAGE1 = 아이템 사용 전(열수지 계산 위주), STAGE2 = 아이템 사용 후(개념/기상학 위주).
// 계산 문제의 공식·상수는 전부 src/utils/physicsEngine.js(albedoOf/greenhouseStrengthOf/
// CO2_BASELINE_PPM)와 data-pipeline/ML-Scripts/label_rules.py(EPSILON_ENERGY_BALANCE,
// COLD_STABLE_MAX_K, EARTH_LIKE_MAX_K)에서 실제 쓰는 값을 그대로 가져왔다.

export const STAGE1_QUESTIONS = [
  {
    id: "s1-albedo-1",
    title:
      "physicsEngine.js의 알베도 공식: albedo = 0.12 + 0.45×빙하비율 + 0.3×구름비율 − 0.05×바다비율. " +
      "빙하 15%, 바다 55%, 구름 10%일 때 알베도는?",
    choices: ["0.19", "0.2175", "0.15", "0.24"],
    answer: "0.19",
  },
  {
    id: "s1-absorbed-energy",
    title:
      "알베도가 0.19로 계산됐다. 태양복사 기준상수 S=100(physicsEngine.js SOLAR_CONSTANT)일 때, " +
      "흡수 단파복사(ASR = S×(1−albedo))는?",
    choices: ["19", "62", "81", "100"],
    answer: "81",
  },
  {
    id: "s1-greenhouse",
    title:
      "greenhouseStrengthOf 공식은 0.3 + 0.25×log2(CO2/432) + 0.35×(대기두께−1) + 0.1×구름비율이다. " +
      "CO2 610ppm, 대기두께 1(지구 기준), 구름비율 0.10일 때 온실효과 강도는? (log2(610/432)≈0.5)",
    choices: ["0.30", "0.43", "0.55", "0.12"],
    answer: "0.43",
  },
  {
    id: "s1-ocean-albedo-direction",
    title: "physicsEngine.js 공식에서 바다비율 항의 계수가 −0.05인 이유로 가장 적절한 것은?",
    choices: [
      "바다가 육지보다 어두워 반사율(알베도)을 낮추기 때문",
      "바다가 육지보다 밝아 반사율을 높이기 때문",
      "바다는 알베도 계산과 무관해서 무작위로 넣은 계수이기 때문",
      "바다비율이 늘면 온실효과가 줄기 때문",
    ],
    answer: "바다가 육지보다 어두워 반사율(알베도)을 낮추기 때문",
  },
  {
    id: "s1-co2-baseline",
    title: "physicsEngine.js에서 온실효과가 '기준(중립)'이 되는 CO2 배경 농도(CO2_BASELINE_PPM)는 몇 ppm인가?",
    choices: ["280ppm", "350ppm", "432ppm", "610ppm"],
    answer: "432ppm",
  },
  {
    id: "s1-state-deficit",
    title:
      "label_rules.py 기준, deltaEnergy = −8 (EPSILON_ENERGY_BALANCE=5보다 크게 음수)일 때 " +
      "이 행성의 상태(state)로 옳은 것은?",
    choices: ["Energy Deficit (냉각 폭주 위험)", "Cold Stable", "Earth-like Stable", "Energy Surplus (온난화 폭주 위험)"],
    answer: "Energy Deficit (냉각 폭주 위험)",
  },
  {
    id: "s1-state-earthlike",
    title:
      "deltaEnergy = 2(평형 오차범위 ±5 이내), 온도 290K(COLD_STABLE_MAX_K=280, EARTH_LIKE_MAX_K=295 사이)일 때 " +
      "state 판정으로 옳은 것은?",
    choices: ["Cold Stable", "Earth-like Stable", "Warm Stable", "Energy Surplus"],
    answer: "Earth-like Stable",
  },
];

export const STAGE2_QUESTIONS = [
  {
    id: "s2-state-meaning",
    title: "게임의 5가지 행성 상태(state) 중 'Energy Deficit'이 실제로 의미하는 것은?",
    choices: [
      "흡수 에너지가 부족해 냉각이 진행 중인, 저온 폭주 위험 상태",
      "온도가 너무 높아 열폭주가 진행 중인 상태",
      "이미 평형에 도달한 안정 상태",
      "빙하가 전혀 없는 상태",
    ],
    answer: "흡수 에너지가 부족해 냉각이 진행 중인, 저온 폭주 위험 상태",
  },
  {
    id: "s2-co2-log",
    title: "physicsEngine.js에서 CO2 농도가 온실효과 강도에 반영되는 방식으로 옳은 것은?",
    choices: [
      "농도에 정비례해서 커진다",
      "농도의 로그(log2)에 비례해서 커진다 - 농도가 늘수록 증가폭은 둔화된다",
      "일정 농도를 넘기 전까지는 전혀 영향이 없다",
      "CO2는 온실효과 계산에 들어가지 않는다",
    ],
    answer: "농도의 로그(log2)에 비례해서 커진다 - 농도가 늘수록 증가폭은 둔화된다",
  },
  {
    id: "s2-glacier-feedback",
    title: "빙하비율이 줄어들 때 physicsEngine.js 공식상 나타나는 연쇄 반응으로 옳은 것은?",
    choices: [
      "빙하 감소 → 알베도 감소(계수 0.45) → 흡수 에너지 증가 → 온난화 방향",
      "빙하 감소 → 알베도 증가 → 흡수 에너지 감소 → 냉각 방향",
      "빙하 감소 → CO2 자동 감소 → 온실효과 감소",
      "빙하비율은 알베도 계산에 들어가지 않는다",
    ],
    answer: "빙하 감소 → 알베도 감소(계수 0.45) → 흡수 에너지 증가 → 온난화 방향",
  },
  {
    id: "s2-cold-stable-boundary",
    title: "label_rules.py 기준, 평형 상태(|deltaEnergy| ≤ 5)에서 온도가 몇 K 미만이면 'Cold Stable'로 분류되는가?",
    choices: ["270K 미만", "280K 미만", "288K 미만", "295K 미만"],
    answer: "280K 미만",
  },
  {
    id: "s2-atm-thickness",
    title: "physicsEngine.js에서 대기두께(atmThickness)가 1(지구 기준)보다 커질 때 온실효과 강도는 어떻게 변하나?",
    choices: [
      "커진다 (atmTerm = 0.35×(대기두께−1)이 양수가 됨)",
      "작아진다",
      "변화 없다",
      "대기두께는 온실효과 계산에 들어가지 않는다",
    ],
    answer: "커진다 (atmTerm = 0.35×(대기두께−1)이 양수가 됨)",
  },
];
