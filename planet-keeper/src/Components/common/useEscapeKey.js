import { useEffect, useRef } from "react";

// 오버레이(모달)를 ESC로 닫는 공통 훅.
//
// 예전에는 ConceptBook/InfoSection/Tutorial만 각자 keydown 리스너를 달아 ESC를
// 지원했고, 게임 화면의 모달 네 개(ItemInfoModal/ItemResultModal/StageClearModal/
// 리포트 문제 해설)는 오버레이 클릭으로만 닫혔다 - 같은 게임 안에서 어떤 모달은
// ESC가 먹고 어떤 모달은 안 먹는 게 더 헷갈린다. 리스너 등록/해제를 네 번 복붙하는
// 대신 여기 하나로 모은다.
//
// onEscape에 null/undefined를 넘기면 아무 일도 하지 않는다 - 모달이 조건부로만
// 열리는 화면(리포트의 해설 모달 등)에서 훅 호출 자체는 항상 하면서(훅 순서 규칙)
// 닫기 동작만 껐다 켤 수 있게 하려는 것이다.
export default function useEscapeKey(onEscape) {
  // 호출부가 인라인 화살표 함수를 넘겨도 리스너를 매 렌더 다시 달지 않도록
  // 최신 핸들러만 ref로 갈아끼운다(리스너 자체는 마운트 때 한 번만 건다).
  const handlerRef = useRef(onEscape);
  useEffect(() => {
    handlerRef.current = onEscape;
  });

  useEffect(() => {
    const onKeyDown = (event) => {
      if (event.key !== "Escape") return;
      handlerRef.current?.();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);
}
