import { useNavigate } from "react-router-dom";
import { ArrowRight } from "lucide-react";
import MascotGuide from "./MascotGuide";
import InfoSection from "./InfoSection";
import useGameStore from "../../store/useGameStore";
import "./StartPage.css";

function StartPage() {
  const navigate = useNavigate();
  // 게임 단계(Step) 전환: resetGame() 이 currentStage 를 GAME_STAGES.CREATOR 로
  // 되돌리면서 이전 플레이의 문제/아이템/목숨/판정 결과까지 함께 초기화한다
  // (리포트에서 시작 화면으로 돌아온 경우에도 깨끗한 상태로 진입).
  const resetGame = useGameStore((state) => state.resetGame);

  const handleStart = () => {
    resetGame();
    navigate("/planet-create");
  };

  return (
    <div className="start-page">
      {/* 장식 레이어(궤도 라인 · 우주 입자 · 홀로그램 그리드).
          페이지 배경 자체는 칠하지 않으므로 나중에 배경 작업이 들어오면
          이 레이어 위/아래로 그대로 얹을 수 있다. */}
      <div className="start-page__backdrop" aria-hidden="true">
        <span className="start-page__grid" />
        <span className="start-page__dust start-page__dust--far" />
        <span className="start-page__dust start-page__dust--near" />
        <span className="start-page__orbit start-page__orbit--outer" />
        <span className="start-page__orbit start-page__orbit--mid" />
        <span className="start-page__orbit start-page__orbit--inner" />
      </div>

      {/* 좌측: 타이틀 + 메뉴 버튼 2개 + 시작 CTA */}
      <div className="start-page__side">
        <div className="start-page__intro">
          <span className="start-page__eyebrow">CLIMATE SIMULATION · ENERGY BALANCE</span>
          <h1 className="start-page__title">
            PLANET
            <br />
            KEEPER
          </h1>
          <p className="start-page__tagline">
            지구의 온도는 우연이 아니다.
            <br />
            <strong>빙하부터 CO₂까지, 행성의 체온을 직접 설계하라.</strong>
          </p>
        </div>

        <InfoSection />

        <button className="start-page__cta" onClick={handleStart}>
          행성 만들러 가기
          <ArrowRight size={24} className="start-page__cta-arrow" />
        </button>
      </div>

      {/* 우측: 기상이 + 말풍선 */}
      <MascotGuide />
    </div>
  );
}

export default StartPage;
