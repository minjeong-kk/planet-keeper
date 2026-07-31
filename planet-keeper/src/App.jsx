import { BrowserRouter as Router, Route, Routes, Navigate } from 'react-router-dom';

import { ClimateProvider } from "./store/ClimateContext.jsx";
import StartPage from "./Components/Start-Page/StartPage";
import PlanetCreatePage from "./Components/Planet-Create-Page/PlanetCreatePage";
import GamePage from "./Components/Game-Page/GamePage";
import ReportPage from "./Components/Report-Page/ReportPage";

function App() {
  return (
    <Router>
      {/* 제작한 행성 상태(슬라이더 값)를 페이지 간에 공유 */}
      <ClimateProvider>
        <Routes>
          <Route path="/" element={<StartPage />} />
          <Route path="/planet-create" element={<PlanetCreatePage />} />
          <Route path="/game" element={<GamePage />} />
          <Route path="/report" element={<ReportPage />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </ClimateProvider>
    </Router>
  )
}

export default App
