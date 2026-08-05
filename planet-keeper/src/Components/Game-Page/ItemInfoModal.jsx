import { previewItemEffect } from "../../utils/planetAnalysis.js";

// 아이템 카드의 (ⓘ) 버튼/카드 클릭 시 뜨는 원인->과정->결과 설명 모달.
// 실제 물리엔진 재계산 없이 슬라이더 방향만으로 만든 미리보기다(previewItemEffect).
function ItemInfoModal({ item, onClose }) {
  const info = previewItemEffect(item);

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