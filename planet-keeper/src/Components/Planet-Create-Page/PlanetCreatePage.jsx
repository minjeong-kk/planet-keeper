import { useState } from "react";
import { useNavigate } from "react-router-dom";
import PlanetUI from "../Planet-ui.jsx";
import "./PlanetCreatePage.css";

const VARIABLES = [
  { key: "iceThickness", label: "빙하 두께" },
  { key: "ocean", label: "바다" },
  { key: "cloud", label: "구름 양" },
  { key: "atmThickness", label: "대기 두께" },
  { key: "co2", label: "CO2" },
];

function PlanetCreatePage() {
  const navigate = useNavigate();
  const [values, setValues] = useState(
    Object.fromEntries(VARIABLES.map((v) => [v.key, 50]))
  );

  const handleChange = (key, value) => {
    setValues((prev) => ({ ...prev, [key]: value }));
  };

  return (
    <>
      <div className="planet-create-page">
        <div className="planet-create-page__planet">
          <div className="planet-create-page__planet-placeholder">
            <PlanetUI />
          </div>
        </div>

        <div className="planet-create-page__controls">
          <p>변수 조작은 드래그 형식</p>

          {VARIABLES.map((v) => (
            <div className="planet-create-page__control" key={v.key}>
              <label htmlFor={v.key}>{v.label}</label>
              <input
                id={v.key}
                type="range"
                min={0}
                max={100}
                value={values[v.key]}
                onChange={(e) => handleChange(v.key, Number(e.target.value))}
              />
            </div>
          ))}
        </div>
      </div>

      <div className="planet-create-page__actions">
        <button onClick={() => navigate("/")}>맨 처음 페이지로 가기</button>
        <button className="btn-primary" onClick={() => navigate("/game")}>행성 만들기 완료</button>
      </div>
    </>
  );
}

export default PlanetCreatePage;
