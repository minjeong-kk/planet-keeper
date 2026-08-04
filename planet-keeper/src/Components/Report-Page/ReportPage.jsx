import { useMemo } from "react";
import { useNavigate } from "react-router-dom";
import useClimateStore, { CLIMATE_VARIABLES } from "../../store/useClimateStore";
import {
  computeClimateV2,
  mapSlidersToClimateInputs,
  energyStateOf,
} from "../../utils/physicsEngine.js";
import "./ReportPage.css";

function ReportPage() {
  const navigate = useNavigate();
  const values = useClimateStore((state) => state.values);
  const currentTemperature = useClimateStore((state) => state.currentTemperature);
  const resetClimate = useClimateStore((state) => state.resetClimate);

  // GamePage와 동일하게 (슬라이더 + 현재 온도)에서 직접 파생시킨다.
  const physicsResult = useMemo(
    () =>
      computeClimateV2({
        ...mapSlidersToClimateInputs(values),
        currentTemperature,
      }),
    [values, currentTemperature],
  );

  const handleRestart = () => {
    resetClimate();
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
