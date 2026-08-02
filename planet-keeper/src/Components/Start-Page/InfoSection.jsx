import { useState } from "react";

const MODAL_CONTENT = {
  heatBalance: {
    title: "열수지 개념",
    body:
      "임시",
  },
  albedo: {
    title: "알베도, 흡수, 반사 공식",
    body:
      "임시",
  },
  goal: {
    title: "학습목표 & 게임 흐름",
    body:
      "이 게임은 열수지·알베도·온실효과 공식을 직접 조작해보며 '행성이 평형에 도달한다는 것'과 " +
      "'평형이어도 온도가 지구형 범위 밖일 수 있다는 것'을 구분해서 이해하는 것이 목표입니다. " +
      "흐름: ① 슬라이더(빙하/바다/구름/대기두께/CO2)로 행성을 만들면 Physics+AI가 지금 조성의 에너지 " +
      "상태를 바로 판정합니다(우연히 이미 지구형 평형이면 바로 성공). ② 1단계 문제(공식 계산·상태 " +
      "판정)를 풀고 ③ 아이템으로 조성을 실제로 바꾼 뒤, 그 조성이 평형에 도달하면 몇 도가 되는지 " +
      "(Cold/Earth-like/Warm Stable 중 하나)를 AI가 판정합니다. ④ 2단계 문제를 풀면 그 판정을 확인하는데, " +
      "아직 지구형 범위 밖이면 CO2를 부족한 방향으로 조정해 다시 시도합니다(목숨 3개, 3번째 시도부터는 " +
      "정확히 평형을 맞춰 마무리). 목숨을 다 잃으면 게임오버로, 성공하거나 게임오버가 되면 기후 리포트로 " +
      "이동해 최종 결과를 확인합니다.",
  },
};

function InfoSection() {
  const [activeModal, setActiveModal] = useState(null);

  return (
    <div className="start-page__info">
      <div className="start-page__box">
        <p>열수지 개념</p>
        <button onClick={() => setActiveModal("heatBalance")}>자세한 설명 보기</button>
      </div>

      <div className="start-page__box">
        <p>알베도, 흡수, 반사 공식</p>
        <button onClick={() => setActiveModal("albedo")}>자세한 설명 보기</button>
      </div>

      <div className="start-page__box">
        <p>이게 무엇을 위한 게임인지 (학습목표)</p>
        <button onClick={() => setActiveModal("goal")}>자세한 설명 보기</button>
      </div>

      {activeModal && (
        <div className="start-page__modal-overlay" onClick={() => setActiveModal(null)}>
          <div className="start-page__modal" onClick={(e) => e.stopPropagation()}>
            <p>{MODAL_CONTENT[activeModal].title}</p>
            <p>{MODAL_CONTENT[activeModal].body}</p>
            <button onClick={() => setActiveModal(null)}>닫기</button>
          </div>
        </div>
      )}
    </div>
  );
}

export default InfoSection;
