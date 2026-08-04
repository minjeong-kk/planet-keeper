import { useEffect } from "react";
import { BrowserRouter as Router, Route, Routes, Navigate, useLocation } from 'react-router-dom';

import StartPage from "./Components/Start-Page/StartPage";
import PlanetCreatePage from "./Components/Planet-Create-Page/PlanetCreatePage";
import GamePage from "./Components/Game-Page/GamePage";
import ReportPage from "./Components/Report-Page/ReportPage";

// SPA 라우팅은 페이지를 옮겨도 브라우저 스크롤 위치를 그대로 들고 간다 - 예를 들어
// ReportPage 아래쪽 재시작 버튼을 누르면 스크롤이 내려간 채로 PlanetCreatePage/
// GamePage로 이동해서, 그 페이지의 내용이 화면 위쪽 보이지 않는 영역에 렌더링된
// 것처럼(사실상 "화면이 안 보임") 보인다. 경로가 바뀔 때마다 맨 위로 되돌린다.
function ScrollToTop() {
  const { pathname } = useLocation();
  useEffect(() => {
    window.scrollTo(0, 0);
  }, [pathname]);
  return null;
}

function App() {
  return (
    <Router>
      <ScrollToTop />
      <Routes>
        <Route path="/" element={<StartPage />} />
        <Route path="/planet-create" element={<PlanetCreatePage />} />
        <Route path="/game" element={<GamePage />} />
        <Route path="/report" element={<ReportPage />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </Router>
  )
}

export default App