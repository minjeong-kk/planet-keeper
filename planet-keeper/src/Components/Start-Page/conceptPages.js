// 기후 개념 도감에 실리는 개념 목록(ConceptBook 지면 데이터).
// 공식/계수는 utils/physicsEngine.js 의 실제 계산과 어긋나지 않게 맞춰 둔다
// (albedoOf / greenhouseStrengthOf / CO2_BASELINE_PPM).
//
// 우측 본문은 예전에 body 한 덩어리(긴 문단)였다. 한 화면에 통짜 문단이 들어가
// 읽히지 않아서, 같은 문장을 그대로 두고 "핵심 / 과정 / 공식 / 관계 / 게임 적용 /
// 데이터"로 쪼갠 sections 배열로 바꿨다. 문장·수치·공식은 하나도 지우거나 고치지
// 않았고 위치만 옮겼다 - 수치가 카드로 빠져나간 자리에서만 본문의 중복 괄호를
// 걷어냈다(알베도의 실제 지점 4개).
//
// sections 블록 종류 - ConceptBook.jsx 의 렌더러와 1:1로 대응한다:
//   note    { icon, heading, tone?: "key" | "game" | "warn", paragraphs: [문장] }
//   flow    { icon, heading, steps: [{ text, icon?, tone?: "loss" | "gain" }],
//             loop?: 마지막에서 처음으로 돌아가는 화살표 문구, caption? }
//   formula { icon, heading, lines: [식], caption? }
//   rules   { icon, heading, rows: [{ cond, effect, dir: "up" | "down" }], caption? }
//   bars    { icon, heading, items: [{ icon, label, value }], max, caption? }
//   stats   { icon, heading, items: [{ label, value, note? }], caption? }
//
// 새 블록 종류를 늘리기 전에 위 여섯 개로 표현할 수 있는지 먼저 본다 - 개념마다
// 전용 블록을 만들면 렌더러가 개념 수만큼 갈라진다.
export const CONCEPT_PAGES = [
  {
    key: "heatBalance",
    label: "ENERGY BALANCE",
    title: "에너지 평형",
    tab: "에너지",
    summary: "들어온 태양 에너지 = 반사된 에너지 + 방출된 지구 복사 에너지",
    formula: "ΔE = S(1 − a) − ε·σ·T⁴",
    sections: [
      {
        type: "note",
        tone: "key",
        icon: "⚖️",
        heading: "핵심 개념",
        paragraphs: [
          "행성의 온도가 변하지 않는다는 것은, 흡수한 에너지와 내보낸 에너지가 같다는 뜻입니다.",
        ],
      },
      {
        type: "flow",
        icon: "☀️",
        heading: "에너지는 어떻게 이동할까?",
        steps: [
          { icon: "☀️", text: "태양 에너지가 들어옴" },
          { icon: "↩️", text: "일부는 반사됨 (S·a)", tone: "loss" },
          { icon: "🌍", text: "나머지는 지표가 흡수함", tone: "gain" },
          { icon: "♨️", text: "지표가 열에너지(적외선)로 방출함" },
          { icon: "🌌", text: "그중 일부가 우주로 빠져나감" },
        ],
        caption:
          "들어온 태양 에너지(S)는 일부가 그대로 반사되고(S·a), 나머지가 흡수된 뒤 지구 복사(ε·σ·T⁴)로 우주로 방출됩니다.",
      },
      {
        type: "formula",
        icon: "📐",
        heading: "에너지 불균형",
        lines: ["ΔE = S(1 − a) − ε·σ·T⁴"],
        caption: "이 균형에서 얼마나 벗어났는지를 나타내는 값이 ΔE 입니다.",
      },
      {
        type: "rules",
        icon: "📌",
        heading: "ΔE 가 말해 주는 것",
        rows: [
          { cond: "ΔE > 0", effect: "에너지 과다 → 기온 상승", dir: "up" },
          { cond: "ΔE < 0", effect: "에너지 부족 → 기온 하강", dir: "down" },
        ],
      },
      {
        type: "note",
        tone: "game",
        icon: "🎮",
        heading: "게임에서는",
        paragraphs: [
          "|ΔE| 가 0에 가까울수록 에너지 평형에 가까운 상태입니다. 게임에서는 일정 범위 안에 들어오면 '평형'으로 판정합니다.",
        ],
      },
    ],
  },
  {
    key: "albedo",
    label: "ALBEDO",
    title: "알베도와 흡수",
    tab: "알베도",
    summary: "표면이 밝을수록 더 많이 반사하고, 그만큼 덜 흡수한다",
    // physicsEngine.js albedoOf() 와 계수·상수까지 완전히 같은 식을 싣는다.
    formula:
      "지표 = (빙하·0.8 + 바다·0.08 + 육지·0.2) ÷ 합,   a = 지표·(1 − 구름) + 구름·0.5",
    sections: [
      {
        type: "note",
        tone: "key",
        icon: "☀️",
        heading: "핵심 개념",
        paragraphs: ["알베도(a)는 행성이 햇빛을 되돌려 보내는 비율입니다."],
      },
      {
        type: "bars",
        icon: "🎨",
        heading: "표면별 반사율",
        max: 1,
        items: [
          { icon: "🧊", label: "빙하", value: 0.8 },
          { icon: "☁️", label: "구름", value: 0.5 },
          { icon: "🌍", label: "육지", value: 0.2 },
          { icon: "🌊", label: "바다", value: 0.08 },
        ],
        caption:
          "표면마다 반사율이 달라서 눈·얼음은 0.8, 육지는 0.2, 어두운 바다는 0.08 정도이고, 구름은 0.5입니다.",
      },
      {
        type: "formula",
        icon: "📐",
        heading: "계산 방법",
        lines: [
          "지표 = (빙하·0.8 + 바다·0.08 + 육지·0.2) ÷ 합",
          "a = 지표·(1 − 구름) + 구름·0.5",
        ],
        caption:
          "먼저 빙하·바다·육지가 차지하는 면적으로 지표의 평균 반사율을 구합니다(육지는 빙하와 바다가 쓰고 남은 면적입니다).",
      },
      {
        type: "note",
        icon: "☁️",
        heading: "구름이 100%라면?",
        paragraphs: [
          "그다음 구름이 그 지표를 덮으므로, 덮인 만큼은 구름의 반사율로 바뀝니다 — 그래서 구름이 100%면 지표가 무엇이든 a = 0.5 가 됩니다.",
        ],
      },
      {
        type: "flow",
        icon: "🔄",
        heading: "에너지와의 관계",
        steps: [
          { text: "알베도 ↑" },
          { text: "반사 ↑", tone: "loss" },
          { text: "흡수 에너지 ↓" },
          { text: "온도 ↓" },
        ],
        caption:
          "흡수하는 에너지는 ASR = S × (1 − a) 이므로 알베도가 커질수록 흡수량은 줄어듭니다.",
      },
      {
        type: "stats",
        icon: "🌐",
        heading: "지구 기준 조성",
        items: [
          { label: "빙하", value: "10%" },
          { label: "바다", value: "70%" },
          { label: "구름", value: "30%" },
          { label: "알베도 a", value: "≈ 0.27", note: "실제 지구 ≈ 0.30" },
        ],
        caption:
          "지구 기준 조성(빙하 10% · 바다 70% · 구름 30%)을 넣으면 a ≈ 0.27 로, 실제 지구 평균(≈ 0.30)에 가까운 값이 나옵니다.",
      },
      {
        type: "stats",
        icon: "📍",
        heading: "실제 지점 데이터",
        items: [
          { label: "사하라", value: "0.32" },
          { label: "아마존", value: "0.14" },
          { label: "남극", value: "0.82" },
          { label: "태평양", value: "0.04" },
        ],
      },
      {
        type: "note",
        tone: "game",
        icon: "🎮",
        heading: "게임 데이터 · 실제 지점",
        paragraphs: [
          "지도에서 지점을 고르면 지표 반사율을 위 식으로 추정하지 않고 그 지점의 실측값을 그대로 씁니다.",
          "이후 빙하나 바다 슬라이더를 움직이면 실측값은 더 이상 그 행성을 설명하지 못하므로 위 식으로 돌아갑니다.",
        ],
      },
    ],
  },
  {
    key: "greenhouse",
    label: "GREENHOUSE · CO₂",
    title: "온실효과와 CO₂",
    tab: "온실효과",
    summary: "온실가스가 지표 복사를 되잡아 우주로 나가는 양을 줄인다",
    formula: "OLR = (1 − g) · σ · T⁴,   g ∝ log₂(CO₂ / 429.53ppm)",
    sections: [
      {
        type: "note",
        tone: "key",
        icon: "🌡️",
        heading: "핵심 개념",
        paragraphs: [
          "지표는 흡수한 에너지를 적외선으로 내보내는데, CO₂ 같은 온실가스는 이 적외선을 흡수한 뒤 일부를 다시 지표로 돌려보냅니다.",
          "그래서 우주로 실제로 빠져나가는 양(OLR)이 줄어듭니다.",
        ],
      },
      {
        type: "flow",
        icon: "🔥",
        heading: "에너지가 되잡히는 과정",
        steps: [
          { icon: "🌍", text: "지표" },
          { icon: "♨️", text: "적외선 에너지 방출" },
          { icon: "🫧", text: "CO₂ 등 온실가스가 일부 흡수" },
          { icon: "↩️", text: "일부를 다시 지표로 돌려보냄", tone: "gain" },
          { icon: "🌌", text: "우주로 빠져나가는 에너지 감소", tone: "loss" },
          { icon: "🌡️", text: "평형을 이루는 온도 상승" },
        ],
      },
      {
        type: "formula",
        icon: "📐",
        heading: "게임의 물리 모델",
        lines: ["OLR = (1 − g) · σ · T⁴", "g ∝ log₂(CO₂ / 429.53ppm)"],
        caption:
          "온실효과 강도를 g 라 하면 방출률은 ε = 1 − g 입니다. CO₂ 는 농도가 2배가 될 때마다 같은 폭으로 효과가 커지는 로그 응답을 보입니다.",
      },
      {
        type: "stats",
        icon: "📊",
        heading: "게임의 기준값",
        items: [
          { label: "기준 CO₂ 농도", value: "429.53 ppm" },
          { label: "온실효과 강도 g", value: "0.386", note: "지구 기준 조성" },
          { label: "지표 방출", value: "391 W/m²" },
          { label: "우주로 방출", value: "240 W/m²" },
        ],
        // 원문 두 문장(ppm 출처 / g 근거)을 그대로 두고 문단만 나눴다 - 한
        // 덩어리로 두면 여기만 6~7줄이 되어 다시 통짜 문단이 된다.
        caption: [
          "기준 농도 429.53 ppm 은 이 게임이 '현재 지구'로 삼는 값으로, 기상청 관측소 3곳(울릉도·독도, 안면도, 고산)의 2024년 월별 실측을 평균한 수치입니다.",
          "지구 기준 조성에서 g = 0.386 이 되는데, 이는 실제 지구에서 지표가 내보내는 391 W/m² 중 240 W/m² 만 우주로 빠져나간다는 관측과 같은 값입니다.",
        ],
      },
      {
        type: "note",
        tone: "game",
        icon: "🎮",
        heading: "게임에서는",
        paragraphs: ["CO₂ 가 늘면 방출이 줄어 평형을 이루는 온도 자체가 높아집니다."],
      },
    ],
  },
  {
    key: "feedback",
    label: "POSITIVE FEEDBACK",
    title: "양의 피드백",
    tab: "피드백",
    summary: "결과가 원인을 다시 키워 변화가 스스로 가속한다",
    formula: "기온 ↑ → 빙하 ↓ → a ↓ → 흡수 ↑ → 기온 ↑↑",
    sections: [
      {
        type: "note",
        tone: "key",
        icon: "🔄",
        heading: "핵심 개념",
        paragraphs: ["변화의 결과가 원인을 다시 키우면 변화는 스스로 가속합니다."],
      },
      {
        type: "flow",
        icon: "🧊",
        heading: "되먹임 고리",
        steps: [
          { icon: "🌡️", text: "기온 ↑" },
          { icon: "🧊", text: "빙하 ↓" },
          { icon: "🎨", text: "알베도 ↓" },
          { icon: "☀️", text: "흡수 에너지 ↑", tone: "gain" },
          { icon: "🔥", text: "기온 ↑↑" },
        ],
        loop: "다시 기온 ↑ 으로 — 한 바퀴마다 출발점이 더 나빠진다",
        caption:
          "기온이 올라 빙하가 녹으면 밝은 얼음이 사라져 알베도가 낮아지고, 흡수하는 에너지가 늘어 기온이 또 올라가고, 빙하는 다시 더 녹습니다.",
      },
      {
        type: "note",
        tone: "warn",
        icon: "⚠️",
        heading: "임계점 · 티핑 포인트",
        paragraphs: [
          "고리가 한 바퀴 돌 때마다 출발점이 더 나빠지고, 어느 지점을 넘기면 원래대로 되돌리기 어려워지는데 이 지점을 임계점(티핑 포인트)이라 부릅니다.",
        ],
      },
    ],
  },
];
