import { useCallback, useEffect, useState } from "react";
import { X, ChevronLeft, ChevronRight } from "lucide-react";
import { CONCEPT_PAGES } from "./conceptPages";

// 기후 개념 도감 — 디지털 SF 스타 패드(좌: 표제 / 우: 본문).
// 우측 디지털 탭은 hover 시 슬라이드로 확장되고, 페이지는 홀로그램처럼 전환된다.

const TOTAL = CONCEPT_PAGES.length;
const pageNo = (i) => String(i + 1).padStart(2, "0");

function ConceptBook({ onClose }) {
  const [index, setIndex] = useState(0);
  // 전환 방향에 따라 지면이 슬라이드해 들어오는 쪽을 바꾼다.
  const [direction, setDirection] = useState("next");

  const turnTo = (next) => {
    if (next === index) return;
    setDirection(next > index ? "next" : "prev");
    setIndex(next);
  };

  const turnBy = useCallback((step) => {
    setDirection(step > 0 ? "next" : "prev");
    setIndex((prev) => (prev + step + TOTAL) % TOTAL);
  }, []);

  // 좌우 방향키로도 넘긴다.
  useEffect(() => {
    const onKeyDown = (e) => {
      if (e.key === "ArrowLeft") turnBy(-1);
      if (e.key === "ArrowRight") turnBy(1);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [turnBy]);

  const page = CONCEPT_PAGES[index];

  return (
    <div
      className="start-page__pad"
      role="dialog"
      aria-label="기후 개념 도감"
      onClick={(e) => e.stopPropagation()}
    >
      <button className="start-page__pad-close" onClick={onClose} aria-label="도감 닫기">
        <X size={18} />
      </button>

      <header className="start-page__pad-head">
        <span className="start-page__pad-eyebrow">CLIMATE CODEX · STAR-PAD</span>
        <h2 className="start-page__pad-title">기후 개념 도감</h2>
      </header>

      {/* 우측 디지털 탭 — hover/선택 시 슬라이드로 펼쳐진다 */}
      <nav className="start-page__tabs" aria-label="개념 목차">
        {CONCEPT_PAGES.map((item, i) => (
          <button
            key={item.key}
            className={`start-page__tab${i === index ? " is-active" : ""}`}
            onClick={() => turnTo(i)}
            aria-current={i === index}
          >
            <span className="start-page__tab-no">{pageNo(i)}</span>
            <span className="start-page__tab-name">{item.tab}</span>
          </button>
        ))}
      </nav>

      {/* key 를 바꿔 전환 애니메이션을 다시 재생한다 */}
      <div className={`start-page__panes start-page__panes--${direction}`} key={page.key}>
        <section className="start-page__pane">
          <span className="start-page__pane-no">NO.{pageNo(index)}</span>
          <h3 className="start-page__pane-title">{page.title}</h3>
          <span className="start-page__pane-label">{page.label}</span>
          <p className="start-page__pane-summary">{page.summary}</p>
          <code className="start-page__pane-formula">{page.formula}</code>
        </section>

        {/* 제본선 대신 얇은 홀로그램 분할선 */}
        <span className="start-page__divider" aria-hidden="true" />

        <section className="start-page__pane start-page__pane--body">
          <p className="start-page__pane-body">{page.body}</p>
        </section>
      </div>

      <footer className="start-page__pad-foot">
        <button
          className="start-page__pad-nav"
          onClick={() => turnBy(-1)}
          aria-label="이전 개념"
        >
          <ChevronLeft size={16} />
        </button>

        <span className="start-page__pad-count">
          {pageNo(index)} <em>/</em> {pageNo(TOTAL - 1)}
        </span>

        <button
          className="start-page__pad-nav"
          onClick={() => turnBy(1)}
          aria-label="다음 개념"
        >
          <ChevronRight size={16} />
        </button>
      </footer>
    </div>
  );
}

export default ConceptBook;
