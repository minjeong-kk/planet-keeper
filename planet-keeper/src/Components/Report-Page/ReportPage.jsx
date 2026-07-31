import { useNavigate } from "react-router-dom";
import useClimateStore, { CLIMATE_VARIABLES } from "../../store/useClimateStore";
import "./ReportPage.css";

function ReportPage() {
  const navigate = useNavigate();
  const values = useClimateStore((state) => state.values);
  const reset = useClimateStore((state) => state.reset);

  const handleRestart = () => {
    reset();
    navigate("/planet-create");
  };

  return (
    <div className="report-page">
      <h1 className="report-page__title">피드백 창</h1>

      <div className="report-page__section">
        <h2>행성 진단 결과</h2>
        <p>게임 합격 / 탈락 (뭐가 문제인 행성인지 서술)</p>
        
        {/* 행성 변수값 리스트 */}
        <div className="report-page__values-box">
          <h3>현재 행성 변수 설정값</h3>
          <ul className="report-page__values-list">
            {CLIMATE_VARIABLES.map(({ key, label }) => (
              <li key={key} className="report-page__value-item">
                <span className="label">{label}</span>
                <span className="value">{values ? values[key] : 50}</span>
              </li>
            ))}
          </ul>
        </div>

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

      <button className="report-page__restart" onClick={handleRestart}>
        행성 만들기로 가기 (초기화)
      </button>
    </div>
  );
}

export default ReportPage;
