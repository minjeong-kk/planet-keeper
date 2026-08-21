import "./QuizReview.css";

// 정답 해설을 블록 단위로 그린다. 게임 화면(QuizModal의 QuizResult)과 리포트의
// 해설 모달이 이 컴포넌트 하나를 같이 쓴다 - 두 곳에 같은 마크업을 복제해두면
// 한쪽만 고쳤을 때 같은 해설이 화면마다 달라 보인다.
//
// 블록 종류는 quizBank.js의 review와 1:1이고, 문제마다 필요한 것만 골라 쓴다
// (모든 해설을 같은 템플릿으로 만들지 않는다):
//   verdict  핵심 결론 한 문장 - 항상 맨 앞. 이것만 읽어도 무엇을 배웠는지 알게 한다
//   text     { heading, paragraphs }  짧은 설명
//   flow     { heading, steps }       원인 → 결과 흐름(단계 사이에 ↓)
//   compare  { heading, items }       두 개념 / 두 상황 / 수치 비교
//   formula  { heading, lines, vars } 공식 + 각 값의 의미
//   game     이 개념이 게임에서 어떻게 쓰이는지
//   note     본문 흐름에서 빼도 되는 참고
//
// 알 수 없는 종류가 오면 조용히 건너뛴다 - 데이터 오타로 해설 전체가 죽지 않게.
function ReviewBlock({ block }) {
  const { type } = block;

  if (type === "verdict") {
    return (
      <p className="qreview__verdict">
        <span className="qreview__verdict-mark" aria-hidden="true">
          ✔
        </span>
        {block.text}
      </p>
    );
  }

  if (type === "text") {
    return (
      <section className="qreview__block">
        {block.heading && <h5 className="qreview__heading">{block.heading}</h5>}
        {block.paragraphs.map((p) => (
          <p key={p} className="qreview__text">
            {p}
          </p>
        ))}
      </section>
    );
  }

  if (type === "flow") {
    return (
      <section className="qreview__block">
        {block.heading && <h5 className="qreview__heading">{block.heading}</h5>}
        <ol className="qreview__flow">
          {block.steps.map((s, i) => (
            <li
              key={s.text}
              className={`qreview__step${s.tone ? ` qreview__step--${s.tone}` : ""}${
                i === block.steps.length - 1 ? " is-last" : ""
              }`}
            >
              {s.icon && (
                <span className="qreview__step-icon" aria-hidden="true">
                  {s.icon}
                </span>
              )}
              <span>{s.text}</span>
            </li>
          ))}
        </ol>
      </section>
    );
  }

  if (type === "compare") {
    return (
      <section className="qreview__block">
        {block.heading && <h5 className="qreview__heading">{block.heading}</h5>}
        <dl className="qreview__compare">
          {block.items.map((it) => (
            <div key={it.label} className="qreview__compare-row">
              <dt className="qreview__compare-label">{it.label}</dt>
              <dd className="qreview__compare-text">{it.text}</dd>
            </div>
          ))}
        </dl>
      </section>
    );
  }

  if (type === "formula") {
    return (
      <section className="qreview__block">
        {block.heading && <h5 className="qreview__heading">{block.heading}</h5>}
        <div className="qreview__formula">
          {block.lines.map((line) => (
            <code key={line}>{line}</code>
          ))}
        </div>
        {/* 공식만 던지지 않고 각 값이 무엇인지 바로 아래에 붙인다 */}
        {block.vars?.length > 0 && (
          <dl className="qreview__vars">
            {block.vars.map((v) => (
              <div key={v.sym} className="qreview__var-row">
                <dt className="qreview__var-sym">{v.sym}</dt>
                <dd className="qreview__var-text">{v.text}</dd>
              </div>
            ))}
          </dl>
        )}
      </section>
    );
  }

  if (type === "game") {
    return (
      <section className="qreview__block qreview__block--game">
        <h5 className="qreview__heading">🎮 게임에서는</h5>
        <p className="qreview__text">{block.text}</p>
      </section>
    );
  }

  if (type === "note") {
    return (
      <section className="qreview__block qreview__block--note">
        <h5 className="qreview__heading">📎 참고</h5>
        <p className="qreview__text">{block.text}</p>
      </section>
    );
  }

  return null;
}

/**
 * review 블록 배열을 그린다. review가 없으면(예: 이 기능이 없던 시절에 저장된
 * quizLog 항목) fallbackText를 문단 하나로 그려서 해설이 아예 사라지지 않게 한다.
 */
function QuizReview({ review, fallbackText }) {
  if (!review?.length) {
    return fallbackText ? <p className="qreview__text">{fallbackText}</p> : null;
  }
  return (
    <div className="qreview">
      {review.map((block, i) => (
        <ReviewBlock key={`${block.type}-${i}`} block={block} />
      ))}
    </div>
  );
}

export default QuizReview;
