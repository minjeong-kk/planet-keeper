import { useCallback, useEffect, useState } from "react";
import { X, ChevronLeft, ChevronRight } from "lucide-react";
import { CONCEPT_PAGES } from "./conceptPages";

// 기후 개념 도감 — 디지털 SF 스타 패드(좌: 표제 / 우: 본문).
// 우측 디지털 탭은 hover 시 슬라이드로 확장되고, 페이지는 홀로그램처럼 전환된다.
//
// 우측 본문은 예전에 page.body 한 문단을 <p> 하나로 뿌렸다. 지금은 conceptPages.js
// 가 같은 문장을 sections(핵심/과정/공식/관계/게임/데이터) 블록으로 들고 있고,
// 아래 ConceptSection이 블록 종류별로 카드를 그린다 - 문장은 그대로고 위계만 생겼다.

const TOTAL = CONCEPT_PAGES.length;
const pageNo = (i) => String(i + 1).padStart(2, "0");

// 흐름도·공식·수치 카드 아래에 붙는 원문 문장. 문장이 길면 conceptPages가
// 배열로 나눠 넘기고, 여기서 문단별로 끊어 그린다 - 한 덩어리로 6~7줄이 되면
// 카드로 쪼갠 의미가 없어진다.
function Caption({ caption }) {
  if (!caption) return null;
  const parts = Array.isArray(caption) ? caption : [caption];
  return (
    <div className="codex-card__caption">
      {parts.map((text) => (
        <p key={text}>{text}</p>
      ))}
    </div>
  );
}

// 흐름도 한 줄. tone은 "그 에너지가 계에서 빠져나가는가(loss) 들어오는가(gain)"를
// 색으로만 구분한다 - 화살표는 CSS ::after로 그려서 마지막 단계만 빼면 된다.
function FlowStep({ step, isLast }) {
  return (
    <li
      className={`codex-flow__step${step.tone ? ` codex-flow__step--${step.tone}` : ""}${
        isLast ? " is-last" : ""
      }`}
    >
      {step.icon && (
        <span className="codex-flow__icon" aria-hidden="true">
          {step.icon}
        </span>
      )}
      <span className="codex-flow__text">{step.text}</span>
    </li>
  );
}

/**
 * sections 블록 하나를 카드로 그린다. 블록 종류는 conceptPages.js 머리 주석의
 * 여섯 가지(note/flow/formula/rules/bars/stats)뿐이고, 알 수 없는 종류가 오면
 * 조용히 아무것도 그리지 않는다(데이터 오타로 화면 전체가 죽지 않게).
 */
function ConceptSection({ section }) {
  const { type, icon, heading } = section;

  const head = (
    <h4 className="codex-card__head">
      {icon && (
        <span className="codex-card__icon" aria-hidden="true">
          {icon}
        </span>
      )}
      {heading}
    </h4>
  );

  if (type === "note") {
    return (
      <section className={`codex-card codex-card--note${section.tone ? ` is-${section.tone}` : ""}`}>
        {head}
        {section.paragraphs.map((text) => (
          <p key={text} className="codex-card__text">
            {text}
          </p>
        ))}
      </section>
    );
  }

  if (type === "flow") {
    return (
      <section className="codex-card">
        {head}
        <ol className="codex-flow">
          {section.steps.map((step, i) => (
            <FlowStep key={step.text} step={step} isLast={i === section.steps.length - 1 && !section.loop} />
          ))}
        </ol>
        {/* 순환 구조(양의 피드백)는 마지막에서 처음으로 돌아가는 줄을 하나 더 붙인다 */}
        {section.loop && (
          <p className="codex-flow__loop">
            <span aria-hidden="true">↻</span> {section.loop}
          </p>
        )}
        <Caption caption={section.caption} />
      </section>
    );
  }

  if (type === "formula") {
    return (
      <section className="codex-card">
        {head}
        <div className="codex-formula">
          {section.lines.map((line) => (
            <code key={line} className="codex-formula__line">
              {line}
            </code>
          ))}
        </div>
        <Caption caption={section.caption} />
      </section>
    );
  }

  if (type === "rules") {
    return (
      <section className="codex-card">
        {head}
        <ul className="codex-rules">
          {section.rows.map((row) => (
            <li key={row.cond} className={`codex-rules__row codex-rules__row--${row.dir}`}>
              <code className="codex-rules__cond">{row.cond}</code>
              <span className="codex-rules__effect">{row.effect}</span>
            </li>
          ))}
        </ul>
        <Caption caption={section.caption} />
      </section>
    );
  }

  if (type === "bars") {
    const max = section.max ?? 1;
    return (
      <section className="codex-card">
        {head}
        <ul className="codex-bars">
          {section.items.map((item) => (
            <li key={item.label} className="codex-bars__row">
              <span className="codex-bars__label">
                {item.icon && <span aria-hidden="true">{item.icon}</span>} {item.label}
              </span>
              <span className="codex-bars__track">
                <span
                  className="codex-bars__fill"
                  style={{ width: `${Math.max(0, Math.min(1, item.value / max)) * 100}%` }}
                />
              </span>
              <span className="codex-bars__value">{item.value}</span>
            </li>
          ))}
        </ul>
        <Caption caption={section.caption} />
      </section>
    );
  }

  if (type === "stats") {
    return (
      <section className="codex-card">
        {head}
        <ul className="codex-stats">
          {section.items.map((item) => (
            <li key={item.label} className="codex-stats__cell">
              <span className="codex-stats__label">{item.label}</span>
              <span className="codex-stats__value">{item.value}</span>
              {item.note && <span className="codex-stats__note">{item.note}</span>}
            </li>
          ))}
        </ul>
        <Caption caption={section.caption} />
      </section>
    );
  }

  return null;
}

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

      {/* key 를 바꿔 전환 애니메이션을 다시 재생한다. 본문 칸이 새로 마운트되므로
          개념을 넘길 때마다 스크롤도 맨 위(핵심 개념)에서 다시 시작한다. */}
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
          {page.sections.map((section) => (
            <ConceptSection key={section.heading} section={section} />
          ))}
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
