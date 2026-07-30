import { useNavigate } from "react-router-dom";
import "./ReportPage.css";

function ReportPage() {
  const navigate = useNavigate();

  return (
    <div className="report-page">
      <h1 className="report-page__title">피드백 창</h1>

      <div className="report-page__section">
        <p>게임 합격 / 탈락 (뭐가 문제인 행성인지 서술)</p>
        <p>행성 변수값</p>
        <p>피드백 루프 한줄 정리</p>
      </div>

      <div className="report-page__section">
        <p>틀린 문제와 해설</p>
      </div>

      <hr className="report-page__divider" />

      <div className="report-page__section">
        <p>푼 문제 서술 / 해설 - 어떤 개념 문제임</p>
        <p>재도전 피드백</p>
      </div>

      <button
        className="report-page__restart"
        onClick={() => navigate("/planet-create")}
      >
        행성 만들기로 가기 (초기화)
      </button>
    </div>
  );
}

export default ReportPage;
