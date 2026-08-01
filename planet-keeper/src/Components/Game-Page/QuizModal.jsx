import { useState } from "react";

// QUIZ/FINAL_QUIZ 단계가 공유하는 문제 UI. quiz 데이터({id, question, choices,
// answer, reward})만 바뀌고 정답/오답 처리는 부모(GamePage)의 Stage 전환 로직에 맡긴다.
function QuizModal({ quiz, onCorrect, onWrong }) {
  const [selected, setSelected] = useState(null);
  const [wrongMessage, setWrongMessage] = useState(false);

  const handleSubmit = () => {
    if (selected === null) return;

    if (selected === quiz.answer) {
      onCorrect(quiz.reward);
      return;
    }

    setWrongMessage(true);
    setSelected(null);
    onWrong();
  };

  return (
    <div className="game-page__modal">
      <p>{quiz.question}</p>
      <ul className="game-page__quiz-choices">
        {quiz.choices.map((choice, index) => (
          <li key={index}>
            <label>
              <input
                type="radio"
                name={quiz.id}
                checked={selected === index}
                onChange={() => {
                  setSelected(index);
                  setWrongMessage(false);
                }}
              />
              {choice}
            </label>
          </li>
        ))}
      </ul>

      {wrongMessage && <p>오답입니다. 다시 시도해보세요.</p>}

      <button className="btn-primary" onClick={handleSubmit}>
        제출
      </button>
    </div>
  );
}

export default QuizModal;
