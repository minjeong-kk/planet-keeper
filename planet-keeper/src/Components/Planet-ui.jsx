import { Canvas } from '@react-three/fiber'
import { OrbitControls, Sphere } from '@react-three/drei'
import './Planet-ui.css'

/**
 * 재사용 가능한 독립형 3D 행성 뷰어.
 *
 * - 배경/크기를 스스로 고정하지 않는다. 항상 부모 div 의 크기(100%)를 따르고
 *   배경은 투명(alpha)하므로, 어느 페이지에 넣어도 부모 레이아웃에 녹아든다.
 * - frameloop="demand" 로 동작한다: 상호작용이 있을 때만 다시 렌더링하여
 *   GPU/CPU 를 놀릴 때는 전혀 점유하지 않는다(윈도우 캡처 렉 방지).
 */
function Planet() {
  return (
    // args={[반지름, 가로 세그먼트, 세로 세그먼트]} — 세그먼트가 높을수록 표면이 매끄럽다.
    <Sphere args={[1.5, 64, 64]}>
      {/*
        기본 질감. 추후 이슈에서 실제 텍스처를 입힐 자리:
        const tex = useTexture('/textures/earth.jpg')
        <meshStandardMaterial map={tex} ... />
      */}
      <meshStandardMaterial color="#4a90d9" roughness={0.7} metalness={0.1} />
    </Sphere>
  )
}

function PlanetUI() {
  return (
    <div className="planet-viewport">
      <Canvas
        camera={{ position: [0, 0, 5], fov: 45 }}
        // demand: invalidate() 가 호출될 때만 렌더 → 유휴 시 프레임 0
        frameloop="demand"
        // 픽셀 밀도 상한을 1.5 로 제한해 고해상도 화면에서의 과도한 렌더 부담 완화
        dpr={[1, 1.5]}
        // alpha: 배경 투명 처리 → 부모 배경이 그대로 비쳐 보인다
        gl={{ alpha: true, antialias: true, powerPreference: 'high-performance' }}
      >
        {/* 전역적으로 은은하게 깔리는 빛 — 그림자 영역이 완전히 검게 죽지 않도록 함 */}
        <ambientLight intensity={0.6} />
        {/* 특정 방향에서 들어오는 주광 — 구체에 명암을 만들어 입체감을 살림 */}
        <directionalLight position={[5, 5, 5]} intensity={1.2} />

        <Planet />

        {/*
          makeDefault: drei 가 이 컨트롤을 기본으로 등록하면서 'change' 이벤트마다
          invalidate() 를 자동 호출한다. 덕분에 demand 모드에서도 드래그/감쇠 중에만
          프레임이 발생하고, 멈추면 렌더 루프가 스스로 정지한다.
          enableDamping: 관성 회전. 감쇠가 끝날 때까지 내부 useFrame 이
          controls.update() 를 돌려 프레임을 이어주므로 demand 모드와 문제없이 연동된다.
        */}
        <OrbitControls
          makeDefault
          enableDamping
          dampingFactor={0.08}
          enablePan={false}
          enableZoom={false}
          minPolarAngle={0}
          maxPolarAngle={Math.PI}
        />
      </Canvas>
    </div>
  )
}

export default PlanetUI
