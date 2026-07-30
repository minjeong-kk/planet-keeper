import { BrowserRouter as Router, Route, Routes, Navigate } from 'react-router-dom';

import StartPage from "./Components/Start-Page/StartPage";
import PlanetCreatePage from "./Components/Planet-Create-Page/PlanetCreatePage";
import GamePage from "./Components/Game-Page/GamePage";
import ReportPage from "./Components/Report-Page/ReportPage";

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
