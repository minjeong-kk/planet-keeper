// Physics 결과를 "원인 → 문제 → 해결 방향 → 추천 아이템"으로 해석하는 모듈.
// ML(predictClimateState)은 지금 상태(label)만 판정하고, 그 상태를 왜 그렇게
// 됐는지 설명하는 건 여기서 physicsResult 실제 값을 기준값과 비교해서 만든다 -
// 라벨별로 문장을 하드코딩하지 않고, CO2/알베도/대기두께가 실제로 기준보다
// 높은지 낮은지에 따라 매번 다시 생성된다.

import { CO2_BASELINE_PPM, BASELINE_ALBEDO, BASELINE_ATM_THICKNESS, energyStateOf } from "./physicsEngine.js";

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

function energyProblemLines(deltaEnergy, direction) {
  const sign = deltaEnergy >= 0 ? "+" : "";
  return [
    `Delta Energy : ${sign}${deltaEnergy.toFixed(1)} W/m²`,
    direction === "warming"
      ? "흡수 에너지가 방출 에너지보다 많습니다."
      : "방출 에너지가 흡수 에너지보다 많습니다.",
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
            "실제로 안정적인지는 최종 확인(Final) 단계에서 AI가 판정합니다.",
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
            `Delta Energy는 거의 0(${physicsResult.deltaEnergy.toFixed(2)} W/m²)이며`,
            "평균 온도도 기준 범위 내에 있습니다.",
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

const CHANGE_EPSILON = 0.005;

function changeLine(before, after, riseText, fallText) {
  if (after > before + CHANGE_EPSILON) return riseText;
  if (after < before - CHANGE_EPSILON) return fallText;
  return null;
}

// AI가 판정한 평형 상태(Cold/Earth-like/Warm Stable)별 결과 문구 -
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
  const worsened = Math.abs(after.deltaEnergy) > Math.abs(before.deltaEnergy) + CHANGE_EPSILON;
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
      ? "🔥 방향은 맞지만 아직 에너지가 과다합니다 - 냉각 아이템이 더 필요합니다."
      : "❄️ 방향은 맞지만 아직 에너지가 부족합니다 - 온난화 아이템이 더 필요합니다.",
  ];
}

/**
 * 아이템 적용 전/후 Physics 결과를 비교해서 무엇이 바뀌었는지, 그리고 그 결과
 * (지금 온도를 그대로 둔 채) 에너지가 실제로 균형을 이뤘는지를 순서대로 설명하는
 * 문장 배열을 만든다(before->after 인과 사슬). 아이템은 조성만 바꿀 뿐 온도를
 * 강제로 평형에 맞추지 않으므로 - 맞는 아이템을 골라야만 ΔE≈0이 되고, 틀린
 * 아이템은 오히려 Energy Surplus/Deficit을 키운다(useGameStore.useItem 참고).
 */
export function describeItemJudgment(item, before, after, label) {
  const lines = [];

  lines.push(`${item.emoji} "${item.name}"을 사용했습니다.`);
  lines.push(SLIDER_CHANGE_LINES[item.key]?.(item.delta) ?? "행성 조성이 변화했습니다.");

  const albedoLine = changeLine(before.albedo, after.albedo, "알베도가 증가했습니다.", "알베도가 감소했습니다.");
  if (albedoLine) lines.push(albedoLine);

  const greenhouseLine = changeLine(
    before.greenhouseStrength,
    after.greenhouseStrength,
    "온실효과가 더 강해졌습니다.",
    "온실효과가 약해졌습니다.",
  );
  if (greenhouseLine) lines.push(greenhouseLine);

  const absorbedLine = changeLine(
    before.absorbedRadiation,
    after.absorbedRadiation,
    "흡수 복사량이 증가했습니다.",
    "흡수 복사량이 감소했습니다.",
  );
  if (absorbedLine) lines.push(absorbedLine);

  const sign = after.deltaEnergy >= 0 ? "+" : "";
  lines.push(`Delta Energy: ${sign}${after.deltaEnergy.toFixed(1)} W/m²`);
  lines.push("AI가 최종 기후 상태를 분석합니다.");

  if (label === "Energy Surplus" || label === "Energy Deficit") {
    lines.push(...describeImbalanceChange(before, after, label));
  } else {
    lines.push(...describeStableLabel(label));
  }

  return lines;
}

/**
 * finalizeGame이 2단계 정답마다 CO2를 조정한 뒤 다시 보여줄 notice를 만든다.
 * describeItemJudgment와 같은 before/after 인과 사슬이지만, 아이템이 아니라
 * CO2 슬라이더 자체를 조정하므로 그 변화 방향만 먼저 보여준다.
 */
export function describeFinalizeJudgment(before, after, label, { co2Increased } = {}) {
  const lines = [];

  if (co2Increased != null) {
    lines.push(SLIDER_CHANGE_LINES.co2(co2Increased ? 1 : -1));
  }

  const greenhouseLine = changeLine(
    before.greenhouseStrength,
    after.greenhouseStrength,
    "온실효과가 더 강해졌습니다.",
    "온실효과가 약해졌습니다.",
  );
  if (greenhouseLine) lines.push(greenhouseLine);

  lines.push(`새로운 평형 온도: ${after.currentTemperature.toFixed(1)}K`);
  lines.push(...describeStableLabel(label));

  return lines;
}
