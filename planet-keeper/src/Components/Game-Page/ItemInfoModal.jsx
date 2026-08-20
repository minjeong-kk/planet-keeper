import { createPortal } from "react-dom";
import useGameStore, { itemDeltaEnergyChange, ITEM_EFFECT_EPSILON } from "../../store/useGameStore.js";
import useClimateStore from "../../store/useClimateStore.js";
import useEscapeKey from "../common/useEscapeKey.js";
import { previewItemEffect, formatSigned } from "../../utils/planetAnalysis.js";

// 아이템 카드의 (ⓘ) 버튼/카드 클릭 시 뜨는 원인->과정->결과 설명 모달.
// info.concept/chain/science(previewItemEffect)는 빙하/CO2/대기두께 아이템은
// 슬라이더 방향만으로 만든 고정 미리보기다(그 물리량들은 조성과 무관하게 항상
// 같은 방향으로 반응하므로 고정이어도 틀릴 일이 없다). 구름 계열 아이템만은
// previewItemEffect가 지금 조성/온도로 매번 다시 계산한다 - 표면이 구름(알베도
// 0.5)보다 밝은 행성에서는 실제 방향이 반대가 될 수 있어서다. 아래 "지금 사용하면"
// 문단은 어느 아이템이든 itemDeltaEnergyChange로 실측 예측치를 보여준다.
function ItemInfoModal({ item, onClose }) {
  useEscapeKey(onClose);
  const values = useClimateStore((state) => state.values);
  const currentTemperature = useClimateStore((state) => state.currentTemperature);
  const physicsResult = useGameStore((state) => state.physicsResult);
  const info = previewItemEffect(item, values, currentTemperature);

  const before = physicsResult?.deltaEnergy;
  const change = physicsResult ? itemDeltaEnergyChange(item, values, currentTemperature) : null;
  const after = before != null && change != null ? before + change : null;
  // "효과 없음" 기준은 게임 로직(pickVisibleItems/applyEquipment)이 쓰는 것과 같아야 한다.
  // 여기만 다른 값을 쓰면 모달은 "변한다"고 했는데 엔진은 "효과 없음"으로 판정한다.
  const trend =
    change == null || Math.abs(change) < ITEM_EFFECT_EPSILON
      ? "거의 변하지 않을"
      : change < 0
        ? "줄어들"
        : "늘어날";

  // 장비 카드를 감싼 .panel/.mission에는 backdrop-filter가 걸려 있는데, 그러면 그
  // 요소가 position: fixed 자손의 기준(컨테이닝 블록)이 된다 - 모달이 화면 전체가
  // 아니라 그 카드 안에 갇혀서 행성 진단 패널과 겹치고, 오버레이·확인 버튼이 밀려나
  // 닫을 수 없었다. body로 포탈해서 화면 기준으로 뜨게 한다.
  return createPortal(
    <div className="item-info-modal-overlay" onClick={onClose}>
      <div
        className="item-info-modal"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-label={`${item.name} 상세 설명`}
      >

        <h2>
          {item.emoji} {item.name}
        </h2>


        <div className="item-info-section">
          <h3>📖 무엇을 변화시키나요?</h3>

          {info.concept
            .slice(1)
            .map((line, i) => (
              <p key={i}>{line}</p>
            ))}
        </div>


        <div className="item-info-section">
          <h3>📈 일반적인 변화 과정</h3>
          <p className="item-info-caveat">극단적인 기후 조성에서는 달라질 수 있습니다.</p>

          <div className="item-chain">
            {info.chain.map((line, i) => (
              line === "↓" ? (
                <span key={i} className="item-arrow">
                  ↓
                </span>
              ) : (
                <span key={i} className="item-step">
                  {line}
                </span>
              )
            ))}
          </div>
        </div>


        <div className="item-info-section">
          <h3>📊 지금 사용하면</h3>

          {before != null ? (
            <p>
              지금 상태에서는 ΔE가 {formatSigned(before)} → {formatSigned(after)}로 {trend} 것으로 예상됩니다.
            </p>
          ) : (
            <p>아직 계산된 행성 상태가 없어 예측할 수 없습니다.</p>
          )}
        </div>


        <div className="item-info-section">
          <h3>{info.science[0]}</h3>

          {info.science.slice(1).map((line,i)=>(
            <p key={i}>{line}</p>
          ))}
        </div>


        <button 
          className="btn-primary"
          onClick={onClose}
        >
          확인
        </button>

      </div>
    </div>,
    document.body,
  );
}

export default ItemInfoModal;