import { ALBEDO_REASON, GREENHOUSE_REASON } from "./planetAnalysis.js";

// describeItemJudgment/describeTransition(둘 다 planetAnalysis.js)이 만드는 인과
// 설명 줄을 "알베도->ASR 계열"과 "온실효과->OLR 계열"로 나눠 색으로 구분한다 -
// 하나의 조작(예: 구름)이 두 계열을 동시에 움직일 때, 어느 결과가 어느 원인
// 때문인지 한눈에 보이게 하려는 것이다. "왜"를 설명하는 이유 문장(ALBEDO_REASON/
// GREENHOUSE_REASON, 예: "구름은 태양빛을 반사하는 밝은 표면 역할을 합니다")은
// 그 자체로는 "알베도"/"ASR" 같은 키워드가 없어서 문자열 매칭만으로는 못 잡으므로,
// planetAnalysis.js가 실제로 쓰는 문구 그대로를 먼저 정확히 대조하고, 그 외의
// 물리량 변화 문장은 키워드로 분류한다.
const ALBEDO_REASON_LINES = new Set(Object.values(ALBEDO_REASON));
const GREENHOUSE_REASON_LINES = new Set(Object.values(GREENHOUSE_REASON));
// "흡수하는 에너지"는 ASR 변화 줄뿐 아니라 deltaEnergyLines의 중립 ΔE 방향 문장
// ("방출하는 에너지가 흡수하는 에너지보다...")에도 그대로 나오는 표현이라 여기
// 넣으면 안 된다 - "ASR" 자체가 그 줄에만 있는 유일한 표식이라 그것만으로 충분하다.
const CAUSE_FAMILY_KEYWORDS = {
  albedo: ["알베도", "ASR"],
  greenhouse: ["온실효과", "OLR", "방출되는 에너지", "우주로 방출"],
};
export function causeFamilyOf(line) {
  if (ALBEDO_REASON_LINES.has(line)) return "albedo";
  if (GREENHOUSE_REASON_LINES.has(line)) return "greenhouse";
  if (CAUSE_FAMILY_KEYWORDS.albedo.some((k) => line.includes(k))) return "albedo";
  if (CAUSE_FAMILY_KEYWORDS.greenhouse.some((k) => line.includes(k))) return "greenhouse";
  return null;
}

// 설명 문장 안의 핵심 용어를 굵게 강조한다 - 문장이 길어서 어떤 값이 바뀐 건지
// 한눈에 안 들어올 때가 있다.
const HIGHLIGHT_TERMS = [
  "에너지 불균형", "알베도", "온실효과", "ΔE", "OLR", "ASR",
  "흡수하는 에너지", "방출하는 에너지", "방출되는 에너지", "평형",
];
const HIGHLIGHT_RE = new RegExp(`(${HIGHLIGHT_TERMS.join("|")})`, "g");

// 한 줄을 강조 처리된 조각 배열로 쪼갠다 - 호출부가 원하는 태그(<p>/<li>)로
// 직접 감싸 쓴다(ReportPage는 <p>, ItemResultModal은 <li>가 필요해서 공용
// 컴포넌트 하나로 태그까지 고정하지 않는다).
export function renderHighlightedParts(line) {
  return line
    .split(HIGHLIGHT_RE)
    .map((part, j) => (HIGHLIGHT_TERMS.includes(part) ? <strong key={j}>{part}</strong> : part));
}
