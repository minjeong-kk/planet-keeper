import { createPortal } from "react-dom";
import { formatSigned } from "../../utils/planetAnalysis.js";
import { ENERGY_BALANCE_EPSILON } from "../../utils/physicsEngine.js";

// 1단계(에너지 평형 만들기)를 통과한 순간 한 번 뜨는 단계 전환 모달.
//
// 두 단계의 목표가 다르다는 걸 여기서 못 박는다 - 1단계는 "흡수·방출 에너지의
// 균형", 2단계는 "지구와 유사한 목표 온도". 온도 게이지도 이 시점부터 바뀌므로
// (1단계에서는 지구형 안정 구간을 감춘다) 그 전환을 설명해 주는 자리다.
//
// 이 모달이 떠 있는 동안 GamePage는 타이머를 멈춘다(읽는 사이 이상기후 방지).
function StageClearModal({ physicsResult, onStart }) {
  return createPortal(
    <div className="stage-clear-overlay">
      <div className="stage-clear" role="dialog" aria-label="에너지 평형 달성">
        <span className="stage-clear__badge">✅ 에너지 평형 달성</span>

        <p className="stage-clear__lead">
          행성이 흡수하는 에너지와 방출하는 에너지가 안정적인 범위에 들어왔습니다.
        </p>

        <div className="stage-clear__numbers">
          <div>
            <span>에너지 불균형</span>
            <strong>{formatSigned(physicsResult.deltaEnergy)} W/m²</strong>
          </div>
          <div>
            <span>평형 기준</span>
            <strong>±{ENERGY_BALANCE_EPSILON.toFixed(1)} W/m²</strong>
          </div>
        </div>

        <div className="stage-clear__next">
          <p className="stage-clear__next-title">이제 2단계입니다</p>
          <p className="stage-clear__next-body">
            지금부터는 평형 상태를 유지한 채, 행성을 <strong>지구와 유사한 목표 온도 범위</strong>에
            맞춰봅니다. 문제를 맞히면 그 방향으로 조성이 조정됩니다.
          </p>
          <p className="stage-clear__note">
            🔒 2단계에서는 기후 제어 장비를 사용할 수 없습니다(보유 장비는 그대로 남습니다).
          </p>
        </div>

        <button type="button" className="stage-clear__cta" onClick={onStart}>
          2단계 시작
        </button>
      </div>
    </div>,
    document.body,
  );
}

export default StageClearModal;
