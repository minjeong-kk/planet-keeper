import useGameStore, { itemDeltaEnergyChange, ITEM_EFFECT_EPSILON } from "../../store/useGameStore.js";
import useClimateStore from "../../store/useClimateStore.js";
import { previewItemEffect, formatSigned } from "../../utils/planetAnalysis.js";

// 아이템 카드의 (ⓘ) 버튼/카드 클릭 시 뜨는 원인->과정->결과 설명 모달.
// info.concept/chain/science는 실제 물리엔진 재계산 없이 슬라이더 방향만으로 만든
// 고정 미리보기(previewItemEffect)라 아이템마다 항상 같은 문구다. 그 아래
// "지금 사용하면" 문단만은 지금 행성의 실제 조성/온도로 itemDeltaEnergyChange를
// 돌려서 이 판(play-through)에 한정된 실측 예측치를 보여준다.
function ItemInfoModal({ item, onClose }) {
  const info = previewItemEffect(item);
  const values = useClimateStore((state) => state.values);
  const currentTemperature = useClimateStore((state) => state.currentTemperature);
  const physicsResult = useGameStore((state) => state.physicsResult);

  const before = physicsResult?.deltaEnergy;
  const change = physicsResult ? itemDeltaEnergyChange(item, values, currentTemperature) : null;
  const after = before != null && change != null ? before + change : null;
  // "효과 없음" 기준은 게임 로직(pickVisibleItems/useItem)이 쓰는 것과 같아야 한다.
  // 여기만 다른 값을 쓰면 모달은 "변한다"고 했는데 엔진은 "효과 없음"으로 판정한다.
  const trend =
    change == null || Math.abs(change) < ITEM_EFFECT_EPSILON
      ? "거의 변하지 않을"
      : change < 0
        ? "줄어들"
        : "늘어날";

  return (
    <div className="item-info-modal-overlay" onClick={onClose}>
      <div className="item-info-modal" onClick={(e) => e.stopPropagation()}>

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
          <h3>📈 변화 과정</h3>

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
    </div>
  );
}

export default ItemInfoModal;