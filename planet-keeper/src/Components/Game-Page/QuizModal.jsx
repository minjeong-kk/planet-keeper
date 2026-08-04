import { useState } from "react";

// PROBLEM1/FINAL 단계가 공유하는 문제 UI. 정답 판정은 하지 않고 선택값을
// 그대로 onSubmit으로 올려보낸다 - 판정은 store의 solveProblem(answer)이 한다.
// 정답/오답 피드백은 GamePage가 (Stage 전환과 무관하게) 따로 표시한다.
function QuizModal({ problem, onSubmit }) {
  const [selected, setSelected] = useState(null);

  const handleSubmit = () => {
    if (selected === null) return;
    onSubmit(selected);
    setSelected(null);
  };

  return (
    <div className="game-page__modal">
      <p>{problem.title}</p>
      <ul className="game-page__quiz-choices">
        {problem.choices.map((choice) => (
          <li key={choice}>
            <label>
              <input
                type="radio"
                name={problem.id}
                checked={selected === choice}
                onChange={() => setSelected(choice)}
              />
              {choice}
            </label>
          </li>
        ))}
      </ul>

      <button className="btn-primary" onClick={handleSubmit}>
        제출
      </button>
    </div>
  );
}

export default QuizModal;
