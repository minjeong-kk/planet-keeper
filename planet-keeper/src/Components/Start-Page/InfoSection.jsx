import { useState } from "react";

const MODAL_CONTENT = {
  heatBalance: {
    title: "열수지 개념",
    body: "열수지 개념 자세한 설명 (내용 준비 중)",
  },
  albedo: {
    title: "알베도, 흡수, 반사 공식",
    body: "알베도/흡수/반사 공식 자세한 설명 (내용 준비 중)",
  },
  goal: {
    title: "학습목표",
    body: "이 게임의 학습목표 자세한 설명 (내용 준비 중)",
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
