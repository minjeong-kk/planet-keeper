// 교과 개념 용어에 마우스를 올리면(네이티브 title 툴팁) 짧은 설명이 뜨는 표시.
// 커스텀 팝오버 없이 브라우저 기본 title 툴팁만 쓴다 - 이 정도 용도엔 충분하고,
// 새 의존성이나 위치 계산 로직이 필요 없다.
function Term({ concept, children }) {
  return (
    <span className="concept-term" title={concept?.detail}>
      {children ?? concept?.term}
    </span>
  );
}

export default Term;
