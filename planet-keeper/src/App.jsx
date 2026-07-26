import PlanetUI from './Components/Planet-ui.jsx'

function App() {
  return (
    // TODO: 우측 슬라이더 패널 이슈 병합 시 좌/우 분할 레이아웃으로 교체
    // width/height 100% → #root(=100%)를 그대로 채워 좌측 정렬, 스크롤바 없음
    <div style={{ width: '100%', height: '100%', border: 'none', outline: 'none' }}>
      <PlanetUI />
    </div>
  )
}

export default App
