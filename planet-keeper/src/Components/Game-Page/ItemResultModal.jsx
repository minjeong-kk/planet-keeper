import { createPortal } from "react-dom";
import { formatSigned } from "../../utils/planetAnalysis.js";
import { causeFamilyOf, renderHighlightedParts } from "../../utils/explanationHighlight.jsx";

// 장비를 쓴 직후 뜨는 "사용 결과" 모달.
//
// 이 게임의 학습 목표가 에너지 평형의 원리라서, 조성 변화가 알베도/온실효과 →
// ASR/OLR → ΔE → 평형 상태로 이어지는 인과 사슬을 그때그때 보여주는 게 핵심이다.
// 예전에는 이 설명이 하단 "최근 활동" 로그에 한 줄씩 들어가서 잘 읽히지 않았다 -
// 사용 직후에는 모달로 또렷하게 보여주고, 기록은 그대로 로그에도 남긴다.
//
// lines는 useGameStore가 만든 notice.lines(describeItemJudgment 결과)를 그대로
// 받는다 - 문구를 여기서 새로 만들지 않으므로 리포트/로그와 항상 같은 설명이다.
// "↓"만 화살표로 따로 그린다.
//
// 모달이 열려 있는 동안 GamePage는 타이머를 멈춘다(설명을 읽는 사이 이상기후가
// 끼어들지 않게).
function ItemResultModal({ item, before, after, lines, ok, onClose }) {
  const temperatureChanged = Math.abs(after.currentTemperature - before.currentTemperature) >= 0.05;

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
        </header>

        {/* 숫자 요약 - 무엇이 얼마나 움직였는지 */}
        <div className="item-result__numbers">
          <div className="item-result__number">
            <span>현재 온도</span>
            <strong>
              {before.currentTemperature.toFixed(1)}
              <em>→</em>
              {after.currentTemperature.toFixed(1)} K
            </strong>
          </div>
          <div className="item-result__number">
            <span>에너지 불균형</span>
            <strong>
              {formatSigned(before.deltaEnergy)}
              <em>→</em>
              {formatSigned(after.deltaEnergy)} W/m²
            </strong>
          </div>
        </div>

        {!temperatureChanged && (
          <p className="item-result__hint">
            조성이 바뀌어도 온도는 한 걸음씩만 움직입니다 - 지금은 에너지 불균형이 먼저 변했습니다.
          </p>
        )}

        {/* 인과 사슬 - 조성 변화가 왜 그 결과로 이어지는지 */}
        <ol className="item-result__chain">
          {lines.slice(1).map((line, i) => {
            if (line === "↓") {
              return (
                <li key={i} className="item-result__arrow" aria-hidden="true">
                  ↓
                </li>
              );
            }
            // 리포트 페이지 타임라인과 같은 색 구분(알베도/온실효과 계열)·핵심 용어
            // 강조를 여기서도 재사용한다(explanationHighlight.jsx) - 같은 설명 문구를
            // 두 화면이 서로 다르게 보여주면 안 되므로 로직을 공유한다.
            const family = causeFamilyOf(line);
            return (
              <li key={i} className={`item-result__step${family ? ` item-result__step--${family}` : ""}`}>
                {renderHighlightedParts(line)}
              </li>
            );
          })}
        </ol>

        <button type="button" className="item-result__close" onClick={onClose}>
          확인
        </button>
      </div>
    </div>,
    document.body,
  );
}

export default ItemResultModal;
