import { useNavigate } from "react-router-dom";
import InfoSection from "./InfoSection";
import "./StartPage.css";

function StartPage() {
  const navigate = useNavigate();

  return (
    <div className="start-page">
      <InfoSection />

      <div className="start-page__visual">
        <div className="start-page__planet">기상 이미지</div>

        <button className="start-page__cta" onClick={() => navigate("/planet-create")}>
          행성 만들러 가기
        </button>
      </div>
    </div>
  );
}

export default StartPage;
