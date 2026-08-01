import { MOCK_ITEMS } from "../../data/mockItems.js";

// 아이템 효과(슬라이더/physics 값 변경)는 다음 작업에서 구현한다.
// 지금은 아이템을 고르면 바로 STABLE 단계로 넘어간다.
function ItemStage({ onSelect }) {
  return (
    <div className="game-page__modal">
      <h3>아이템 선택</h3>
      <ul>
        {MOCK_ITEMS.map((item) => (
          <li key={item.id}>
            <button className="btn-primary" onClick={() => onSelect(item)}>
              {item.name}
            </button>
            <span> — {item.description}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

export default ItemStage;
