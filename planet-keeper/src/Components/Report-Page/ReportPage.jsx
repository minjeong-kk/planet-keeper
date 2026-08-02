import { useNavigate } from "react-router-dom";
import useClimateStore, { CLIMATE_VARIABLES } from "../../store/useClimateStore";
import useGameStore from "../../store/useGameStore";
import { energyStateOf } from "../../utils/physicsEngine.js";
import "./ReportPage.css";

// gameOverReason별 결과 배너. "stable"/"completed"는 성공, "hearts"는 실패.
const RESULT_BANNER_BY_REASON = {
  stable: {
    title: "🎉 미션 성공 - 행성 평형 안정 도달",
    detail: "아이템 사용 후 행성이 지구형 안정(Earth-like Stable) 상태에 도달해 게임을 성공적으로 마쳤습니다.",
  },
  completed: {
    title: "🎉 미션 성공 - 모든 문제 해결",
    detail: "최종 문제까지 전부 맞혀 게임을 마쳤습니다.",
  },
  hearts: {
    title: "💔 미션 실패 - 목숨 소진",
    detail: "오답이 3회 누적되어 행성을 안정시키지 못한 채 게임이 종료됐습니다.",
  },
};

function ReportPage() {
  const navigate = useNavigate();
  const values = useClimateStore((state) => state.values);
  const resetClimate = useClimateStore((state) => state.resetClimate);
  // 게임 중 아이템 사용으로 재계산된 최신 Physics 결과(useGameStore)를 보여준다 -
  // useClimateStore.physicsResult는 제작 페이지 시점의 값이라 최종 결과와 다를 수 있다.
  const physicsResult = useGameStore((state) => state.physicsResult);
  const gameOverReason = useGameStore((state) => state.gameOverReason);
  const resetGame = useGameStore((state) => state.resetGame);

  const resultBanner = RESULT_BANNER_BY_REASON[gameOverReason] ?? {
    title: "행성 진단 결과",
    detail: "",
  };

  const handleRestart = () => {
    resetClimate();
    resetGame();
    navigate("/planet-create");
  };

  return (
    <div className="report-page">
      <h1 className="report-page__title">피드백 창</h1>

      <div className="report-page__section">
        <h2>{resultBanner.title}</h2>
        {resultBanner.detail && <p>{resultBanner.detail}</p>}

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

        {/* Physics Engine 결과 (PlanetCreatePage에서 계산해 Store에 저장한 값 그대로 사용) */}
        <div className="report-page__values-box">
          <h3>Physics 진단</h3>
          <ul className="report-page__values-list">
            <li className="report-page__value-item">
              <span className="label">Current Temperature</span>
              <span className="value">{physicsResult ? `${physicsResult.currentTemperature.toFixed(1)} K` : "-"}</span>
            </li>
            <li className="report-page__value-item">
              <span className="label">ASR</span>
              <span className="value">{physicsResult ? physicsResult.absorbedRadiation.toFixed(2) : "-"}</span>
            </li>
            <li className="report-page__value-item">
              <span className="label">OLR</span>
              <span className="value">{physicsResult ? physicsResult.outgoingRadiation.toFixed(2) : "-"}</span>
            </li>
            <li className="report-page__value-item">
              <span className="label">Delta Energy</span>
              <span className="value">{physicsResult ? physicsResult.deltaEnergy.toFixed(2) : "-"}</span>
            </li>
            <li className="report-page__value-item">
              <span className="label">Albedo</span>
              <span className="value">{physicsResult ? physicsResult.albedo.toFixed(2) : "-"}</span>
            </li>
            <li className="report-page__value-item">
              <span className="label">Greenhouse Strength</span>
              <span className="value">{physicsResult ? physicsResult.greenhouseStrength.toFixed(2) : "-"}</span>
            </li>
            <li className="report-page__value-item">
              <span className="label">Energy State</span>
              <span className="value">{physicsResult ? energyStateOf(physicsResult.deltaEnergy) : "-"}</span>
            </li>
          </ul>
        </div>
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
