import { useState } from "react";
import ItemInfoModal from "./ItemInfoModal";
import { MOCK_ITEMS } from "../../data/mockItems.js";
import { MAX_EQUIPMENT_CAPACITY, equipmentTotalCount } from "../../store/useGameStore.js";
import { itemEffectKeyword } from "../../utils/planetAnalysis.js";

// 왼쪽 패널의 "기후 제어 장비" - 보유 중인 장비 인벤토리다.
// equipment는 store가 들고 있는 { [itemId]: 수량 } 객체이고, 여기서는 그것을
// MOCK_ITEMS 정의와 맞춰 슬롯으로 그린다(장비 정의 자체를 복제하지 않는다).
//
// 카드를 누르면 곧바로 사용된다(onUse -> useGameStore.applyEquipment). 실수로
// 누르는 걸 줄이려고 hover 시 "사용" 뱃지가 또렷해지고 카드가 살짝 올라온다.
// 상세 설명은 ? 버튼 모달(ItemInfoModal)에만 둔다.
//
// disabled: 이상기후 대응 중이거나 장비 보급(보상 선택) 중 - 그때는 인벤토리를 잠근다.
function EquipmentPanel({ equipment, onUse, disabled = false, lockReason = null }) {
  const [infoItem, setInfoItem] = useState(null);

  // 보유 중인 장비를 MOCK_ITEMS 순서대로 정렬해서 슬롯 위치가 튀지 않게 한다.
  const owned = MOCK_ITEMS.filter((item) => (equipment[item.id] ?? 0) > 0).map((item) => ({
    item,
    count: equipment[item.id],
  }));
  // 상한은 "중복 포함 총 개수"라, 빈 슬롯 수도 종류 수가 아니라 남은 개수로 그린다 -
  // 빈 슬롯이 보이면 항상 그만큼 더 받을 수 있다는 뜻이 된다.
  const total = equipmentTotalCount(equipment);
  const emptySlots = Math.max(0, MAX_EQUIPMENT_CAPACITY - total);

  return (
    <section
      className={`panel panel--equipment${disabled ? " is-locked" : ""}`}
      data-tour="inventory"
    >
      <header className="panel__head">
        <h2 className="panel__title">기후 제어 장비</h2>
        <span className="panel__count">
          보유 {total} / {MAX_EQUIPMENT_CAPACITY}
        </span>
      </header>

      <ul className="equipment-grid">
        {owned.map(({ item, count }) => (
          <li key={item.id}>
            <button
              type="button"
              className="equipment-card"
              onClick={() => onUse(item)}
              disabled={disabled}
              title={`${item.name} - ${item.description}`}
            >
              <span className="equipment-card__emoji">{item.emoji}</span>
              <span className="equipment-card__name">{item.name}</span>
              <span className="equipment-card__effect">{itemEffectKeyword(item)}</span>
              <span className="equipment-card__count">×{count}</span>
              <span className="equipment-card__use">사용</span>
            </button>
            <button
              type="button"
              className="equipment-card__info"
              aria-label={`${item.name} 설명 보기`}
              onClick={() => setInfoItem(item)}
            >
              ?
            </button>
          </li>
        ))}

        {Array.from({ length: emptySlots }, (_, i) => (
          <li key={`empty-${i}`}>
            <div className="equipment-card equipment-card--empty" aria-hidden="true">
              <span className="equipment-card__emoji">+</span>
              <span className="equipment-card__name">빈 슬롯</span>
            </div>
          </li>
        ))}
      </ul>

      <p className="panel__placeholder">
        {owned.length === 0
          ? "문제를 맞히면 장비를 확보할 수 있습니다."
          : (lockReason ??
            (emptySlots === 0
              ? "보유 한도가 가득 찼습니다. 사용하면 다시 받을 수 있습니다."
              : "카드를 누르면 바로 사용됩니다."))}
      </p>

      {infoItem && <ItemInfoModal item={infoItem} onClose={() => setInfoItem(null)} />}
    </section>
  );
}

export default EquipmentPanel;
