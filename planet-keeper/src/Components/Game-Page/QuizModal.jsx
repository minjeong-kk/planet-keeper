import { useNavigate } from "react-router-dom";

function QuizModal() {
  const navigate = useNavigate();

  return (
    <div className="game-page__modal">
      <p>게임 문제 (풀리면 유사 개념 문제 나오게)</p>
      <p>게임 해설</p>
      <p>아이템 창 (간단한 설명)</p>
      {/* 게임 로직 붙기 전까지 임시로 다음 페이지(리포트)로 이동 */}
      <button className="btn-primary" onClick={() => navigate("/report")}>다음</button>
    </div>
  );
}

export default QuizModal;
