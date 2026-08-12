import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { Target, BookOpen, ChevronRight, X } from "lucide-react";
import ConceptBook from "./ConceptBook";
import { CONCEPT_PAGES } from "./conceptPages";

// 첫 화면에는 버튼 2개만 두고, 내용은 전부 팝업에서 보여준다.
// ① 학습 목표 & 게임 흐름(브리핑 패널)  ② 기후 개념 도감(스타 패드)
//
// 팝업은 createPortal 로 document.body 에 붙인다. 이 컴포넌트가 있는
// .start-page__side 와 마스코트가 있는 .start-page__stage 는 형제라서, 팝업을
// 여기 그대로 두면 position:fixed 라도 side 의 스택 컨텍스트 안에 갇혀 뒤에
// 오는 stage(마스코트) 밑으로 깔린다. body 로 빼면 그런 영향을 받지 않는다.

const GOAL_INTRO =
  "열수지·알베도·온실효과 공식을 직접 조작해보며 '행성이 평형에 도달한다는 것'과 " +
  "'평형이어도 온도가 지구형 범위 밖일 수 있다는 것'을 구분해서 이해하는 것이 목표입니다.";

const GOAL_STEPS = [
  {
    title: "행성 만들기",
    text: "슬라이더(빙하·바다·구름·대기두께·CO₂)로 행성을 만들면 Physics Engine이 지금 조성의 에너지 상태를 바로 판정합니다. 우연히 이미 지구형 평형이면 바로 성공입니다.",
  },
  {
    title: "1단계 문제 & 아이템",
    text: "공식 계산·상태 판정 문제를 풀고 아이템으로 조성을 실제로 바꿉니다. 그 조성이 평형에 도달하면 몇 도가 되는지(Cold / Earth-like / Warm Stable)를 물리엔진이 판정합니다.",
  },
  {
    title: "2단계 확인",
    text: "2단계 문제를 풀어 그 판정을 확인합니다. 아직 지구형 범위 밖이면 CO₂를 부족한 방향으로 조정해 다시 시도합니다(3번째 시도에서는 정확히 평형을 맞춰 마무리).",
  },
  {
    title: "기후 리포트",
    text: "목숨은 3개입니다. 다 잃으면 게임오버, 성공하거나 게임오버가 되면 기후 리포트로 이동해 최종 결과를 확인합니다.",
  },
];

function InfoSection() {
  // "goal" | "codex" | null
  const [panel, setPanel] = useState(null);

  const close = () => setPanel(null);

  useEffect(() => {
    if (!panel) return;
    const onKeyDown = (e) => {
      if (e.key === "Escape") close();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [panel]);

  return (
    <div className="start-page__menu">
      <button
        className="start-page__menu-btn"
        onClick={() => setPanel("goal")}
        aria-haspopup="dialog"
      >
        <span className="start-page__menu-icon">
          <Target size={26} />
        </span>
        <span className="start-page__menu-text">
          <span className="start-page__menu-label">학습 목표 &amp; 게임 흐름</span>
          <span className="start-page__menu-sub">MISSION BRIEFING</span>
        </span>
        <ChevronRight size={22} className="start-page__menu-arrow" />
      </button>

      <button
        className="start-page__menu-btn"
        onClick={() => setPanel("codex")}
        aria-haspopup="dialog"
      >
        <span className="start-page__menu-icon">
          <BookOpen size={26} />
        </span>
        <span className="start-page__menu-text">
          <span className="start-page__menu-label">기후 개념 도감</span>
          <span className="start-page__menu-sub">CLIMATE CODEX · {CONCEPT_PAGES.length}</span>
        </span>
        <ChevronRight size={22} className="start-page__menu-arrow" />
      </button>

      {/* ── 학습 목표 & 게임 흐름 ── */}
      {panel === "goal" &&
        createPortal(
          <div className="start-page__overlay" onClick={close}>
            <div
              className="start-page__panel"
              role="dialog"
              aria-label="학습 목표와 게임 흐름"
              onClick={(e) => e.stopPropagation()}
            >
              <header className="start-page__panel-head">
                <span className="start-page__panel-eyebrow">MISSION BRIEFING</span>
                <h2 className="start-page__panel-title">학습 목표 &amp; 게임 흐름</h2>
                <button className="start-page__panel-close" onClick={close} aria-label="닫기">
                  <X size={18} />
                </button>
              </header>

              <p className="start-page__panel-intro">{GOAL_INTRO}</p>

              <ol className="start-page__flow">
                {GOAL_STEPS.map((step, i) => (
                  <li className="start-page__flow-step" key={step.title} style={{ "--i": i }}>
                    <span className="start-page__flow-no">{String(i + 1).padStart(2, "0")}</span>
                    <span className="start-page__flow-body">
                      <strong className="start-page__flow-title">{step.title}</strong>
                      <span className="start-page__flow-text">{step.text}</span>
                    </span>
                  </li>
                ))}
              </ol>
            </div>
          </div>,
          document.body
        )}

      {/* ── 기후 개념 도감(스타 패드) ── */}
      {panel === "codex" &&
        createPortal(
          <div className="start-page__overlay start-page__overlay--book" onClick={close}>
            <ConceptBook onClose={close} />
          </div>,
          document.body
        )}
    </div>
  );
}

export default InfoSection;
