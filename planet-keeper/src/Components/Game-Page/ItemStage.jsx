// 정답 후 아이템 선택 단계. 매번 useGameStore.pickVisibleItems가 무작위로 고른
// 일부만 받는다(9개 전부가 아님) - 어떤 아이템이 보일지는 GamePage/store 쪽 책임.
// 고른 아이템이 실제로 에너지 평형에 도움이 되는지는 여기서 판정하지 않는다 -
// 재계산된 물리엔진/ML 결과로 자연스럽게 드러난다.
function ItemStage({ items, onSelect }) {
  return (
    <div className="game-page__modal">
      <h3>아이템 선택</h3>
      <ul>
        {items.map((item) => (
          <li key={item.id}>
            <button className="btn-primary" onClick={() => onSelect(item)}>
              {item.emoji} {item.name}
            </button>
            <span> — {item.description}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

export default ItemStage;
