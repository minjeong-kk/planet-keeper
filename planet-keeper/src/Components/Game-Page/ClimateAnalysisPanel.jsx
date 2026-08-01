import { energyStateOf } from "../../utils/physicsEngine.js";

// ANALYZE/STABLE 단계가 공유하는 Physics + ML 결과 표시 패널.
// 두 단계 모두 "현재 행성 상태를 확인하고 다음으로 넘어간다"는 동작만 다르고
// 보여줄 내용은 같아서 컴포넌트를 공유한다.
function ClimateAnalysisPanel({ title, physicsResult, climateState, nextLabel, onNext }) {
  const energyState = physicsResult ? energyStateOf(physicsResult.deltaEnergy) : null;
  const ready = Boolean(physicsResult && climateState);

  return (
    <div className="game-page__modal">
      <h3>{title}</h3>
      <p>기후 상태: {energyState ?? "계산 중..."}</p>
      {energyState === "Stable" && (
        <p>세부 상태: {climateState ? climateState.label : "계산 중..."}</p>
      )}
      <button className="btn-primary" onClick={onNext} disabled={!ready}>
        {nextLabel}
      </button>
    </div>
  );
}

export default ClimateAnalysisPanel;
