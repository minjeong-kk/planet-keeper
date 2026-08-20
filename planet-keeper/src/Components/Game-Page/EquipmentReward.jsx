import { useState } from "react";
import ItemInfoModal from "./ItemInfoModal";
import useClimateStore from "../../store/useClimateStore";
import { itemEffectKeyword, itemDescriptionFor } from "../../utils/planetAnalysis.js";

// 1단계 문제를 맞힌 뒤 오른쪽 패널에 뜨는 "장비 보급". 여기서 고른 장비는 바로
// 사용되지 않고 인벤토리(기후 제어 장비)에 들어간다 - 사용 시점은 플레이어가
// 나중에 직접 고른다. 후보 4개는 useGameStore.pickVisibleItems가 뽑아 둔 것으로,
// 지금 ΔE 방향에 실제로 도움이 되는 장비가 최소 하나 포함되도록 보장돼 있다.
//
// 카드에는 아이콘 + 이름 + 짧은 효과 키워드만 둔다(예: "구름 증가 · 냉각") -
// 어떤 장비를 확보할지 지금 행성 상태를 보고 판단할 수 있을 만큼만 보여주고,
// 자세한 원리는 ? 버튼 모달에 남긴다.
function EquipmentReward({ items, onClaim, disabled = false }) {
  const [infoItem, setInfoItem] = useState(null);
  const values = useClimateStore((state) => state.values);
  const currentTemperature = useClimateStore((state) => state.currentTemperature);

  return (
    <div className={`mission mission--reward${disabled ? " is-locked" : ""}`}>
      <div className="mission__head">
        <span className="mission__eyebrow">🎁 장비 보급</span>
      </div>

      <p className="mission__notice-text">
        사용할 장비가 아니라, <strong>이번에 확보할 장비</strong>를 선택하세요.
      </p>

      <ul className="reward-list">
        {items.map((item) => (
          <li key={item.id}>
            <button
              type="button"
              className="reward-card"
              onClick={() => onClaim(item)}
              disabled={disabled}
              title={itemDescriptionFor(item, values, currentTemperature)}
            >
              <span className="reward-card__emoji">{item.emoji}</span>
              <span className="reward-card__text">
                <span className="reward-card__name">{item.name}</span>
                <span className="reward-card__effect">{itemEffectKeyword(item, values, currentTemperature)}</span>
              </span>
              <span className="reward-card__claim">확보</span>
            </button>
            <button
              type="button"
              className="reward-card__info"
              aria-label={`${item.name} 설명 보기`}
              onClick={() => setInfoItem(item)}
            >
              ?
            </button>
          </li>
        ))}
      </ul>

      {infoItem && <ItemInfoModal item={infoItem} onClose={() => setInfoItem(null)} />}
    </div>
  );
}

export default EquipmentReward;
