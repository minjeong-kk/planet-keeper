import "./QuizReview.css";

// 퀴즈 해설을 블록 단위로 그린다. 게임 화면(QuizModal의 QuizResult)과 리포트의
// 해설 모달이 이 컴포넌트 하나를 같이 쓴다 - 두 곳에 같은 마크업을 복제해두면
// 한쪽만 고쳤을 때 같은 해설이 화면마다 달라 보인다.
//
// 정답 해설(quizBank의 review)과 오답 해설(retryReview)도 이 컴포넌트를 같이 쓴다.
// 예전에는 오답일 때만 긴 문단 하나(retryHint 문자열)를 그려서, 같은 수치를 담고도
// 정답 해설보다 훨씬 읽기 나빴다. 대신 두 해설의 "맨 앞·맨 뒤 블록"이 다르다:
// 정답은 결론을 먼저 말하는 verdict, 오답은 결론 대신 근거만 놓는 fact다.
//
// 오답 해설은 "무엇을 해 보세요" 하고 시키지 않는다 - 퀴즈 화면에서는 조성을 만질 수
// 없고(조성 조절은 앞 단계인 제작 페이지에서만 한다), 지금 할 수 없는 조작을 지시하는
// 말이 된다. 대신 관련된 수치와 식을 사실로 놓고, 마지막 misread 블록에서 "어느 서술이
// 그 사실과 어긋나는지"를 짚는다 - 어느 선택지가 맞는지는 말하지 않으므로 재도전은
// 살아 있다.
//
// 블록 종류는 quizBank.js의 review / retryReview와 1:1이고, 문제마다 필요한 것만
// 골라 쓴다(모든 해설을 같은 템플릿으로 만들지 않는다):
//   verdict  핵심 결론 한 문장 - 정답 해설의 맨 앞. 이것만 읽어도 무엇을 배웠는지 알게 한다
//   fact     이 문제가 걸려 있는 사실 - 오답 해설의 맨 앞. 결론이 아니라 근거만 놓는다
//   text     { heading, paragraphs }  짧은 설명
//   flow     { heading, steps }       원인 → 결과 흐름(단계 사이에 ↓)
//   compare  { heading, items }       두 개념 / 두 상황 / 수치 비교
//   formula  { heading, lines, vars } 공식 + 각 값의 의미
//   misread  { items }                그 사실과 어긋나는 서술들(오답 해설의 마지막)
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

  // 오답 해설의 첫 줄. verdict와 같은 자리·같은 크기지만 결론이 아니라 근거라서,
  // 마크와 색을 달리해 한눈에 구분되게 한다.
  if (type === "fact") {
    return (
      <p className="qreview__fact">
        <span className="qreview__fact-mark" aria-hidden="true">
          📌
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

  // 오답 해설의 마지막 블록 - 위에 놓은 사실과 어긋나는 서술을 짚는다. 어느 선택지가
  // 맞는지는 쓰지 않고, 무엇이 사실과 다른지만 적는다.
  if (type === "misread") {
    return (
      <section className="qreview__block qreview__block--misread">
        <h5 className="qreview__heading">{block.heading ?? "이 사실과 어긋나는 것"}</h5>
        <ul className="qreview__misread">
          {block.items.map((it) => (
            <li key={it} className="qreview__misread-item">
              {it}
            </li>
          ))}
        </ul>
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
 * 해설 블록 배열을 그린다. review가 없으면(예: 이 기능이 없던 시절에 저장된
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
