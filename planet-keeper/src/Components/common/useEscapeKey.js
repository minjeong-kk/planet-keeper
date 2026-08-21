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
//
// 열려 있는 소비자를 마운트/활성화 순서로 스택에 쌓고, ESC는 항상 맨 위(가장 최근에
// 열린) 것만 받는다 - Tutorial이 떠 있는 동안 그 위에 아이템 모달이 겹쳐 열리면
// (튜토리얼 스포트라이트가 클릭을 막지 않아 실제로 가능하다) 예전에는 독립된
// 리스너 두 개가 같은 ESC에 동시에 반응해서, 모달만 닫으려던 것이 튜토리얼까지
// 통째로 스킵시켰다.
const stack = [];

function handleKeyDown(event) {
  if (event.key !== "Escape" || stack.length === 0) return;
  stack[stack.length - 1]();
}

if (typeof window !== "undefined") {
  window.addEventListener("keydown", handleKeyDown);
}

export default function useEscapeKey(onEscape) {
  // 호출부가 인라인 화살표 함수를 넘겨도 스택 엔트리를 매 렌더 다시 쌓지 않도록
  // 최신 핸들러만 ref로 갈아끼운다(스택 등록/해제는 onEscape가 있고/없고가 바뀔
  // 때만 한다).
  const handlerRef = useRef(onEscape);
  useEffect(() => {
    handlerRef.current = onEscape;
  });

  const isActive = onEscape != null;
  useEffect(() => {
    if (!isActive) return;
    const entry = () => handlerRef.current?.();
    stack.push(entry);
    return () => {
      const i = stack.lastIndexOf(entry);
      if (i !== -1) stack.splice(i, 1);
    };
  }, [isActive]);
}
