import { createPortal } from "react-dom";
import { formatSigned, ALBEDO_REASON, GREENHOUSE_REASON } from "../../utils/planetAnalysis.js";
import useEscapeKey from "../common/useEscapeKey.js";
import { causeFamilyOf, renderHighlightedParts } from "../../utils/explanationHighlight.jsx";

// 장비를 쓴 직후 뜨는 "사용 결과" 모달.
//
// 이 게임의 학습 목표가 에너지 평형의 원리라서, 조성 변화가 알베도/온실효과 →
// ASR/OLR → ΔE → 평형 상태로 이어지는 인과 사슬을 그때그때 보여주는 게 핵심이다.
//
// lines는 useGameStore가 만든 notice.lines(describeItemJudgment 결과)를 그대로
// 받는다 - 문구를 여기서 새로 만들지 않으므로 리포트/로그와 항상 같은 설명이다.
// 물리 계산·판정도 손대지 않는다. 이 파일이 하는 일은 그 줄들을 읽는 순서가 보이게
// 배치하는 것뿐이다.
//
// 예전에는 lines를 <ol> 하나에 평평하게 쏟아서, "무엇이 변했는지 → 그래서 무엇이
// 변했는지 → 결과가 어떻게 됐는지"가 전부 같은 크기의 문장으로 이어졌다. 지금은
// 네 단계로 나눠 그린다:
//   ① 변화        아이템이 직접 움직인 슬라이더
//   ② 왜?         알베도/온실효과/OLR/ASR 로 이어지는 과정(+ 그 순간의 실제 수치)
//   ③ 결과        ΔE·온도를 큰 값으로, 판정 문장은 그 아래 작게
//   ④ 현재 상태 / 다음 목표
//
// 단계 구분은 describeItemJudgment가 이미 만들어 둔 블록 경계를 쓴다 - withArrows가
// 블록과 블록 사이에만 "↓"를 넣으므로, "↓"로 자르면 생성기가 의도한 묶음이 그대로
// 나온다. 어느 블록이 어느 단계인지는 생성기가 항상 내보내는 두 문구(ΔE 숫자 줄,
// "물리엔진이 최종 기후 상태를 분석합니다.")로 찾는다.
const DELTA_LINE_PREFIX = "에너지 불균형(ΔE):";
const ANALYZE_LINE = "물리엔진이 최종 기후 상태를 분석합니다.";

// ALBEDO_REASON/GREENHOUSE_REASON 의 값들 = "왜 그런지"를 덧붙이는 부연 설명 줄.
// 상수를 그대로 가져와 비교하므로 문구가 바뀌어도 여기서 다시 맞출 일이 없다.
const REASON_LINES = new Set([...Object.values(ALBEDO_REASON), ...Object.values(GREENHOUSE_REASON)]);

// ② 왜? 단계의 각 줄이 말하는 물리량을 before/after 의 실제 숫자와 이어 준다.
// 문장이 스스로 이름을 밝힌 물리량만 붙이므로, 숫자와 문장이 어긋날 수 없다.
//
// 알베도·온실효과·ASR은 조성만의 함수라 after 를 그대로 쓴다. OLR만 온도(T⁴)에도
// 좌우되므로 immediateOutgoingRadiation(온도를 옮기기 전)을 써야 한다 - 옆에 붙는
// 문장이 그 값으로 판정되기 때문이다. after.outgoingRadiation 을 쓰면 배경 온도
// 스텝(최대 3K = OLR 약 4%)이 조성발 변화(구름 아이템은 약 2%)보다 커질 때
// "OLR이 감소했습니다" 옆에 "↑" 가 붙는다(OLR 줄이 나오는 경우의 11.3%).
const OLR_MATCH = "우주로 방출되는 에너지";
const VALUE_BY_SUBJECT = [
  { match: "알베도", pick: (p) => p.albedo, digits: 3, unit: "" },
  { match: "온실효과", pick: (p) => p.greenhouseStrength, digits: 3, unit: "" },
  { match: OLR_MATCH, pick: (p) => p.outgoingRadiation, digits: 1, unit: " W/m²" },
  { match: "흡수하는 에너지(ASR)", pick: (p) => p.absorbedRadiation, digits: 1, unit: " W/m²" },
];

function valueChipFor(line, before, after, immediateOutgoingRadiation) {
  const spec = VALUE_BY_SUBJECT.find((v) => line.startsWith(v.match));
  if (!spec) return null;
  const b = spec.pick(before);
  const a =
    spec.match === OLR_MATCH && immediateOutgoingRadiation != null
      ? immediateOutgoingRadiation
      : spec.pick(after);
  if (b == null || a == null) return null;
  const shown = { b: Number(b.toFixed(spec.digits)), a: Number(a.toFixed(spec.digits)) };
  // 화살표는 화면에 찍힌 두 값만 비교해서 붙인다 - 반올림 뒤에도 같은 값이면
  // 화살표를 달지 않아야 "0.541 → 0.541 ↓" 처럼 보이지 않는다.
  const arrow = shown.a > shown.b ? " ↑" : shown.a < shown.b ? " ↓" : "";
  return `${shown.b.toFixed(spec.digits)} → ${shown.a.toFixed(spec.digits)}${spec.unit}${arrow}`;
}

// "대기 두께가 감소했습니다." → { label: "대기 두께", arrow: "↓" }
// 조성이 안 바뀐 경우(한계값)는 화살표 없이 문장을 그대로 보여준다.
function parseSliderChange(line) {
  const m = line?.match(/^(.+?)(?:이|가) (증가|감소)했습니다\.$/);
  if (!m) return null;
  return { label: m[1], arrow: m[2] === "증가" ? "↑" : "↓" };
}

// "❄️ 다만 온도가 … 안정되었습니다 - 2단계에서 CO2를 높여가며 다시 맞춰봅니다."
// → 앞은 지금 상태, 뒤는 다음에 할 일. 생성기(describeStableLabel /
//   describeImbalanceChange)가 항상 이 모양으로 내보낸다.
function parseFinalLine(line) {
  const emojiMatch = line.match(/^(\p{Extended_Pictographic}️?)\s*/u);
  const emoji = emojiMatch?.[1] ?? null;
  const body = emojiMatch ? line.slice(emojiMatch[0].length) : line;
  const i = body.indexOf(" - ");
  if (i === -1) return { emoji, state: body, next: null };
  return { emoji, state: body.slice(0, i), next: body.slice(i + 3) };
}

/** lines(첫 줄 = 인트로 제외)를 "↓" 기준으로 블록 배열로 자른다. */
function toBlocks(lines) {
  const blocks = [];
  let current = [];
  for (const line of lines) {
    if (line === "↓") {
      if (current.length) blocks.push(current);
      current = [];
    } else {
      current.push(line);
    }
  }
  if (current.length) blocks.push(current);
  return blocks;
}

// 마지막 판정 줄의 문구로 ΔE가 좋아졌는지 나빠졌는지 배지를 만든다.
// describeStableLabel/describeImbalanceChange가 내보내는 세 갈래를 그대로 읽는다.
function verdictBadgeOf(finalLine, ok) {
  if (ok) return { text: "평형 도달", tone: "good" };
  if (!finalLine) return null;
  if (finalLine.includes("넘어갔습니다")) return { text: "평형 지나침", tone: "over" };
  if (finalLine.includes("더 심해졌습니다")) return { text: "ΔE 악화", tone: "bad" };
  if (finalLine.includes("줄었지만")) return { text: "ΔE 개선", tone: "good" };
  return null;
}

function ItemResultModal({
  item,
  before,
  after,
  lines,
  ok,
  // 온도를 옮기기 "전"(조성 변화만 반영한) ΔE/OLR. 판정 문구와 배지가 이 값으로
  // 만들어지므로 숫자도 같은 값을 써야 한다. 없으면(옛 호출부) after로 대체한다.
  immediateDeltaEnergy,
  immediateOutgoingRadiation,
  onClose,
}) {
  useEscapeKey(onClose);
  const temperatureChanged = Math.abs(after.currentTemperature - before.currentTemperature) >= 0.05;
  // "이 조작의 효과"로 보여줄 ΔE. 예전에는 after.deltaEnergy(온도 스텝 포함)를
  // 큰 숫자로 썼는데, 배지("ΔE 악화")와 바로 아래 본문("-232.9 → -247.1 (이 조작의
  // 효과)")이 immediate 기준이라 큰 숫자만 개선처럼 보이는 경우가 있었다
  // (아이템 사용의 5.6%). 큰 숫자도 판정과 같은 값을 쓰고, 온도 스텝 몫은 아래
  // 본문 줄(deltaEnergyTransitionLines)이 이미 따로 밝힌다.
  const effectDeltaEnergy = immediateDeltaEnergy ?? after.deltaEnergy;

  const blocks = toBlocks(lines.slice(1));
  const deltaIdx = blocks.findIndex((b) => b[0]?.startsWith(DELTA_LINE_PREFIX));
  const analyzeIdx = blocks.findIndex((b) => b.length === 1 && b[0] === ANALYZE_LINE);

  // 예상한 표식을 못 찾으면(생성기 문구가 바뀐 경우) 예전처럼 한 줄씩 이어서 보여준다 -
  // 화면이 비는 것보다 낫고, 정보는 하나도 빠지지 않는다.
  const parsed = deltaIdx > 0 && analyzeIdx > deltaIdx;

  const changeBlock = parsed ? blocks[0] : null;
  const whyBlocks = parsed ? blocks.slice(1, deltaIdx) : [];
  const resultLines = parsed ? blocks[deltaIdx] : [];
  const finalLines = parsed ? blocks.slice(analyzeIdx + 1).flat() : [];

  const sliderChange = parseSliderChange(changeBlock?.[0]);
  const badge = verdictBadgeOf(finalLines[0], ok);

  return createPortal(
    <div className="item-result-overlay" onClick={onClose}>
      <div
        className={`item-result${ok ? " item-result--ok" : ""}`}
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-label="장비 사용 결과"
      >
        <header className="item-result__head">
          <span className="item-result__emoji">{item.emoji}</span>
          <div>
            <p className="item-result__title">{item.name} 사용</p>
            <p className="item-result__sub">행성에 일어난 변화</p>
          </div>
          {badge && <span className={`item-result__badge item-result__badge--${badge.tone}`}>{badge.text}</span>}
        </header>

        {!parsed ? (
          <ol className="item-result__chain">
            {lines.slice(1).map((line, i) =>
              line === "↓" ? (
                <li key={i} className="item-result__arrow" aria-hidden="true">
                  ↓
                </li>
              ) : (
                <li key={i} className={`item-result__step${causeFamilyOf(line) ? ` item-result__step--${causeFamilyOf(line)}` : ""}`}>
                  {renderHighlightedParts(line)}
                </li>
              ),
            )}
          </ol>
        ) : (
          <>
            {/* ① 변화 - 아이템이 직접 움직인 것 */}
            <section className="item-result__stage">
              <h4 className="item-result__stage-title">변화</h4>
              {sliderChange ? (
                <p className="item-result__slider">
                  <span className="item-result__slider-label">{sliderChange.label}</span>
                  <span className="item-result__slider-arrow">{sliderChange.arrow}</span>
                </p>
              ) : (
                <p className="item-result__stage-text">{changeBlock[0]}</p>
              )}
              {changeBlock.slice(1).map((line) => (
                <p key={line} className="item-result__reason">
                  {line}
                </p>
              ))}
            </section>

            {whyBlocks.length > 0 && (
              <>
                <div className="item-result__arrow" aria-hidden="true">
                  ↓
                </div>
                {/* ② 왜? - 알베도/온실효과 → OLR/ASR 로 이어지는 과정 */}
                <section className="item-result__stage">
                  <h4 className="item-result__stage-title">왜?</h4>
                  {whyBlocks.flat().map((line) => {
                    if (REASON_LINES.has(line)) {
                      return (
                        <p key={line} className="item-result__reason">
                          {line}
                        </p>
                      );
                    }
                    const family = causeFamilyOf(line);
                    const chip = valueChipFor(line, before, after, immediateOutgoingRadiation);
                    return (
                      <p key={line} className={`item-result__why${family ? ` item-result__why--${family}` : ""}`}>
                        <span className="item-result__why-text">{renderHighlightedParts(line)}</span>
                        {chip && <span className="item-result__why-value">{chip}</span>}
                      </p>
                    );
                  })}
                </section>
              </>
            )}

            <div className="item-result__arrow" aria-hidden="true">
              ↓
            </div>

            {/* ③ 결과 - 숫자를 먼저 크게, 판정 문장은 그 아래 작게 */}
            <section className="item-result__stage">
              <h4 className="item-result__stage-title">결과</h4>
              <div className="item-result__numbers">
                <div className="item-result__number">
                  <span>
                    에너지 불균형{" "}
                    <small className="item-result__number-note">흡수 − 방출 · 이 조작의 효과</small>
                  </span>
                  <strong>
                    {formatSigned(before.deltaEnergy)}
                    <em>→</em>
                    {formatSigned(effectDeltaEnergy)} W/m²
                  </strong>
                </div>
                <div className="item-result__number">
                  <span>
                    현재 온도 <small className="item-result__number-note">예상 안정 온도와 다름</small>
                  </span>
                  <strong>
                    {before.currentTemperature.toFixed(1)}
                    <em>→</em>
                    {after.currentTemperature.toFixed(1)} K
                  </strong>
                </div>
              </div>
              {resultLines.map((line) => (
                <p key={line} className="item-result__result-note">
                  {renderHighlightedParts(line)}
                </p>
              ))}
              {!temperatureChanged && (
                <p className="item-result__hint">
                  조성이 바뀌어도 온도는 한 걸음씩만 움직입니다 - 지금은 에너지 불균형이 먼저 변했습니다.
                </p>
              )}
            </section>

            {/* ④ 현재 상태 / 다음 목표 - 물리엔진의 최종 판정 */}
            {finalLines.length > 0 && (
              <div className="item-result__verdict">
                {finalLines.map((line) => {
                  const { emoji, state, next } = parseFinalLine(line);
                  return (
                    <div key={line} className="item-result__verdict-row">
                      <div className="item-result__verdict-card">
                        <span className="item-result__verdict-label">현재 상태</span>
                        <p>
                          {emoji && <span aria-hidden="true">{emoji} </span>}
                          {state}
                        </p>
                      </div>
                      {next && (
                        <div className="item-result__verdict-card item-result__verdict-card--next">
                          <span className="item-result__verdict-label">
                            {ok ? "🎉 판정" : "🎯 다음 목표"}
                          </span>
                          <p>{next}</p>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </>
        )}

        <button type="button" className="item-result__close" onClick={onClose}>
          확인
        </button>
      </div>
    </div>,
    document.body,
  );
}

export default ItemResultModal;
