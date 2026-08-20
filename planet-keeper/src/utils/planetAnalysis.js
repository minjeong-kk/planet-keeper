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
  computeClimateV2,
  mapSlidersToClimateInputs,
} from "./physicsEngine.js";
import { nextValuesForChange } from "../store/useClimateStore.js";

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
// 쓴다 - ΔE 숫자 줄을 "이전 -> 이후"로 바꿔서 이 조작 하나가 ΔE를 얼마나 움직였는지
// 바로 보이게 한다. 방향 설명 문장은 항상 지금(after) 상태 기준이어야 하므로
// deltaEnergyLines(after)가 만든 것을 그대로 쓴다.
//
// itemDeltaEnergy(온도 고정, 조성 변화만 반영한 ΔE)를 알면 숫자를 두 줄로 나눈다 -
// "이 조작이 실제로 한 일"과 "그 뒤 행성이 스스로 한 걸음 식거나 데워진 몫"은
// 서로 다른 사건이기 때문이다. 판정(describeImbalanceChange)은 앞쪽만 보고 하는데
// 숫자 줄만 온도까지 반영된 값을 보여주면, 같은 모달 안에서
//   "ΔE: -114.3 → -111.6" (줄어든 것처럼 보임)
//   "오히려 에너지가 더 부족해졌습니다 - 방향이 반대인 아이템을 골랐습니다."
// 처럼 숫자와 문장이 서로 반대로 말하게 된다. 나눠서 보여주면 "아이템은 악화시켰고
// (-121.4) 행성이 식으면서 일부 상쇄했다(-111.6)"로 읽혀 둘이 같은 이야기를 한다.
// (온도 이동은 이 게임이 가르치려는 되먹임 그 자체라 감추는 것보다 드러내는 편이 낫다.)
function deltaEnergyTransitionLines(before, after, itemDeltaEnergy, beforeTemperature, afterTemperature) {
  const [, directionLine] = deltaEnergyLines(after);

  // itemDeltaEnergy를 모르면(예전 저장본의 리포트 등) 예전처럼 한 줄로 둔다.
  // 온도 이동이 사실상 없을 때도 굳이 쪼개지 않는다 - 읽을 게 늘기만 한다.
  const effect = itemDeltaEnergy ?? after;
  const stepMoved = Math.abs(after - effect) > ENERGY_EPSILON;
  if (!stepMoved) {
    return [`에너지 불균형(ΔE): ${formatSigned(before)} → ${formatSigned(effect)} W/m²`, directionLine];
  }

  const tempPart =
    beforeTemperature != null && afterTemperature != null
      ? `행성 온도가 ${beforeTemperature.toFixed(1)}K → ${afterTemperature.toFixed(1)}K로 한 걸음 움직여`
      : "행성 온도가 한 걸음 움직여";

  return [
    `에너지 불균형(ΔE): ${formatSigned(before)} → ${formatSigned(effect)} W/m² (이 조작의 효과)`,
    `${tempPart} ΔE는 ${formatSigned(after)} W/m²가 되었습니다.`,
    directionLine,
  ];
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

// 아이템 적용 후 다음 슬라이더 값(0~100 범위로 clamp). 빙하/바다 상호제약과 실측
// 알베도 폐기 둘 다 useClimateStore.setValue와 똑같이 nextValuesForChange를 쓴다 -
// useGameStore의 applyEquipment/pickVisibleItems, 아래 itemEffectKeyword가 전부
// 이 하나만 쓴다(여기서 빠뜨리면 "예상 ΔE"와 "실제 저장된 값"이 서로 달라지는
// 문제가 생긴다).
export function nextSliderValues(values, item) {
  const nextValue = Math.min(100, Math.max(0, values[item.key] + item.delta));
  return nextValuesForChange(values, item.key, nextValue);
}

// 이 아이템을 지금 조성/온도에 적용하면 ΔE가 실제로 얼마나 움직이는지(적용 전후
// 차이). 정적 태그가 아니라 매번 물리엔진으로 직접 계산한다 - clamp에 걸려 효과가
// 0인 아이템도, 구름처럼 표면 상태에 따라 방향 자체가 뒤집히는 아이템도 정적
// 태그만 보면 틀리게 나오기 때문이다.
export function itemDeltaEnergyChange(item, values, currentTemperature) {
  const before = computeClimateV2({ ...mapSlidersToClimateInputs(values), currentTemperature }).deltaEnergy;
  const after = computeClimateV2({ ...mapSlidersToClimateInputs(nextSliderValues(values, item)), currentTemperature }).deltaEnergy;
  return after - before;
}

// 장비 카드에 붙이는 아주 짧은 효과 키워드 - "무엇을 바꾸는지 · 데워지는지/식는지"
// 두 조각만 보여준다(예: "구름 증가 · 냉각"). 방향은 매번 itemDeltaEnergyChange로
// 지금 조성/온도 기준으로 다시 계산한다 - 예전에는 previewItemEffect의 고정된
// 설명 문구 마지막 줄만 읽었는데, 구름 계열 아이템(cloud_seeder/cloud_clearer/
// space_mirror)은 표면이 구름(알베도 0.5)보다 밝은지 어두운지에 따라 실제 방향이
// 뒤집힐 수 있어서(예: 빙하가 아주 많은 행성에서는 "구름 증가"가 오히려 알베도를
// 낮춰 가열 방향이 된다) 고정 문구가 실제 결과와 반대로 보이는 경우가 있었다.
export function itemEffectKeyword(item, values, currentTemperature) {
  const change = shortSliderChangeLabel(item.key, item.delta);
  if (values == null || currentTemperature == null) return change;
  const delta = itemDeltaEnergyChange(item, values, currentTemperature);
  const direction = Math.abs(delta) < ENERGY_EPSILON ? null : delta > 0 ? "가열" : "냉각";
  return direction ? `${change} · ${direction}` : change;
}
export function shortSliderChangeLabel(key, delta) {
  const label = SLIDER_KEY_LABELS[key] ?? "행성 조성";
  return `${label} ${delta > 0 ? "증가" : "감소"}`;
}

// mockItems.js의 구름 계열 아이템(cloud_seeder/cloud_clearer/space_mirror) 설명은
// "구름을 늘리면 알베도가 오른다"는 통상적인 경우만 가정한 고정 문구였다 -
// itemEffectKeyword와 같은 이유로, 표면이 구름(알베도 0.5)보다 밝은 행성(빙하가
// 아주 많은 경우 등)에서는 실제로 반대가 된다. 카드 title 툴팁에 그대로 노출되는
// 문구라 여기도 매번 지금 조성/온도로 다시 계산한다. 구름 이외의 아이템은 항상
// 같은 방향(단조 증가/감소)이라 기존 고정 문구 그대로 둔다.
export function itemDescriptionFor(item, values, currentTemperature) {
  if (item.key !== "cloud" || values == null || currentTemperature == null) return item.description;

  const before = computeClimateV2({ ...mapSlidersToClimateInputs(values), currentTemperature });
  const after = computeClimateV2({
    ...mapSlidersToClimateInputs(nextSliderValues(values, item)),
    currentTemperature,
  });
  const albedoUp = after.albedo > before.albedo + RATIO_EPSILON;
  const albedoDown = after.albedo < before.albedo - RATIO_EPSILON;
  const reflect = albedoUp ? "높이고" : albedoDown ? "낮추고" : "거의 그대로 두고";
  const absorb = albedoUp ? "줄입니다" : albedoDown ? "늘립니다" : "거의 바꾸지 않습니다";
  const mechanism =
    {
      cloud_seeder: "대기 상층부에 구름을 형성해",
      cloud_clearer: "대기 상층부의 구름을 흩어",
      space_mirror: "행성 외곽의 궤도 반사경을 조절해",
    }[item.id] ?? "구름 양을 조절해";

  return `${mechanism} 지금 이 행성에서는 태양광 반사율(알베도)을 ${reflect} 흡수량을 ${absorb}.`;
}

// 이상기후 경보(useGameStore.js CLIMATE_EVENTS)의 구름 이벤트 hint도 같은 이유로
// 고정 문구였다("옅어지면 흡수 에너지가 늘어난다") - 방금 고친 counterDirection
// 화살표와 모순되게 보일 수 있어서 여기도 지금 조성/온도로 다시 계산한다. co2/
// 빙하 이벤트는 단조 반응이라 원래 hint 그대로 둔다.
export function climateEventHintFor(event, values, currentTemperature) {
  if (event.key !== "cloud" || values == null || currentTemperature == null) return event.hint;

  const before = computeClimateV2({ ...mapSlidersToClimateInputs(values), currentTemperature });
  const after = computeClimateV2({
    ...mapSlidersToClimateInputs(nextSliderValues(values, { key: "cloud", delta: event.delta })),
    currentTemperature,
  });
  const absorbUp = after.absorbedRadiation > before.absorbedRadiation + ENERGY_EPSILON;
  const verb = event.delta > 0 ? "짙어지면" : "옅어지면";
  return `구름도 햇빛을 반사하는 밝은 표면입니다. 지금 이 행성에서는 구름이 ${verb} 지표가 받는 태양에너지가 ${absorbUp ? "늘어납니다" : "줄어듭니다"}.`;
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
//
// asrDelta/olrDelta를 physics 객체가 아니라 이미 계산된 숫자로 받는다 - OLR은
// 온실효과(조성)뿐 아니라 온도(T⁴)에도 좌우되는데, 호출부(physicsChangeBlocks)가
// "OLR 델타"를 온도 스텝 이전(조성 변화만 반영한) 기준으로 계산해서 넘길 수도,
// 그런 기준이 없을 때는 after 그대로 넘길 수도 있어야 하기 때문이다 - 이 함수
// 안에서 physics 객체를 직접 참조하면 그 선택권이 사라진다.
function netAlbedoGreenhouseEffectLine(asrDelta, olrDelta) {
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
//
// immediateOutgoingRadiation: 온도를 옮기기 "전"(조성 변화만 반영한) OLR -
// describeImbalanceChange의 방향 판정과 같은 이유로 필요하다. after.outgoingRadiation은
// 온도 스텝까지 반영된 값이라, 온실효과가 실제로는 진 경우에도(알베도 쪽이 더 크게
// 이겨서 온도가 내려간 경우) 그 온도 하락이 OLR을 깎아서 "온실효과가 이겨서
// 데워지는 방향"처럼 판정과 반대로 서술되는 문제가 있었다. 없으면(itemKey 없는
// 다중 슬라이더 전환 등) after.outgoingRadiation로 대체한다.
function physicsChangeBlocks(before, after, itemKey, immediateOutgoingRadiation) {
  const blocks = [];
  const olrAfter = immediateOutgoingRadiation ?? after.outgoingRadiation;

  const albedoLine = changeLine(before.albedo, after.albedo, "알베도가 증가했습니다.", "알베도가 감소했습니다.", RATIO_EPSILON);
  const greenhouseLine = greenhouseChangeLine(before, after);

  // 구름은 albedoOf/greenhouseStrengthOf 둘 다에 들어가는 유일한 변수라 알베도와
  // 온실효과가 "같이" 바뀔 수 있다 - 이건 구름이라는 같은 원인의 서로 독립된 두
  // 결과일 뿐, 알베도가 바뀌어서 온실효과가 바뀌는 인과관계가 아니다. 그래서 둘 다
  // 있으면 화살표로 잇지 않고 같은 블록에 나란히 묶어(withArrows가 블록 "안"에는
  // 화살표를 안 넣는다) 인과관계처럼 안 읽히면서도 둘 다 보여준다.
  // itemKey가 있으면(어느 슬라이더인지 확실할 때) ALBEDO_REASON/GREENHOUSE_REASON에
  // 그 슬라이더가 등록돼 있다는 것 자체가 "이 아이템은 원래 이 계열에 영향을 줘야
  // 한다"는 뜻이다. 그런데도 albedoLine/greenhouseLine이 안 잡히면(예: 구름이 이미
  // greenhouseStrength 상한(GREENHOUSE_MAX)에 걸려 있어 그 채널만 더는 안 움직이는
  // 경우), 아무 말 없이 건너뛰지 않고 "이번엔 이 채널에 감지될 만한 변화가 없었다"고
  // 밝힌다 - 같은 아이템을 여러 번 써도 설명 줄 개수가 매번 달라져 이상해 보이는
  // 문제(예: 구름 생성기가 첫 번째는 알베도+온실효과 둘 다, 두 번째는 알베도만
  // 설명하는데 이유가 안 보임)를 해결한다.
  const causeLines = [];
  if (albedoLine) {
    causeLines.push(albedoLine);
    if (itemKey && ALBEDO_REASON[itemKey]) causeLines.push(ALBEDO_REASON[itemKey]);
  } else if (itemKey && ALBEDO_REASON[itemKey]) {
    causeLines.push("이번에는 알베도 쪽에 감지될 만한 변화가 없었습니다.");
  }
  if (greenhouseLine) {
    causeLines.push(greenhouseLine);
    if (itemKey && GREENHOUSE_REASON[itemKey]) causeLines.push(GREENHOUSE_REASON[itemKey]);
  } else if (itemKey && GREENHOUSE_REASON[itemKey]) {
    causeLines.push("이번에는 온실효과 쪽에 감지될 만한 변화가 없었습니다.");
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
        olrAfter,
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
  // CO2 등)은 애초에 서로 견줄 두 효과가 없다. ASR은 온도 무관이라 after 그대로,
  // OLR은 위에서 이미 온도 스텝을 뺀 olrAfter를 쓴다(안 그러면 "누가 이겼는지"가
  // 온도 스텝 크기에 휘둘린다).
  if (albedoLine && greenhouseLine) {
    const asrDelta = after.absorbedRadiation - before.absorbedRadiation;
    const olrDelta = olrAfter - before.outgoingRadiation;
    blocks.push([netAlbedoGreenhouseEffectLine(asrDelta, olrDelta)]);
  }

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
//
// afterDeltaEnergy는 반드시 "온도를 고정한 채 조성 변화만 반영한" ΔE여야 한다
// (예: computeItemStepResult의 immediateDeltaEnergy). 온도까지 반영된 physics.deltaEnergy를
// 쓰면, MAX_TEMPERATURE_STEP_K(3K)짜리 배경 온도 스텝이 아이템 자체 효과보다 커서
// 반대 방향 아이템도 "방향이 맞았다"고 잘못 판정하는 문제가 있었다.
function describeImbalanceChange(before, afterDeltaEnergy, label) {
  const worsened = Math.abs(afterDeltaEnergy) > Math.abs(before.deltaEnergy) + ENERGY_EPSILON;
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
 *
 * immediateDeltaEnergy: computeItemStepResult가 온도를 옮기기 "전"에 계산해 둔,
 * 이 아이템의 조성 변화만 반영한 ΔE(온도 고정) - describeImbalanceChange의 방향
 * 판정에 쓴다. 없으면(예: 예전에 저장된 리포트 데이터) after.deltaEnergy로
 * 대체하되, 그 경우 배경 온도 스텝이 섞여 판정이 부정확할 수 있다.
 *
 * immediateOutgoingRadiation: 같은 시점의 OLR(온도 고정) - physicsChangeBlocks의
 * "알베도 vs 온실효과 누가 이겼는지" 서술에 쓴다(같은 온도 스텝 혼입 문제).
 */
export function describeItemJudgment(item, before, after, label, immediateDeltaEnergy, immediateOutgoingRadiation) {
  const intro = [`${item.emoji} "${item.name}"을 사용했습니다.`];

  // 원인 -> 과정 -> 결과 순서의 블록들. 각 블록은 그 자체로는 화살표 없이 붙어
  // 나오고, 블록과 블록 사이에만 withArrows가 "↓"를 넣는다 - 그래야 "ΔE 값 +
  // 방향 설명"처럼 한 덩어리로 읽혀야 하는 줄들이 화살표로 쪼개지지 않는다.
  const blocks = [
    [SLIDER_CHANGE_LINES[item.key]?.(item.delta) ?? "행성 조성이 변화했습니다."],
    ...physicsChangeBlocks(before, after, item.key, immediateOutgoingRadiation),
  ];

  blocks.push(
    deltaEnergyTransitionLines(
      before.deltaEnergy,
      after.deltaEnergy,
      immediateDeltaEnergy,
      before.currentTemperature,
      after.currentTemperature,
    ),
  );
  blocks.push(["물리엔진이 최종 기후 상태를 분석합니다."]);
  blocks.push(
    label === "Energy Surplus" || label === "Energy Deficit"
      ? describeImbalanceChange(before, immediateDeltaEnergy ?? after.deltaEnergy, label)
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
 * 어떤 아이템이었는지 몰라도 physics 값 비교만으로 동작한다. itemKey/itemDelta를 알 때만
 * (예: "아이템" 단계처럼 어느 슬라이더가 얼마나 움직였는지 확실할 때) describeItemJudgment의
 * 인트로 줄(SLIDER_CHANGE_LINES)과 "왜" 설명(ALBEDO/GREENHOUSE_REASON)이 둘 다 붙는다 -
 * 슬라이더 여러 개가 동시에 바뀐 단계(이상기후 대응 등)는 원인을 하나로 특정할 수
 * 없으니 호출하는 쪽에서 itemKey/itemDelta를 넘기지 않아야 한다.
 * immediateDeltaEnergy/immediateOutgoingRadiation은 describeItemJudgment와 같은
 * 이유로 방향 판정(closingLines)과 "누가 이겼는지" 서술에만 쓴다 - 없으면 각각
 * after.deltaEnergy/after.outgoingRadiation으로 대체하되 배경 온도 스텝이 섞여
 * 부정확할 수 있다.
 */
export function describeTransition(before, after, label, itemKey, itemDelta, immediateDeltaEnergy, immediateOutgoingRadiation) {
  // "온실효과가 약해졌다" 같은 파생 결과만 보여주고 정작 어느 슬라이더를 움직인
  // 아이템이었는지는 말하지 않는다는 피드백 - describeItemJudgment(게임 내 아이템
  // 판정)가 이미 쓰는 SLIDER_CHANGE_LINES를 그대로 재사용해 인과 사슬 맨 앞에 붙인다.
  const sliderChangeLine = itemKey != null && itemDelta != null ? SLIDER_CHANGE_LINES[itemKey]?.(itemDelta) : null;
  const changeBlocks = physicsChangeBlocks(before, after, itemKey, immediateOutgoingRadiation);
  const blocks = sliderChangeLine ? [[sliderChangeLine], ...changeBlocks] : changeBlocks;

  if (blocks.length === 0) {
    // 변화가 전혀 없던 단계(예: 이미 평형이라 문제/아이템 없이 최종 확인만 반복한 경우) -
    // before와 after가 사실상 같으므로 "이전 -> 이후"를 보여줄 이유가 없다.
    return deltaEnergyLines(after.deltaEnergy);
  }

  blocks.push(
    deltaEnergyTransitionLines(
      before.deltaEnergy,
      after.deltaEnergy,
      immediateDeltaEnergy,
      before.currentTemperature,
      after.currentTemperature,
    ),
  );

  // 아직 불평형(Energy Surplus/Deficit)이면 describeItemJudgment와 같은 기준으로
  // "그래서 이 선택이 왜 문제인지"(방향이 반대라 더 나빠졌는지, 방향은 맞는데
  // 아직 부족한지)를 마저 설명한다 - describeStableLabel은 이 두 라벨에서 빈
  // 배열을 돌려주므로(안정 상태 전용), 그 경우 걸러내지 않으면 withArrows가 빈
  // 블록 앞에도 "↓"를 넣어 마지막 줄이 화살표로 끝나고 아무것도 안 이어진다.
  const closingLines =
    label === "Energy Surplus" || label === "Energy Deficit"
      ? describeImbalanceChange(before, immediateDeltaEnergy ?? after.deltaEnergy, label)
      : label
        ? describeStableLabel(label)
        : [];
  if (closingLines.length) blocks.push(closingLines);

  return withArrows(blocks);
}

// 구름 계열 아이템(cloud_seeder/cloud_clearer/space_mirror)의 미리보기는 고정된
// switch 케이스 대신 지금 조성/온도로 실제 before/after 물리값을 계산해서, 이미
// describeItemJudgment/describeTransition이 쓰는 physicsChangeBlocks(알베도·
// 온실효과 두 계열을 함께 보고 어느 쪽이 이겼는지까지 판정하는 로직)를 그대로
// 재사용한다 - 구름은 알베도와 온실효과 둘 다 움직이는 유일한 변수라, 방향
// 단어만 새로 만들면 이 둘의 "누가 이겼는지" 판정이 실제 사용 후 결과(ItemResultModal)
// 와 어긋날 수 있다. 같은 함수를 쓰면 미리보기와 실제 결과가 항상 일치한다.
function dynamicCloudPreview(item, values, currentTemperature) {
  const before = computeClimateV2({ ...mapSlidersToClimateInputs(values), currentTemperature });
  const after = computeClimateV2({
    ...mapSlidersToClimateInputs(nextSliderValues(values, item)),
    currentTemperature,
  });
  // 예전엔 physicsChangeBlocks(실제 결과 설명이 쓰는, 이유 문장까지 붙는 긴 버전)를
  // 그대로 재사용해서 - 구름만 다른 아이템(짧은 명사구 5줄)보다 미리보기 사슬이
  // 훨씬 길어 보였다. 구름은 유일하게 데이터에 따라 방향이 갈리는 아이템(표면이
  // 이미 구름보다 밝으면 반대로 작용)이라 알베도만 동적으로 판정하고, 나머지는
  // 다른 아이템과 같은 명사구 스타일로 맞춘다. 온실효과 기여(cloudGreenhouseTerm)는
  // 표면 상태와 무관하게 항상 구름 비율과 같은 방향이라(단조 증가) 동적 판정 없이
  // item.delta 부호만으로 정해도 틀릴 일이 없다.
  const cloudWord = item.delta > 0 ? "증가" : "감소";
  const albedoUp = after.albedo > before.albedo + RATIO_EPSILON;
  const albedoDown = after.albedo < before.albedo - RATIO_EPSILON;
  const albedoWord = albedoUp ? "증가" : albedoDown ? "감소" : "거의 변화 없음";
  const deltaEUp = after.deltaEnergy > before.deltaEnergy + ENERGY_EPSILON;
  const deltaEDown = after.deltaEnergy < before.deltaEnergy - ENERGY_EPSILON;
  const deltaEWord = deltaEUp ? "증가" : deltaEDown ? "감소" : "거의 변화 없음";

  return {
    concept: [
      "📖 어떤 물리량을 바꾸나요?",
      `• 구름 ${cloudWord}`,
      "• 실제 알베도 변화 방향은 지금 행성의 표면 상태에 따라 달라집니다(아래 변화 과정 참고)",
    ],
    chain: [
      `구름 ${cloudWord}`,
      "↓",
      `알베도 ${albedoWord}`,
      `온실효과 ${cloudWord}`,
      "↓",
      `에너지 불균형(ΔE) ${deltaEWord}`,
      "↓",
      `예상 안정 온도 ${deltaEWord}`,
    ],
    science: [
      "💡 지구과학 개념",
      "구름은 태양빛을 반사하는 밝은 표면(알베도 약 0.5)이자, 지표 복사를 가두는 온실 역할도 동시에 합니다.",
      "표면이 구름보다 밝은 행성(빙하가 아주 많은 경우 등)에서는 구름이 늘수록 오히려 알베도가 낮아져 더워지는 쪽으로 작용할 수 있습니다.",
    ],
  };
}

export function previewItemEffect(item, values, currentTemperature) {
  if (item.key === "cloud" && values != null && currentTemperature != null) {
    return dynamicCloudPreview(item, values, currentTemperature);
  }
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

