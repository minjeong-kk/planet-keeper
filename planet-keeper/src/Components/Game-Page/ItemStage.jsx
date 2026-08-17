import { useState } from "react";
import ItemInfoModal from "./ItemInfoModal";
import { shortSliderChangeLabel } from "../../utils/planetAnalysis.js";

// 왼쪽 HUD 아래쪽의 "장비 격납고". 정답 후 아이템 선택 단계에서 useGameStore.
// pickVisibleItems가 무작위로 고른 일부만 받는다(9개 전부가 아님) - 어떤 아이템이
// 보일지는 GamePage/store 쪽 책임. 고른 아이템이 실제로 에너지 평형에 도움이 되는지는
// 여기서 판정하지 않는다 - 재계산된 물리엔진 결과로 자연스럽게 드러난다.
//
// 카드를 누르면 곧바로 투입된다(onSelect -> GamePage가 useGameStore.useItem 호출).
// 긴 설명은 카드에 상시 노출하지 않고 (?) 버튼 모달에만 둔다.
//
// disabled: 이상기후 경고에 응답하는 중(pendingClimateEvent)에는 true.
// locked: 지금은 장비를 쓸 수 있는 단계가 아님(문제 풀이 중) - 잠긴 슬롯만 보여준다.
const LOCKED_SLOT_COUNT = 4;

function ItemStage({ items, onSelect, disabled = false, locked = false }) {
  const [infoItem, setInfoItem] = useState(null);

  return (
    <section className={`panel panel--inventory${disabled ? " is-locked" : ""}`}>
      <header className="panel__head">
        <h2 className="panel__title">장비 격납고</h2>
        <span className="panel__count">{locked ? "잠김" : `${items.length}개 보유`}</span>
      </header>

      {locked ? (
        <>
          <ul className="inventory-grid">
            {Array.from({ length: LOCKED_SLOT_COUNT }, (_, i) => (
              <li key={i} className="inventory-card inventory-card--empty" aria-hidden="true">
                <span className="inventory-card__emoji">🔒</span>
              </li>
            ))}
          </ul>
          <p className="panel__placeholder">임무에 성공하면 장비가 지급됩니다.</p>
        </>
      ) : (
        <ul className="inventory-grid">
          {items.map((item) => (
            <li key={item.id}>
              <button
                type="button"
                className="inventory-card"
                onClick={() => onSelect(item)}
                disabled={disabled}
                title={item.description}
              >
                <span className="inventory-card__emoji">{item.emoji}</span>
                <span className="inventory-card__name">{item.name}</span>
                <span className="inventory-card__effect">{shortSliderChangeLabel(item.key, item.delta)}</span>
                <span className="inventory-card__use">투입</span>
              </button>
              <button
                type="button"
                className="inventory-card__info"
                aria-label={`${item.name} 설명 보기`}
                onClick={() => setInfoItem(item)}
              >
                ?
              </button>
            </li>
          ))}
        </ul>
      )}

      {infoItem && <ItemInfoModal item={infoItem} onClose={() => setInfoItem(null)} />}
    </section>
  );
}

export default ItemStage;
