import { useNavigate } from "react-router-dom";
import { ArrowRight, Moon, Sun } from "lucide-react";
import MascotGuide from "./MascotGuide";
import InfoSection from "./InfoSection";
import useGameStore from "../../store/useGameStore";
import useClimateStore from "../../store/useClimateStore";
import useTheme from "../common/useTheme.js";
import "./StartPage.css";

function StartPage() {
  const navigate = useNavigate();
  // 테마는 기본적으로 OS 설정을 따르고, 아래 버튼으로 한 번 고르면 그 선택이 남는다.
  const { theme, toggle } = useTheme();
  // 게임 단계(Step) 전환: resetGame() 이 currentStage 를 GAME_STAGES.CREATOR 로
  // 되돌리면서 이전 플레이의 문제/아이템/목숨/판정 결과까지 함께 초기화한다
  // (리포트에서 시작 화면으로 돌아온 경우에도 깨끗한 상태로 진입).
  const resetGame = useGameStore((state) => state.resetGame);
  // 행성 조성(슬라이더)과 현재 온도도 같이 초기화한다. 이 둘은 useClimateStore가
  // localStorage에 persist하는데, 예전에는 여기서 되돌리지 않아 이전 판의 마지막
  // 상태를 그대로 물려받았다 - 2단계 마지막 정답(finalizeGame의 forceStable)이
  // CO2를 "288.15K에서 평형"이 되도록 강제 조정하고 그 평형온도(≈287.9~288.4K)를
  // currentTemperature에 저장하기 때문에, 새 게임이 시작부터 ΔE≈0 / 지구형 안정으로
  // 떠서 1단계와 아이템 단계를 통째로 건너뛰는 문제가 있었다.
  const resetClimate = useClimateStore((state) => state.resetClimate);
  // 시작 페이지를 거쳐 들어오는 건 항상 새 게임이므로 두 화면(행성 생성 / 플레이)
  // 온보딩을 모두 예약한다 - 리포트의 "행성 다시 만들기"/"다시 플레이"로 이어서 하는
  // 경우에는 그쪽에서 끈다.
  const queueTutorials = useGameStore((state) => state.queueTutorials);

  const handleStart = () => {
    resetGame();
    resetClimate();
    queueTutorials();
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

      {/* 우측: 타이틀 + 메뉴 버튼 2개 + 시작 CTA */}
      <div className="start-page__side">
        <div className="start-page__intro">
          <span className="start-page__eyebrow">CLIMATE SIMULATION · ENERGY BALANCE</span>
          <h1 className="start-page__title">
            PLANET
            <br />
            KEEPER
          </h1>
          {/* 쉼표 뒤에서 항상 줄을 나눈다. 앞 구절은 한 줄에 묶고, 뒷 구절은
              좁은 화면에서만 어절 경계에서 한 번 더 넘어가게 열어 둔다. */}
          <p className="start-page__tagline">
            <span className="start-page__nowrap">기후의 법칙을 배우고,</span>
            <br />
            하나뿐인 행성의 운명을 조율하라.
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

      {/* 우측 아래 테마 스위치 - 지금 테마의 반대 아이콘을 보여준다(누르면 그렇게
          바뀐다는 뜻). 관제 콘솔 톤을 그대로 쓰고 배경 장식 위에 얹는다. */}
      <button
        type="button"
        className="start-page__theme"
        onClick={toggle}
        aria-label={theme === "dark" ? "라이트 모드로 바꾸기" : "다크 모드로 바꾸기"}
        title={theme === "dark" ? "라이트 모드" : "다크 모드"}
      >
        <span className="start-page__theme-icon" aria-hidden="true">
          {theme === "dark" ? <Sun size={18} /> : <Moon size={18} />}
        </span>
        <span className="start-page__theme-text">{theme === "dark" ? "LIGHT" : "DARK"}</span>
      </button>
    </div>
  );
}

export default StartPage;
