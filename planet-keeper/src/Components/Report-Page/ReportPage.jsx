import { useNavigate } from "react-router-dom";
import useClimateStore, { CLIMATE_VARIABLES } from "../../store/useClimateStore";
import useGameStore from "../../store/useGameStore";
import { energyStateOf } from "../../utils/physicsEngine.js";
import "./ReportPage.css";

// gameOverReason별 결과 배너. 성공 조건은 오직 "planet_stabilized"(Earth-like
// Stable 도달) 하나뿐이다 - Warm/Cold Stable, Energy Surplus/Deficit는 클리어가 아니다.
const RESULT_BANNER_BY_REASON = {
  planet_stabilized: {
    title: "🎉 미션 성공 - 행성 평형 안정 도달",
    detail: "최종 확인 결과 행성이 지구형 안정(Earth-like Stable) 상태에 도달해 게임을 성공적으로 마쳤습니다.",
  },
  life_over: {
    title: "💔 미션 실패 - 목숨 소진",
    detail: "오답이 3회 누적되어 행성을 안정시키지 못한 채 게임이 종료됐습니다.",
  },
};

function ReportPage() {
  const navigate = useNavigate();
  const values = useClimateStore((state) => state.values);
  const resetClimate = useClimateStore((state) => state.resetClimate);
  // 게임 중 아이템 사용/최종 확인으로 재계산된 최신 Physics 결과(useGameStore)를
  // 보여준다 - 슬라이더+현재 온도에서 다시 파생시키면 useGameStore가 settle해 둔
  // currentTemperature를 useClimateStore에서 그대로 다시 읽어야 해서 같은 값이긴
  // 하지만, 스냅샷을 한 곳(useGameStore)에서만 관리하는 게 더 단순하다.
  const physicsResult = useGameStore((state) => state.physicsResult);
  const gameOverReason = useGameStore((state) => state.gameOverReason);
  // GamePage가 REPORT로 넘어가는 순간부터 더 이상 늘리지 않으므로 그 값 그대로
  // "총 걸린 시간"이 된다.
  const elapsedSeconds = useGameStore((state) => state.elapsedSeconds);
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
        <p>⏱️ 총 걸린 시간: {elapsedSeconds}초</p>

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
