import { BrowserRouter as Router, Route, Routes, Navigate } from 'react-router-dom';

import StartPage from "./components/start-page/StartPage";
import PlanetCreatePage from "./components/planet-create-page/PlanetCreatePage";
import GamePage from "./components/game-page/GamePage";
import ReportPage from "./components/report-page/ReportPage";

function App() {
  return (
    <Router>
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
