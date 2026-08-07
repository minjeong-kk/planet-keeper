import { useState } from "react";
import ItemInfoModal from "./ItemInfoModal";
import { shortSliderChangeLabel } from "../../utils/planetAnalysis.js";

// 정답 후 아이템 선택 단계. 매번 useGameStore.pickVisibleItems가 무작위로 고른
// 일부만 받는다(9개 전부가 아님) - 어떤 아이템이 보일지는 GamePage/store 쪽 책임.
// 고른 아이템이 실제로 에너지 평형에 도움이 되는지는 여기서 판정하지 않는다 -
// 재계산된 물리엔진/ML 결과로 자연스럽게 드러난다. 카드에는 긴 설명 대신 짧은
// 효과 라벨만 두고, 원인->결과 설명은 (❓) 버튼 또는 이모지 클릭 시 뜨는 모달에서 보여준다.
// disabled: 이상기후 경고에 응답하는 중(pendingClimateEvent)에는 true - 카드
// 선택과 슬라이더 대응이 동시에 가능하면 어느 쪽에 반응해야 할지 헷갈리므로,
// 경고가 해소될 때까지 이 단계 전체를 잠근다.
function ItemStage({ items, onSelect, disabled = false }) {
  const [infoItem, setInfoItem] = useState(null);

  return (
    <div className="game-page__modal">
      <h3>아이템 선택</h3>
      <ul className={`item-card-grid ${disabled ? "is-locked" : ""}`}>
        {items.map((item) => (
          <li key={item.id} className="item-card">
            <button
              type="button"
              className="item-card__info-btn"
              aria-label={`${item.name} 설명 보기`}
              onClick={() => setInfoItem(item)}
            >
              ❓
            </button>

            {/* 이모지를 눌러도 ❓ 버튼과 동일하게 설명 모달이 열린다 */}
            <span
              className="item-card__emoji"
              role="button"
              tabIndex={0}
              >
              {item.emoji}
            </span>

            <p className="item-card__name">{item.name}</p>
            <p className="item-card__effect">{shortSliderChangeLabel(item.key, item.delta)}</p>
            <button className="btn-primary item-card__use-btn" onClick={() => onSelect(item)} disabled={disabled}>
              사용
            </button>
          </li>
        ))}
      </ul>

      {infoItem && <ItemInfoModal item={infoItem} onClose={() => setInfoItem(null)} />}
    </div>
  );
}

export default ItemStage;