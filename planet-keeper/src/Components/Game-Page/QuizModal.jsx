import { useState } from "react";

// PROBLEM1/FINAL 단계가 공유하는 문제 UI. number는 GamePage가 "지금까지 몇
// 번째로 푸는 문제인지"(quizLog.length + 1)를 넘겨준다 - 문제 자체는 quizBank.js에서
// "s3-cloud-effect" 같은 슬러그 id로 무작위로 뽑히므로, problem.id를 그대로
// 번호처럼 보여주면 학생에게 무의미한 영문 문자열이 노출된다.
function QuizModal({ problem, onSubmit, number }) {
  const [selected, setSelected] = useState(null);
  const [showExplanationModal, setShowExplanationModal] = useState(false);

  const handleSubmit = () => {
    if (selected === null) return;
    onSubmit(selected);
    setSelected(null);
  };

  const problemNumber = number ?? 1;

  return (
    <div className="game-quiz-card">
      {/* 카드 상단 헤더 (재도전 뱃지 & 💡 해설 모달 버튼) */}
      <div className="game-quiz-card__header">
        <div className="game-quiz-card__tags">
          {problem.isRetry && (
            <span className="game-quiz-card__retry-badge">⚠️ 재도전 문제</span>
          )}
        </div>

        {/* 우측 상단 💡 전구 이모지 버튼 */}
        {problem.explanation && (
          <button
            type="button"
            className="game-quiz-card__hint-btn"
            title="문제 해설 보기"
            onClick={() => setShowExplanationModal(true)}
          >
            💡
          </button>
        )}
      </div>

      {/* 문제 제목/설명/묘사 앞에 번호(1., 2., 3...) 추가 */}
      <h3 className="game-quiz-card__title">
        <span className="game-quiz-card__title-num">{problemNumber}.</span> {problem.title}
      </h3>

      {/* 선택지 목록 (숫자 없이 깔끔하게 표시) */}
      <ul className="game-quiz-card__choices">
        {problem.choices.map((choice) => (
          <li
            key={choice}
            className={`game-quiz-card__choice-item ${
              selected === choice ? "game-quiz-card__choice-item--selected" : ""
            }`}
            onClick={() => setSelected(choice)}
          >
            <label className="game-quiz-card__choice-label">
              <input
                type="radio"
                name={`quiz-${problem.id}`}
                checked={selected === choice}
                onChange={() => setSelected(choice)}
              />
              <span className="game-quiz-card__choice-text">{choice}</span>
            </label>
          </li>
        ))}
      </ul>

      <button
        className="btn-primary game-quiz-card__submit-btn"
        disabled={selected === null}
        onClick={handleSubmit}
      >
        제출하기
      </button>

      {/* 💡 전구 클릭 시 뜨는 해설 모달 창 */}
      {showExplanationModal && (
        <div
          className="game-quiz-modal-overlay"
          onClick={() => setShowExplanationModal(false)}
        >
          <div
            className="game-quiz-modal"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="game-quiz-modal__header">
              <span className="game-quiz-modal__icon">💡</span>
              <h4>문제 해설</h4>
            </div>

            <p className="game-quiz-modal__question">
              {problemNumber}. {problem.title}
            </p>

            <div className="game-quiz-modal__content">
              <p>{problem.explanation}</p>
            </div>

            {problem.concepts?.length > 0 && (
              <div className="game-quiz-modal__concepts">
                <h5>📚 관련 개념</h5>
                <ul>
                  {problem.concepts.map((concept) => (
                    <li key={concept}>{concept}</li>
                  ))}
                </ul>
              </div>
            )}

            <button
              className="game-quiz-modal__close-btn"
              onClick={() => setShowExplanationModal(false)}
            >
              닫기
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

export default QuizModal;