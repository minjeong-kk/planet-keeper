// Physics 결과를 "원인 → 문제 → 해결 방향"으로 해석하는 모듈.
// 상태 판정(planetStateOf)은 지금 상태(label)만 정하고, 그 상태를 왜 그렇게
// 됐는지 설명하는 건 여기서 physicsResult 실제 값을 기준값과 비교해서 만든다 -
// 라벨별로 문장을 하드코딩하지 않고, CO2/알베도/대기두께가 실제로 기준보다
// 높은지 낮은지에 따라 매번 다시 생성된다.

import {
  CO2_BASELINE_PPM,
  BASELINE_ALBEDO,
  BASELINE_ATM_THICKNESS,
  ENERGY_BALANCE_EPSILON,
  ENERGY_SCALE,
  energyStateOf,
} from "./physicsEngine.js";

const COMPARE_TOLERANCE = 0.05; // 기준값 대비 ±5% 이내는 "정상"으로 본다

function statusOf(value, baseline) {
  const diffRatio = (value - baseline) / baseline;
  if (diffRatio > COMPARE_TOLERANCE) return "high";
  if (diffRatio < -COMPARE_TOLERANCE) return "low";
  return "normal";
}

// 각 요인이 "high/low"일 때 온난화(warming) 방향 원인인지 냉각(cooling) 방향
// 원인인지, 그리고 그 방향에서 도움이 되는 아이템(mockItems.js id)이 무엇인지.
// CO2/대기두께는 높을수록 온난화, 알베도는 낮을수록 온난화(반대 방향)라 개별 정의한다.
const FACTORS = [
  {
    id: "co2",
    getValue: (ctx) => ctx.co2Ppm,
    baseline: CO2_BASELINE_PPM,
    warmingStatus: "high",
    coolingStatus: "low",
    cause: { high: "CO₂ 농도가 기준보다 높습니다.", low: "CO₂ 농도가 기준보다 낮습니다." },
    solution: { high: "CO₂ 감소", low: "CO₂ 증가" },
  },
  {
    id: "albedo",
    getValue: (ctx) => ctx.albedo,
    baseline: BASELINE_ALBEDO,
    warmingStatus: "low",
    coolingStatus: "high",
    cause: { high: "알베도가 기준보다 높습니다.", low: "알베도가 기준보다 낮습니다." },
    solution: { high: "알베도 감소", low: "알베도 증가" },
  },
  {
    id: "atmThickness",
    getValue: (ctx) => ctx.atmThickness,
    baseline: BASELINE_ATM_THICKNESS,
    warmingStatus: "high",
    coolingStatus: "low",
    cause: { high: "대기 두께가 기준보다 두껍습니다.", low: "대기 두께가 기준보다 얇습니다." },
    solution: { high: "대기 두께 감소", low: "대기 두께 증가" },
  },
];

// direction: "warming"(에너지 과다/고온 방향) | "cooling"(에너지 부족/저온 방향)
// 요인이 그 방향에 실제로 기여하고 있을 때만(기준을 벗어난 상태 + 방향 일치) 뽑는다.
function relevantFactors(ctx, direction) {
  const matches = [];
  for (const factor of FACTORS) {
    const status = statusOf(factor.getValue(ctx), factor.baseline);
    if (status === "normal") continue;
    const wantedStatus = direction === "warming" ? factor.warmingStatus : factor.coolingStatus;
    if (status !== wantedStatus) continue;
    matches.push({
      cause: factor.cause[status],
      solution: factor.solution[status],
    });
  }
  return matches;
}

// 부호 있는 숫자 문자열("+9.4" 등) - ΔE처럼 방향(+/-)이 값 자체만큼 중요한
// 수치를 표시할 때 GamePage/ReportPage가 공유해서 쓴다.
export function formatSigned(value, digits = 1) {
  return `${value >= 0 ? "+" : ""}${value.toFixed(digits)}`;
}

// ΔE는 숫자만 보여주지 않는다 - 항상 "무엇이 더 많은지 / 어느 방향으로 가는지"를
// 같은 자리에서 설명한다(describeItemJudgment/describeTransition/energyProblemLines가 공유).
export function deltaEnergyLines(deltaEnergy) {
  // |ΔE|가 이미 평형 허용범위(ENERGY_BALANCE_EPSILON, Stable 판정과 같은 기준) 안이면
  // "점점 따뜻해지는/차가워지는 방향"이라고 말하지 않는다 - 예를 들어 ΔE=+2.9처럼
  // 거의 0인데도 "계속 뜨거워지는 중"으로 들려서, 뒤이어 나오는 성공 문구와 뜻이
  // 충돌하는 것처럼 보인다.
  const nearBalance = Math.abs(deltaEnergy) <= ENERGY_BALANCE_EPSILON;
  const warming = deltaEnergy > 0;
  return [
    `에너지 불균형(ΔE): ${formatSigned(deltaEnergy)} W/m²`,
    nearBalance
      ? "흡수하는 에너지와 방출하는 에너지가 거의 균형을 이루었습니다. 행성은 에너지 평형에 가까운 상태입니다."
      : warming
        ? "흡수하는 에너지가 방출하는 에너지보다 많습니다. 행성은 점점 따뜻해지는 방향입니다."
        : "방출하는 에너지가 흡수하는 에너지보다 많습니다. 행성은 점점 차가워지는 방향입니다.",
  ];
}

// describeItemJudgment/describeTransition처럼 before/after를 둘 다 아는 곳에서만
// 쓴다 - ΔE 숫자 줄만 "이전 -> 이후"로 바꿔서 이 조작 하나가 ΔE를 얼마나 움직였는지
// 바로 보이게 한다. 방향 설명 문장은 항상 지금(after) 상태 기준이어야 하므로
// deltaEnergyLines(after)가 만든 것을 그대로 쓴다.
function deltaEnergyTransitionLines(before, after) {
  const [, directionLine] = deltaEnergyLines(after);
  return [`에너지 불균형(ΔE): ${formatSigned(before)} → ${formatSigned(after)} W/m²`, directionLine];
}

function energyProblemLines(deltaEnergy, direction) {
  return [
    ...deltaEnergyLines(deltaEnergy),
    direction === "warming" ? "장기적으로 온도가 계속 상승합니다." : "장기적으로 온도가 계속 하강합니다.",
  ];
}

/**
 * Planet Summary 패널 데이터를 만든다.
 * mlResult는 useGameStore.nextProblem()이 행성 생성 직후부터 채워두므로 1단계
 * 진입 시점에도 null이 아닐 수 있다 - 조성이 우연히 이미 평형 근처면 여기서도
 * Warm/Cold/Earth-like Stable이 그대로 나온다(실제로 그런 판정이니 숨기지 않음).
 * mlResult가 없을 때만 energyStateOf(deltaEnergy)의 간단한 3분류(Surplus/Deficit/
 * Stable)로 대체한다.
 * @returns {{ label: string, sections: {title:string, lines:string[]}[] } | null}
 */
export function analyzePlanetState({ physicsResult, mlResult, co2Ppm, atmThickness }) {
  if (!physicsResult) return null;

  const label = mlResult ? mlResult.label : energyStateOf(physicsResult.deltaEnergy);
  const ctx = { co2Ppm, atmThickness, albedo: physicsResult.albedo };

  if (label === "Stable") {
    return {
      label,
      sections: [
        {
          title: "현재 상태",
          lines: [
            "에너지가 거의 균형 상태입니다.",
            "실제로 안정적인지는 최종 확인(Final) 단계에서 물리엔진이 판정합니다.",
          ],
         },
        {
          title: "설명",
          lines: [
          "에너지 불균형(ΔE)이 거의 0이며",
          "현재 평균 온도도 기준 범위 안에 있습니다.",
          "장기간 안정적으로 유지될 수 있습니다.",
        ],
      },
      ],
    };
  }

  if (label === "Earth-like Stable") {
    return {
      label,
      sections: [
        {
          title: "현재 상태",
          lines: ["행성이 현대 지구와 유사한 안정 평형 상태에 도달했습니다."],
        },
        {
          title: "",
          lines: [
            `에너지 불균형(ΔE)이 거의 0(${physicsResult.deltaEnergy.toFixed(2)} W/m²)이며`,
            "현재 평균 온도도 기준 범위 내에 있습니다.",
            "현재 행성은 장기간 안정적으로 유지될 수 있습니다.",
          ],
        },
      ],
    };
  }

  if (label === "Warm Stable" || label === "Cold Stable") {
    const direction = label === "Warm Stable" ? "warming" : "cooling";
    const causes = relevantFactors(ctx, direction);
    return {
      label,
      sections: [
        {
          title: "현재 상태",
          lines: [
            "에너지 평형에는 도달했지만",
            direction === "warming"
              ? "평균 온도가 지구 기준보다 높습니다."
              : "평균 온도가 지구 기준보다 낮습니다.",
          ],
        },
        {
          title: "원인",
          lines: causes.length ? causes.map((c) => c.cause) : ["복합적인 요인으로 온도가 기준을 벗어났습니다."],
        },
      ],
    };
  }

  // Energy Surplus / Energy Deficit
  const direction = label === "Energy Surplus" ? "warming" : "cooling";
  const causes = relevantFactors(ctx, direction);

  return {
    label,
    sections: [
      { title: "현재 상태", lines: [label] },
      {
        title: "원인",
        lines: causes.length ? causes.map((c) => c.cause) : ["복합적인 요인으로 에너지 불균형이 발생했습니다."],
      },
      { title: "현재 문제", lines: energyProblemLines(physicsResult.deltaEnergy, direction) },
      {
        title: "해결 방향",
        lines: causes.length ? causes.map((c) => c.solution) : ["행성 조성 전반을 재조정해야 합니다."],
      },
    ],
  };
}

// 아이템 key별 "슬라이더가 어떻게 바뀌었는지" 설명(판정 이유 설명의 첫 줄에 쓴다).
const SLIDER_CHANGE_LINES = {
  iceThickness: (delta) => `빙하가 ${delta > 0 ? "증가" : "감소"}했습니다.`,
  ocean: (delta) => `바다 비율이 ${delta > 0 ? "증가" : "감소"}했습니다.`,
  cloud: (delta) => `구름 양이 ${delta > 0 ? "증가" : "감소"}했습니다.`,
  atmThickness: (delta) => `대기 두께가 ${delta > 0 ? "증가" : "감소"}했습니다.`,
  co2: (delta) => `CO₂가 ${delta > 0 ? "증가" : "감소"}했습니다.`,
};

// 아이템 카드에 쓰는 짧은 라벨용(문장이 아니라 "빙하 감소" 같은 명사형).
const SLIDER_KEY_LABELS = {
  iceThickness: "빙하",
  ocean: "바다",
  cloud: "구름",
  atmThickness: "대기 두께",
  co2: "CO₂",
};

// 장비 카드에 붙이는 아주 짧은 효과 키워드 - "무엇을 바꾸는지 · 데워지는지/식는지"
// 두 조각만 보여준다(예: "구름 증가 · 냉각"). 방향은 previewItemEffect의 사슬 마지막
// 줄("예상 안정 온도 감소/증가")에서 그대로 읽는다 - 정적 표를 새로 만들면 아이템
// 데이터와 어긋날 수 있어서, 이미 있는 설명 데이터 하나만 원본으로 쓴다.
//
// 표시 전용이다. "이 장비가 지금 실제로 도움이 되는가"는 clamp 때문에 정적으로
// 판단할 수 없으므로 게임 로직은 여전히 물리엔진(itemDeltaEnergyChange)으로 판단한다.
export function itemEffectKeyword(item) {
  const change = shortSliderChangeLabel(item.key, item.delta);
  const chain = previewItemEffect(item).chain ?? [];
  const last = chain[chain.length - 1] ?? "";
  const direction = last.includes("감소") ? "냉각" : last.includes("증가") ? "가열" : null;
  return direction ? `${change} · ${direction}` : change;
}
export function shortSliderChangeLabel(key, delta) {
  const label = SLIDER_KEY_LABELS[key] ?? "행성 조성";
  return `${label} ${delta > 0 ? "증가" : "감소"}`;
}

// planetStateOf/energyStateOf 라벨을 색 톤으로 매핑한다 - GamePage(상태 판정 배지)와
// ReportPage(타임라인 라벨 칩)가 같은 상태를 같은 색으로 보여주도록 공유한다.
// 라벨이 없으면(아직 판정 전) "neutral"로 - 실제 상태처럼 색이 칠해지면 안 된다.
const LABEL_TONE = {
  "Earth-like Stable": "earth",
  Stable: "earth",
  "Warm Stable": "warm",
  "Energy Surplus": "warm",
  "Cold Stable": "cold",
  "Energy Deficit": "cold",
};

export function labelTone(label) {
  return LABEL_TONE[label] ?? "neutral";
}

// "의미 있는 변화"로 볼 최소 폭. 비교하는 값의 단위가 두 종류라 상수도 둘로 나눈다 -
// 예전에는 0.005 하나로 둘 다 재고 있었는데, ΔE 쪽 스케일이 바뀌면 0~1 값(알베도·
// 온실효과)의 감지 폭까지 같이 흔들리는 구조였다.
const RATIO_EPSILON = 0.005; // 알베도·온실효과 (0~1 비율)
const ENERGY_EPSILON = 0.005 * ENERGY_SCALE; // ΔE·OLR·ASR (W/m²)

function changeLine(before, after, riseText, fallText, epsilon) {
  if (after > before + epsilon) return riseText;
  if (after < before - epsilon) return fallText;
  return null;
}

function greenhouseChangeLine(before, after) {
  return changeLine(
    before.greenhouseStrength,
    after.greenhouseStrength,
    "온실효과가 더 강해졌습니다.",
    "온실효과가 약해졌습니다.",
    RATIO_EPSILON,
  );
}

// 알베도와 온실효과가 "같이" 바뀌는 경우, 둘이 ΔE에 항상 반대 방향으로 작용하는
// 건 아니다 - 구름 아이템처럼 "하나의 원인"(cloudRatio)이 둘 다 움직이면 항상
// 반대 방향(알베도 변화는 ASR을, 온실효과 변화는 그 반대인 OLR을 움직인다)이지만,
// 이상기후 경고 대응처럼 서로 "다른 원인"(예: 빙하 슬라이더 + CO2 슬라이더를 동시에
// 조정)으로 둘이 같이 바뀌면 오히려 같은 방향(둘 다 냉각 또는 둘 다 온난화)으로
// 힘을 보탤 수도 있다. 그래서 매번 실제 ASR/OLR 변화량의 부호를 보고 반대인지
// 같은 방향인지부터 판단한 뒤에만 "어느 쪽이 이겼는지"를 말한다.
function netAlbedoGreenhouseEffectLine(before, after) {
  const asrDelta = after.absorbedRadiation - before.absorbedRadiation; // 알베도발 ΔE 기여
  const olrDelta = after.outgoingRadiation - before.outgoingRadiation;
  const greenhousePull = -olrDelta; // 온실효과발 ΔE 기여(ΔE = ASR - OLR이므로 부호 반전)

  const sameDirection = (asrDelta > 0) === (greenhousePull > 0);
  if (sameDirection) {
    const netWarming = asrDelta > 0;
    return `이 둘은 ΔE에 같은 방향으로 함께 작용해 전체적으로 ${netWarming ? "데워지는" : "식는"} 방향입니다.`;
  }

  const albedoWins = Math.abs(asrDelta) >= Math.abs(greenhousePull);
  const netWarming = albedoWins ? asrDelta > 0 : greenhousePull > 0;
  return `이 둘은 ΔE에 반대 방향으로 작용하지만, ${albedoWins ? "알베도" : "온실효과"} 쪽 영향이 더 커서 전체적으로는 ${netWarming ? "데워지는" : "식는"} 방향입니다.`;
}

// "왜" 알베도/온실효과가 움직였는지 물리적 이유를 슬라이더별로 한 줄 덧붙인다.
// itemKey로 어느 슬라이더가 움직였는지 확실히 알 때만 쓴다 - 슬라이더 여러 개가
// 동시에 바뀌는 경우(이상기후 대응 등, itemKey 없음)는 원인을 하나로 특정할 수
// 없으므로 여기서 걸러지고(physicsChangeBlocks가 itemKey 없이 부르면 아예 추가
// 안 함), 잘못된 인과를 덧붙이지 않는다.
// ReportPage가 타임라인 설명에서 이 문장들을 "알베도 계열"/"온실효과 계열"로
// 색 구분할 때도 그대로 참조한다(문구를 중복해서 따로 들고 있지 않기 위해 export).
export const ALBEDO_REASON = {
  iceThickness: "빙하는 태양빛을 강하게 반사하는 밝은 표면이라, 비율이 바뀌면 알베도도 함께 움직입니다.",
  cloud: "구름은 태양빛을 반사하는 밝은 표면 역할을 합니다.",
};

export const GREENHOUSE_REASON = {
  cloud: "구름은 지표 복사를 가두는 온실 역할도 동시에 합니다.",
  co2: "CO₂는 대표적인 온실기체로, 지표 복사를 흡수해 대기 중에 가둡니다.",
  atmThickness: "대기가 두꺼워질수록 열을 가두는 능력(온실효과)이 커집니다.",
};

// 알베도/온실효과/OLR/ASR 각각의 변화를 원인->과정 블록으로 만든다. 아이템 사용
// (describeItemJudgment)과 타임라인 전환(describeTransition)이 그대로 공유한다 -
// itemKey를 안 넘기면(타임라인처럼 어떤 아이템이었는지 모르거나, 슬라이더 여러 개가
// 동시에 바뀌어 원인을 하나로 특정할 수 없을 때) physics 값 비교만으로 동작한다.
function physicsChangeBlocks(before, after, itemKey) {
  const blocks = [];

  const albedoLine = changeLine(before.albedo, after.albedo, "알베도가 증가했습니다.", "알베도가 감소했습니다.", RATIO_EPSILON);
  const greenhouseLine = greenhouseChangeLine(before, after);

  // 구름은 albedoOf/greenhouseStrengthOf 둘 다에 들어가는 유일한 변수라 알베도와
  // 온실효과가 "같이" 바뀔 수 있다 - 이건 구름이라는 같은 원인의 서로 독립된 두
  // 결과일 뿐, 알베도가 바뀌어서 온실효과가 바뀌는 인과관계가 아니다. 그래서 둘 다
  // 있으면 화살표로 잇지 않고 같은 블록에 나란히 묶어(withArrows가 블록 "안"에는
  // 화살표를 안 넣는다) 인과관계처럼 안 읽히면서도 둘 다 보여준다.
  const causeLines = [];
  if (albedoLine) {
    causeLines.push(albedoLine);
    if (itemKey && ALBEDO_REASON[itemKey]) causeLines.push(ALBEDO_REASON[itemKey]);
  }
  if (greenhouseLine) {
    causeLines.push(greenhouseLine);
    if (itemKey && GREENHOUSE_REASON[itemKey]) causeLines.push(GREENHOUSE_REASON[itemKey]);
  }
  if (causeLines.length) blocks.push(causeLines);

  // 온실효과 변화가 "우주로 방출되는 에너지"에 어떻게 이어지는지 명시적으로 보여준다 -
  // 학생이 "아이템이 ΔE를 직접 조절한다"고 오해하지 않도록, ΔE는 항상 ASR/OLR
  // 변화의 결과라는 인과 사슬을 끊지 않는다. 단, OLR(outgoingRadiation)은
  // 온실효과뿐 아니라 온도(T⁴)에도 좌우된다 - 조성(온실효과)은 안 바뀌었는데
  // ΔE 때문에 온도만 한 걸음 움직여도 OLR 숫자가 흔들릴 수 있다. 온실효과가
  // 실제로 안 바뀌었다면(greenhouseLine 없음) 그 숫자 변화는 온도 때문일 뿐 이
  // 아이템/전환이 직접 일으킨 게 아니므로 보여주지 않는다 - 안 그러면 순수
  // 알베도 계열 아이템(빙하/구름/바다)에서도 "OLR이 증가했다"는 잘못된 인과가
  // 딸려 나온다.
  const outgoingLine = greenhouseLine
    ? changeLine(
        before.outgoingRadiation,
        after.outgoingRadiation,
        "우주로 방출되는 에너지(OLR)가 증가했습니다.",
        "우주로 방출되는 에너지(OLR)가 감소했습니다.",
        ENERGY_EPSILON,
      )
    : null;
  if (outgoingLine) blocks.push([outgoingLine]);

  // ASR(absorbedRadiation = SOLAR_CONSTANT * (1 - albedo))은 알베도에만 좌우되고
  // 온도와는 무관하다 - albedoLine이 없으면 ASR도 원래 그대로다(안전하게 한 번
  // 더 gate).
  const absorbedLine = albedoLine
    ? changeLine(
        before.absorbedRadiation,
        after.absorbedRadiation,
        "흡수하는 에너지(ASR)가 증가했습니다.",
        "흡수하는 에너지(ASR)가 감소했습니다.",
        ENERGY_EPSILON,
      )
    : null;
  if (absorbedLine) blocks.push([absorbedLine]);

  // 알베도/온실효과가 둘 다 바뀐 경우에만 설명을 붙인다 - 하나만 바뀐 아이템(빙하/
  // CO2 등)은 애초에 서로 견줄 두 효과가 없다.
  if (albedoLine && greenhouseLine) blocks.push([netAlbedoGreenhouseEffectLine(before, after)]);

  return blocks;
}

// blocks: string[][] (블록 하나 = 화살표 없이 붙어 나오는 줄 묶음). 블록 사이에만
// "↓"를 끼워 원인 -> 과정 -> 결과 흐름이 눈에 보이게 한다.
function withArrows(blocks) {
  const lines = [];
  blocks.forEach((block, i) => {
    if (i > 0) lines.push("↓");
    lines.push(...block);
  });
  return lines;
}

// 물리엔진이 판정한 평형 상태(Cold/Earth-like/Warm Stable)별 결과 문구 -
// describeItemJudgment와 describeFinalizeJudgment가 공유한다. 둘 다 매번 새로
// notice를 만들 때 이걸 호출해야 mlResult가 바뀔 때마다 문구도 같이 갱신된다 -
// 아니면 예전에 뜬 문구가 최신 상태와 안 맞게 그대로 남는다. Energy Surplus/
// Deficit(아직 불균형)은 여기서 다루지 않는다 - describeItemJudgment가 이전
// deltaEnergy와 비교해서 "악화" vs "개선되었지만 부족"을 구분해 직접 만든다.
function describeStableLabel(label) {
  if (label === "Earth-like Stable") {
    return ["🌍 지구형 범위 안에서 평형을 이뤘습니다 - 성공적인 선택입니다!"];
  }
  if (label === "Warm Stable") {
    return ["🔥 다만 온도가 지구 기준보다 높은 상태로 안정되었습니다 - 2단계에서 CO2를 낮춰가며 다시 맞춰봅니다."];
  }
  if (label === "Cold Stable") {
    return ["❄️ 다만 온도가 지구 기준보다 낮은 상태로 안정되었습니다 - 2단계에서 CO2를 높여가며 다시 맞춰봅니다."];
  }
  return [];
}

// label이 Energy Surplus/Deficit(아직 불균형)일 때, 이전 deltaEnergy와 비교해서
// 정말로 더 나빠졌는지(방향이 반대인 아이템) 아니면 방향은 맞는데 세기가
// 부족했는지를 구분한다 - 안 그러면 "방향은 맞지만 부족한" 경우까지 전부
// "악화됐다"고 잘못 말하게 된다.
function describeImbalanceChange(before, after, label) {
  const worsened = Math.abs(after.deltaEnergy) > Math.abs(before.deltaEnergy) + ENERGY_EPSILON;
  const warming = label === "Energy Surplus";
  if (worsened) {
    return [
      warming
        ? "🔥 오히려 에너지가 더 과다해졌습니다 - 방향이 반대인 아이템을 골랐습니다."
        : "❄️ 오히려 에너지가 더 부족해졌습니다 - 방향이 반대인 아이템을 골랐습니다.",
    ];
  }
  return [
    warming
      ? "🔥 방향은 맞아 에너지 과다가 줄었지만, 아직 남아있어 행성은 계속 더워지는 중입니다 - 냉각 아이템이 더 필요합니다."
      : "❄️ 방향은 맞아 에너지 부족이 줄었지만, 아직 남아있어 행성은 계속 차가워지는 중입니다 - 온난화 아이템이 더 필요합니다.",
  ];
}

/**
 * 아이템 적용 전/후 Physics 결과를 비교해서 무엇이 바뀌었는지, 그리고 그 결과
 * ΔE가 나아졌는지 나빠졌는지를 순서대로 설명하는 문장 배열을 만든다(before->after
 * 인과 사슬). label은 완전히 settle하지 않고 딱 한 걸음만 진행한 결과다
 * (useGameStore.computeItemStepResult) - 맞는 방향 아이템은 |ΔE|를 줄이고,
 * 틀린 방향이면 |ΔE|를 키운다(describeImbalanceChange가 이 둘을 구분한다).
 * 여러 걸음에 걸쳐 누적되다가 지구형 범위(Cold/Earth-like/Warm Stable)에
 * 들어오면 그때 describeStableLabel로 넘어간다.
 */
export function describeItemJudgment(item, before, after, label) {
  const intro = [`${item.emoji} "${item.name}"을 사용했습니다.`];

  // 원인 -> 과정 -> 결과 순서의 블록들. 각 블록은 그 자체로는 화살표 없이 붙어
  // 나오고, 블록과 블록 사이에만 withArrows가 "↓"를 넣는다 - 그래야 "ΔE 값 +
  // 방향 설명"처럼 한 덩어리로 읽혀야 하는 줄들이 화살표로 쪼개지지 않는다.
  const blocks = [
    [SLIDER_CHANGE_LINES[item.key]?.(item.delta) ?? "행성 조성이 변화했습니다."],
    ...physicsChangeBlocks(before, after, item.key),
  ];

  blocks.push(deltaEnergyTransitionLines(before.deltaEnergy, after.deltaEnergy));
  blocks.push(["물리엔진이 최종 기후 상태를 분석합니다."]);
  blocks.push(
    label === "Energy Surplus" || label === "Energy Deficit"
      ? describeImbalanceChange(before, after, label)
      : describeStableLabel(label),
  );

  return [...intro, ...withArrows(blocks)];
}

/**
 * finalizeGame이 2단계 정답마다 CO2를 조정한 뒤 다시 보여줄 notice를 만든다.
 * describeItemJudgment와 같은 before/after 인과 사슬이지만, 아이템이 아니라
 * CO2 슬라이더 자체를 조정하므로 그 변화 방향만 먼저 보여준다.
 */
export function describeFinalizeJudgment(before, after, label, { co2Increased } = {}) {
  const blocks = [];

  if (co2Increased != null) {
    blocks.push([SLIDER_CHANGE_LINES.co2(co2Increased ? 1 : -1)]);
  }

  const greenhouseLine = greenhouseChangeLine(before, after);
  if (greenhouseLine) blocks.push([greenhouseLine, GREENHOUSE_REASON.co2]);

  blocks.push([`현재 평균 온도가 예상 안정 온도 방향으로 이동해, 새 평균 온도 ${after.currentTemperature.toFixed(1)}K에 도달했습니다.`]);
  blocks.push(describeStableLabel(label));

  return withArrows(blocks);
}

/**
 * 리포트 페이지의 "행성 변화 타임라인" 각 단계(초기 -> 아이템 -> 최종)를 before/after
 * Physics 비교로 설명한다. describeItemJudgment와 같은 원인->과정->결과 문장을
 * 쓰지만, ReportPage의 timeline에는 각 단계의 physics 스냅샷만 남아 있어 기본적으로는
 * 어떤 아이템이었는지 몰라도 physics 값 비교만으로 동작한다. itemKey를 알 때만(예:
 * "아이템" 단계처럼 어느 슬라이더였는지 확실할 때) 넘기면 describeItemJudgment와 같은
 * "왜" 설명도 붙는다 - 슬라이더 여러 개가 동시에 바뀐 단계(이상기후 대응 등)는 원인을
 * 하나로 특정할 수 없으니 호출하는 쪽에서 itemKey를 넘기지 않아야 한다.
 */
export function describeTransition(before, after, label, itemKey) {
  const blocks = physicsChangeBlocks(before, after, itemKey);

  if (blocks.length === 0) {
    // 변화가 전혀 없던 단계(예: 이미 평형이라 문제/아이템 없이 최종 확인만 반복한 경우) -
    // before와 after가 사실상 같으므로 "이전 -> 이후"를 보여줄 이유가 없다.
    return deltaEnergyLines(after.deltaEnergy);
  }

  blocks.push(deltaEnergyTransitionLines(before.deltaEnergy, after.deltaEnergy));

  // 아직 불평형(Energy Surplus/Deficit)이면 describeItemJudgment와 같은 기준으로
  // "그래서 이 선택이 왜 문제인지"(방향이 반대라 더 나빠졌는지, 방향은 맞는데
  // 아직 부족한지)를 마저 설명한다 - describeStableLabel은 이 두 라벨에서 빈
  // 배열을 돌려주므로(안정 상태 전용), 그 경우 걸러내지 않으면 withArrows가 빈
  // 블록 앞에도 "↓"를 넣어 마지막 줄이 화살표로 끝나고 아무것도 안 이어진다.
  const closingLines =
    label === "Energy Surplus" || label === "Energy Deficit"
      ? describeImbalanceChange(before, after, label)
      : label
        ? describeStableLabel(label)
        : [];
  if (closingLines.length) blocks.push(closingLines);

  return withArrows(blocks);
}

export function previewItemEffect(item) {
  switch (item.id) {
    case "ice_restorer":
      return {
        concept: [
          "📖 어떤 물리량을 바꾸나요?",
          "• 빙하 면적 증가",
          "• 알베도 증가",
          "• 태양 에너지 반사량 증가",
        ],
        chain: [
          "빙하 증가",
          "↓",
          "알베도 증가",
          "↓",
          "흡수 에너지(ASR) 감소",
          "↓",
          "에너지 불균형(ΔE) 감소",
          "↓",
          "예상 안정 온도 감소",
        ],
        science: [
          "💡 지구과학 개념",
          "빙하는 햇빛을 잘 반사하는 밝은 표면입니다.",
          "빙하가 많아질수록 태양 에너지 흡수량이 줄어 장기적으로 행성이 차가워집니다.",
        ],
      };

    case "ice_melter":
      return {
        concept: [
          "📖 어떤 물리량을 바꾸나요?",
          "• 빙하 비율 감소",
          "• 알베도 감소",
        ],
        chain: [
          "빙하 감소",
          "↓",
          "알베도 감소",
          "↓",
          "흡수 에너지(ASR) 증가",
          "↓",
          "에너지 불균형(ΔE) 증가",
          "↓",
          "예상 안정 온도 증가",
        ],
        science: [
          "💡 지구과학 개념",
          "빙하가 줄어들면 태양 에너지를 더 많이 흡수하여 행성이 따뜻해지는 방향으로 변화합니다.",
        ],
      };

    case "cloud_seeder":
      return {
        concept: [
          "📖 어떤 물리량을 바꾸나요?",
          "• 구름량 증가",
          "• 알베도 증가",
        ],
        chain: [
          "구름 증가",
          "↓",
          "알베도 증가",
          "↓",
          "흡수 에너지(ASR) 감소",
          "↓",
          "에너지 불균형(ΔE) 감소",
          "↓",
          "예상 안정 온도 감소",
        ],
        science: [
          "💡 지구과학 개념",
          "밝은 구름은 태양빛을 우주로 반사하여 지표가 흡수하는 에너지를 줄입니다.",
        ],
      };

    case "cloud_clearer":
      return {
        concept: [
          "📖 어떤 물리량을 바꾸나요?",
          "• 구름량 감소",
          "• 알베도 감소",
        ],
        chain: [
          "구름 감소",
          "↓",
          "알베도 감소",
          "↓",
          "흡수 에너지(ASR) 증가",
          "↓",
          "에너지 불균형(ΔE) 증가",
          "↓",
          "예상 안정 온도 증가",
        ],
        science: [
          "💡 지구과학 개념",
          "구름이 줄어들면 태양빛이 지표에 더 많이 도달하여 에너지 흡수가 증가합니다.",
        ],
      };

    case "carbon_capture":
      return {
        concept: [
          "📖 어떤 물리량을 바꾸나요?",
          "• CO₂ 농도 감소",
          "• 온실효과 감소",
          "• 우주 방출 에너지(OLR) 증가",
        ],
        chain: [
          "CO₂ 감소",
          "↓",
          "온실효과 감소",
          "↓",
          "방출 에너지(OLR) 증가",
          "↓",
          "에너지 불균형(ΔE) 감소",
          "↓",
          "예상 안정 온도 감소",
        ],
        science: [
          "💡 지구과학 개념",
          "이산화탄소는 대표적인 온실기체입니다.",
          "CO₂가 줄어들면 대기가 가두는 열이 감소하여 우주로 방출되는 열이 늘어납니다.",
        ],
      };

    case "greenhouse_emitter":
      return {
        concept: [
          "📖 어떤 물리량을 바꾸나요?",
          "• CO₂ 농도 증가",
          "• 온실효과 증가",
        ],
        chain: [
          "CO₂ 증가",
          "↓",
          "온실효과 증가",
          "↓",
          "방출 에너지(OLR) 감소",
          "↓",
          "에너지 불균형(ΔE) 증가",
          "↓",
          "예상 안정 온도 증가",
        ],
        science: [
          "💡 지구과학 개념",
          "온실기체가 많아질수록 지표의 열이 대기 중에 더 오래 머무르게 됩니다.",
        ],
      };

    case "space_mirror":
      return {
        concept: [
          "📖 어떤 물리량을 바꾸나요?",
          "• 반사율(알베도) 증가",
        ],
        chain: [
          "반사율 증가",
          "↓",
          "흡수 에너지(ASR) 감소",
          "↓",
          "에너지 불균형(ΔE) 감소",
          "↓",
          "예상 안정 온도 감소",
        ],
        science: [
          "💡 지구과학 개념",
          "반사율이 높을수록 태양 에너지가 우주로 되돌아가 지표가 덜 가열됩니다.",
        ],
      };

    case "density_regulator":
      return {
        concept: [
          "📖 어떤 물리량을 바꾸나요?",
          "• 대기 두께 증가",
          "• 온실효과 증가",
        ],
        chain: [
          "대기 두께 증가",
          "↓",
          "온실효과 증가",
          "↓",
          "방출 에너지(OLR) 감소",
          "↓",
          "에너지 불균형(ΔE) 증가",
          "↓",
          "예상 안정 온도 증가",
        ],
        science: [
          "💡 지구과학 개념",
          "대기가 두꺼워질수록 열을 가두는 효과가 커집니다.",
        ],
      };

    case "atm_thinner":
      return {
        concept: [
          "📖 어떤 물리량을 바꾸나요?",
          "• 대기 두께 감소",
          "• 온실효과 감소",
        ],
        chain: [
          "대기 두께 감소",
          "↓",
          "온실효과 감소",
          "↓",
          "방출 에너지(OLR) 증가",
          "↓",
          "에너지 불균형(ΔE) 감소",
          "↓",
          "예상 안정 온도 감소",
        ],
        science: [
          "💡 지구과학 개념",
          "대기가 얇아지면 지표의 열이 우주로 더 쉽게 빠져나갑니다.",
        ],
      };

    default:
      return {
        concept: [],
        chain: [],
        science: [],
      };
  }
}

// energyStateOf 기준 "에너지가 평형인" 세 상태 - 도달했다면 복사평형
// 개념이 실제로 이번 판에 나타났다는 뜻이다.
const RADIATIVE_EQUILIBRIUM_LABELS = new Set(["Cold Stable", "Earth-like Stable", "Warm Stable"]);

/**
 * 리포트의 "핵심 개념 정리"가 9개 전부를 늘 고정으로 보여주는 대신, 이번 판에서
 * 실제로 나타난 개념만 고를 수 있도록 CLIMATE_CONCEPTS 키 집합을 만든다. 항상
 * 나오는 4개(열수지 평형/ΔE/현재·예상 온도)를 기본으로 두고, 나머지는 이번
 * 타임라인/최종 상태를 보고 판단한다.
 * @param {{ initial: {physics:object}|null, final: {physics:object, ml?:{label:string}}|null,
 *   timeline: {stage:string, label:string, physics:object}[], gameOverReason: string|null }} play
 * @returns {Set<string>} CLIMATE_CONCEPTS 키 집합
 */
export function relevantConceptKeys({ initial, final, timeline, gameOverReason }) {
  const keys = new Set(["energyBalance", "deltaEnergy", "currentTemperature", "equilibriumTemperature"]);

  if (final?.ml?.label && RADIATIVE_EQUILIBRIUM_LABELS.has(final.ml.label)) {
    keys.add("radiativeEquilibrium");
  }

  if (initial && final) {
    if (Math.abs(initial.physics.albedo - final.physics.albedo) > RATIO_EPSILON) keys.add("albedo");
    if (Math.abs(initial.physics.greenhouseStrength - final.physics.greenhouseStrength) > RATIO_EPSILON) {
      keys.add("greenhouseEffect");
    }
  }

  const climateEntries = timeline.filter((e) => e.stage === "이상기후");
  if (climateEntries.length > 0) keys.add("climateFeedback");

  // 양의 피드백: 방치했거나(경고에 대응 못함) 목숨을 다 잃을 정도로 상황이
  // 악화된 적이 있다는 뜻.
  if (gameOverReason === "life_over" || climateEntries.some((e) => e.label.startsWith("⚠️"))) {
    keys.add("positiveFeedback");
  }

  // 음의 피드백: 이상기후를 성공적으로 막았거나, 아이템/최종 조정으로 직전
  // 단계보다 |ΔE|가 실제로 줄어든 적이 있다는 뜻(대응이 변화를 완화한 사례).
  const dampedAnywhere = timeline.some((entry, i) => {
    if (i === 0) return false;
    const prev = timeline[i - 1];
    return Math.abs(entry.physics.deltaEnergy) < Math.abs(prev.physics.deltaEnergy) - ENERGY_EPSILON;
  });
  if (climateEntries.some((e) => e.label.startsWith("✅")) || dampedAnywhere) {
    keys.add("negativeFeedback");
  }

  return keys;
}