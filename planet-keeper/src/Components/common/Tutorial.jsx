import { useEffect, useLayoutEffect, useRef, useState } from "react";
import "./Tutorial.css";

// 페이지 온보딩(공용). 설명만 읽는 튜토리얼이 아니라 실제 화면의 UI를 하나씩
// 스포트라이트로 짚어주면서 "이건 뭐고, 이제 이걸 해보자"로 진행한다.
//
// 단계 목록은 steps prop으로 주입한다(common/tourSteps.js의 GAME_TOUR_STEPS /
// CREATE_TOUR_STEPS) - 화면마다 자기 단계를 넘긴다.
//
// 각 단계는 페이지가 달아 둔 data-tour 속성으로 대상 영역을 찾는다 - 튜토리얼이
// 그 페이지의 컴포넌트 구조를 알 필요가 없고, 페이지 쪽도 속성 하나만 붙이면 된다.
// target이 null인 단계는 화면 한가운데 큰 카드로 띄운다(인사말/마무리) - 옆에
// 강조할 UI가 없어 카드 혼자 떠 있으므로, 붙어 있는 단계보다 넓고 글씨도 크다.
//
// 진행 중에는 GamePage가 타이머(tickSecond)를 멈추므로 이상기후가 끼어들지 않는다.

// 스포트라이트/말풍선이 화면 밖으로 나가지 않게 두는 여백(px).
const PADDING = 10;
const CARD_WIDTH = 400; // 강조 대상 옆에 붙는 카드(Tutorial.css의 .tour__card와 같은 값)
const CARD_GAP = 18;
const MARGIN = 12;

function measure(target) {
  if (!target) return null;
  const el = document.querySelector(`[data-tour="${target}"]`);
  if (!el) return null;
  const r = el.getBoundingClientRect();
  if (r.width === 0 && r.height === 0) return null;
  return { top: r.top, left: r.left, width: r.width, height: r.height };
}

// 강조 영역 옆(공간이 없으면 위/아래)에 말풍선을 놓는다. 강조 대상이 없는
// 단계는 화면 한가운데에 큰 카드로 띄운다. cardHeight는 실제로 렌더된 카드 높이다 -
// 고정값으로 가정하면 설명이 긴 단계(마지막 단계처럼 대상이 화면 맨 아래에 있을 때)
// 카드 아래쪽이 화면 밖으로 잘린다.
function cardStyleFor(rect, cardHeight) {
  if (!rect) {
    return { top: "50%", left: "50%", transform: "translate(-50%, -50%)" };
  }

  const vw = window.innerWidth;
  const vh = window.innerHeight;
  const rightSpace = vw - (rect.left + rect.width);
  let left;
  if (rightSpace >= CARD_WIDTH + CARD_GAP + MARGIN) left = rect.left + rect.width + CARD_GAP;
  else if (rect.left >= CARD_WIDTH + CARD_GAP + MARGIN) left = rect.left - CARD_WIDTH - CARD_GAP;
  else left = Math.min(Math.max(MARGIN, rect.left + rect.width / 2 - CARD_WIDTH / 2), vw - CARD_WIDTH - MARGIN);

  // 세로는 대상 중앙에 맞추되, 실제 카드 높이로 위아래 모두 화면 안에 들어오게 클램프한다.
  const maxTop = Math.max(MARGIN, vh - cardHeight - MARGIN);
  const top = Math.min(Math.max(MARGIN, rect.top + rect.height / 2 - cardHeight / 2), maxTop);
  return { top: `${top}px`, left: `${left}px` };
}

function Tutorial({ onFinish, steps }) {
  const [index, setIndex] = useState(0);
  const [rect, setRect] = useState(null);
  // 렌더된 카드의 실제 높이 - 위치 계산에 쓴다(단계마다 설명 길이가 다르다).
  const cardRef = useRef(null);
  const [cardHeight, setCardHeight] = useState(240);
  const step = steps[index];
  const isCentered = !rect;

  // 레이아웃이 잡힌 뒤에 위치를 재고, 창 크기가 바뀌면 다시 잰다.
  useLayoutEffect(() => {
    const update = () => setRect(measure(step.target));
    update();
    window.addEventListener("resize", update);
    return () => window.removeEventListener("resize", update);
  }, [step.target]);

  // 단계/대상이 바뀌면 카드 높이를 다시 잰다(측정 -> 위치 재계산은 한 번만 돈다).
  useLayoutEffect(() => {
    if (cardRef.current) setCardHeight(cardRef.current.offsetHeight);
  }, [index, rect]);

  const goNext = () => {
    if (index + 1 < steps.length) setIndex(index + 1);
    else onFinish();
  };
  const goPrev = () => setIndex((i) => Math.max(0, i - 1));

  // ESC로 건너뛰고, Enter/Space/→로 다음, ←로 이전 단계로 간다.
  useEffect(() => {
    const onKey = (e) => {
      if (e.key === "Escape") {
        onFinish();
        return;
      }
      if (e.key === "ArrowLeft") {
        e.preventDefault();
        setIndex((i) => Math.max(0, i - 1));
        return;
      }
      if (e.key === "Enter" || e.key === " " || e.key === "ArrowRight") {
        e.preventDefault();
        if (index + 1 < steps.length) setIndex(index + 1);
        else onFinish();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [index, steps.length, onFinish]);

  return (
    <div className="tour" role="dialog" aria-label="게임 튜토리얼">
      {/* 구멍 뚫린 오버레이 - 강조 영역만 밝게 남기고 나머지를 덮는다.
          대상을 못 찾은 단계(레이아웃상 아직 없는 패널 등)는 전체를 덮는다. */}
      {rect ? (
        <div
          className="tour__spotlight"
          style={{
            top: rect.top - PADDING,
            left: rect.left - PADDING,
            width: rect.width + PADDING * 2,
            height: rect.height + PADDING * 2,
          }}
        />
      ) : (
        <div className="tour__backdrop" />
      )}

      <div
        ref={cardRef}
        className={`tour__card${isCentered ? " tour__card--center" : ""}`}
        style={cardStyleFor(rect, cardHeight)}
      >
        <div className="tour__head">
          <span className="tour__step-count">
            STEP {index + 1} <span className="tour__step-total">/ {steps.length}</span>
          </span>
          <div className="tour__progress">
            {steps.map((_, i) => (
              <span key={i} className={`tour__dot${i === index ? " tour__dot--on" : ""}`} />
            ))}
          </div>
        </div>

        <h2 className="tour__title">{step.title}</h2>
        {/* 빈 줄(\n\n)로 나눈 문단을 그대로 살린다 */}
        {step.body.split("\n\n").map((paragraph, i) => (
          <p key={i} className="tour__body">
            {paragraph}
          </p>
        ))}

        <div className="tour__actions">
          <button type="button" className="tour__skip" onClick={onFinish}>
            건너뛰기
          </button>
          <div className="tour__nav">
            <button type="button" className="tour__prev" onClick={goPrev} disabled={index === 0}>
              이전
            </button>
            <button type="button" className="tour__next" onClick={goNext}>
              {step.next}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

export default Tutorial;
