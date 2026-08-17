import { useState } from "react";

// 오른쪽 패널의 임무(문제) 카드. PROBLEM1/FINAL 단계가 공유한다.
// number는 GamePage가 "지금까지 몇 번째로 푸는 문제인지"(quizLog.length + 1)를
// 넘겨준다 - 문제 자체는 quizBank.js에서 "s3-cloud-effect" 같은 슬러그 id로
// 무작위로 뽑히므로, problem.id를 그대로 번호처럼 보여주면 무의미한 영문 문자열이
// 노출된다.
//
// 선택지를 누르면 곧바로 판정한다(별도 제출 버튼 없음) - 판정 로직은 그대로
// GamePage -> useGameStore.solveProblem 경로를 쓴다. 판정 직후에는 GamePage가
// 이 카드 자리에 아래 QuizResult(해설 카드)를 대신 띄운다.
//
// 힌트(problem.explanation)는 예전처럼 💡 모달로 띄우지 않고 패널 안에서 펼친다 -
// 내용/노출 시점은 같고(원할 때만 열림), 화면 밖으로 나가는 모달이 사라졌다.
//
// disabled: 이상기후 경고에 응답하는 중(pendingClimateEvent)에는 true - 문제
// 풀이와 슬라이더 대응이 동시에 가능하면 어느 쪽에 반응해야 할지 헷갈리므로,
// 경고가 해소될 때까지 카드 전체를 잠근다.
const CHOICE_MARKS = ["①", "②", "③", "④", "⑤"];

function QuizModal({ problem, onAnswer, number, disabled = false, reward }) {
  const [showHint, setShowHint] = useState(false);
  const problemNumber = number ?? 1;

  return (
    <div className={`mission${disabled ? " is-locked" : ""}`}>
      <div className="mission__head">
        <span className="mission__eyebrow">문제 {problemNumber}</span>
        {problem.isRetry && <span className="mission__retry">재도전</span>}
      </div>

      <h2 className="mission__question">{problem.title}</h2>

      <ul className="mission__choices">
        {problem.choices.map((choice, i) => (
          <li key={choice}>
            <button type="button" className="choice" onClick={() => onAnswer(choice)} disabled={disabled}>
              <span className="choice__mark">{CHOICE_MARKS[i] ?? i + 1}</span>
              <span className="choice__text">{choice}</span>
            </button>
          </li>
        ))}
      </ul>

      <div className="mission__footer">
        {problem.explanation && (
          <div className="mission__card mission__card--hint">
            <button type="button" className="mission__card-toggle" onClick={() => setShowHint((v) => !v)}>
              <span className="mission__card-title">💡 힌트</span>
              <span className="mission__card-chevron">{showHint ? "닫기" : "열기"}</span>
            </button>
            {showHint && <p>{problem.explanation}</p>}
          </div>
        )}

        {reward && (
          <div className="mission__card mission__card--reward">
            <span className="mission__card-title">🎁 보상</span>
            <p>{reward}</p>
          </div>
        )}
      </div>
    </div>
  );
}

/**
 * 문제를 푼 직후 같은 자리에 뜨는 해설 카드. GamePage가 푸는 시점에 복사해 둔
 * { correct, explanation, concepts, reward }를 그대로 보여주기만 한다 - 정답
 * 판정과 보상 지급은 이미 useGameStore가 끝낸 뒤다.
 */
export function QuizResult({ result, onClose }) {
  return (
    <div className={`mission mission--result mission--result-${result.correct ? "correct" : "wrong"}`}>
      <div className="mission__head">
        <span className="mission__verdict">{result.correct ? "✅ 정답" : "❌ 오답"}</span>
        <button type="button" className="mission__close" onClick={onClose}>
          계속
        </button>
      </div>

      {result.explanation && <p className="mission__explanation">{result.explanation}</p>}

      {result.concepts?.length > 0 && (
        <p className="mission__concepts">
          {result.concepts.map((concept) => (
            <span key={concept} className="mission__concept">
              {concept}
            </span>
          ))}
        </p>
      )}

      {result.reward && (
        <div className="mission__card mission__card--reward">
          <span className="mission__card-title">🎁 보상</span>
          <p>{result.reward}</p>
        </div>
      )}
    </div>
  );
}

export default QuizModal;
