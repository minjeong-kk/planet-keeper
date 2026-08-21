import { useState } from "react";
import QuizReview from "../common/QuizReview.jsx";
import { reviewOf, retryHintOf } from "../../data/quizBank.js";

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
// 힌트(problem.hint)는 💡 모달로 띄우지 않고 패널 안에서 펼친다(원할 때만 열림).
//
// 힌트와 해설은 다른 글이다 - 예전에는 힌트 자리에 problem.explanation(해설)을
// 그대로 넣어서, 힌트를 한 번 열면 정답과 이유가 다 나와 힌트가 아니라 정답
// 공개였다. 지금은 quizBank가 문제마다 hint를 따로 들고 있고, 그 글은 "무엇을
// 따져야 하는지"만 가리킨다. 해설(explanation)은 판정 후 아래 QuizResult에서만
// 보여준다. 새 문제를 넣을 때 hint를 빼먹으면 힌트 카드 자체가 안 뜬다.
//
// disabled: 이상기후 경고에 응답하는 중(pendingClimateEvent)에는 true - 문제
// 풀이와 슬라이더 대응이 동시에 가능하면 어느 쪽에 반응해야 할지 헷갈리므로,
// 경고가 해소될 때까지 카드 전체를 잠근다.
//
// problem.bogi(문자열 배열)가 있으면 문제 제목 아래에 <보기> 상자를 띄운다 -
// "옳은 것만을 <보기>에서 있는 대로 고른 것은?"처럼 선택지가 "ㄱ, ㄴ"인 문제는
// 보기 항목 없이는 선택지가 아무 의미가 없다. 항목 텍스트에 이미 "ㄱ." "㉠" 같은
// 라벨이 들어있으므로 여기서 따로 번호를 붙이지 않는다.
// problem.bogiLabel을 null로 두면 상자 제목("보기")을 숨긴다 - 5번처럼 보기가
// 아니라 "과정 나열"인 문제(s3-surplus-sequence)에 쓴다.
const CHOICE_MARKS = ["①", "②", "③", "④", "⑤"];

function QuizModal({ problem, onAnswer, number, disabled = false, reward }) {
  const [showHint, setShowHint] = useState(false);
  const problemNumber = number ?? 1;

  return (
    <div className={`mission${disabled ? " is-locked" : ""}`} data-tour="mission">
      <div className="mission__head">
        <span className="mission__eyebrow">문제 {problemNumber}</span>
        {problem.isRetry && <span className="mission__retry">재도전</span>}
      </div>

      <h2 className="mission__question">{problem.title}</h2>

      {problem.bogi?.length > 0 && (
        <div className="mission__bogi">
          {problem.bogiLabel !== null && (
            <span className="mission__bogi-title">{problem.bogiLabel ?? "보기"}</span>
          )}
          {problem.bogi.map((item) => (
            <p key={item} className="mission__bogi-item">
              {item}
            </p>
          ))}
        </div>
      )}

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
        {problem.hint && (
          <div className="mission__card mission__card--hint">
            <button type="button" className="mission__card-toggle" onClick={() => setShowHint((v) => !v)}>
              <span className="mission__card-title">💡 힌트</span>
              <span className="mission__card-chevron">{showHint ? "닫기" : "열기"}</span>
            </button>
            {showHint && <p>{problem.hint}</p>}
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
 * 문제를 푼 직후 같은 자리에 뜨는 해설 카드. 시간이 지나도 사라지지 않고
 * "계속"(게임이 끝나는 문제라면 "결과 보기")을 눌러야 넘어간다 - 읽는 속도가
 * 사람마다 달라서, 자동으로 닫으면 다 읽기 전에 화면이 바뀐다. GamePage가 푸는 시점에 복사해 둔
 * { correct, explanation, concepts, reward }를 그대로 보여주기만 한다 - 정답
 * 판정과 보상 지급은 이미 useGameStore가 끝낸 뒤다.
 */
export function QuizResult({ result, onClose, continueLabel = "계속" }) {
  return (
    <div className={`mission mission--result mission--result-${result.correct ? "correct" : "wrong"}`}>
      <div className="mission__head">
        <span className="mission__verdict">{result.correct ? "✅ 정답" : "❌ 오답"}</span>
        <button type="button" className="mission__close" onClick={onClose}>
          {continueLabel}
        </button>
      </div>

      {/* 정답일 때만 해설을 펼친다 - 긴 문단 하나가 아니라 블록으로 그리고, 핵심
          결론 한 문장이 맨 위에 온다. 오답이면 정답이 드러나므로 감춘다. */}
      {result.correct ? (
        <QuizReview review={reviewOf(result.id)} fallbackText={result.explanation} />
      ) : (
        /* 오답이면 해설 대신 한 단 자세한 힌트를 준다 - 필요한 수치를 다 풀어
           주지만 어느 선택지가 맞는지는 말하지 않아서, 재도전이 살아 있다. */
        <div className="mission__retry">
          <p className="mission__retry-note">이 문제는 재도전으로 다시 나옵니다.</p>
          {retryHintOf(result.id) && (
            <div className="mission__retry-hint">
              <span className="mission__retry-hint-title">🔎 조금 더 자세한 힌트</span>
              <p>{retryHintOf(result.id)}</p>
            </div>
          )}
        </div>
      )}

      {result.correct && result.concepts?.length > 0 && (
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
