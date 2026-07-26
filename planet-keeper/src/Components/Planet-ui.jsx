import { Suspense, useEffect } from 'react'
import * as THREE from 'three'
import { Canvas, invalidate } from '@react-three/fiber'
import { OrbitControls, useTexture } from '@react-three/drei'
import './Planet-ui.css'

/*
 * ─────────────────────────────────────────────────────────────
 *  Texture Source (저작권 출처)
 *  Earth day map: Solar System Scope (2k_earth_daymap.jpg), CC BY 4.0
 *  https://www.solarsystemscope.com/textures/
 *  → 프로젝트 내부(public/assets/earth.jpg)에 로컬 저장하여 외부 URL/CORS 의존 제거.
 *  → CC BY 4.0 출처표기는 README 에 명시함.
 *  대기 글로우는 공개된 Three.js 프레넬 셰이더 "기법"으로 저작 에셋이 아님.
 * ─────────────────────────────────────────────────────────────
 */
// public/ 폴더는 Vite 가 루트(/)로 서빙하므로 same-origin → CORS 문제 없음
const PLANET_TEXTURE_URL = '/assets/earth.jpg'

/* ── 대기 글로우: 프레넬 셰이더(외곽 림에서 푸른빛이 은은하게 번짐) ── */
const atmosphereVertex = /* glsl */ `
  varying vec3 vNormal;
  void main() {
    vNormal = normalize(normalMatrix * normal);
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`
const atmosphereFragment = /* glsl */ `
  varying vec3 vNormal;
  void main() {
    // 시선(view-space +z)과 법선의 각도가 클수록(가장자리) 밝게 → 림 글로우
    float intensity = pow(0.62 - dot(vNormal, vec3(0.0, 0.0, 1.0)), 2.4);
    gl_FragColor = vec4(0.3, 0.6, 1.0, 1.0) * intensity;
  }
`

/* ── 가상/외계 행성: 단일 mesh + 고화질 행성 텍스처 ── */
function Planet() {
  const map = useTexture(PLANET_TEXTURE_URL)
  map.colorSpace = THREE.SRGBColorSpace
  map.anisotropy = 8

  // demand 모드: 텍스처 로드가 끝난 시점에 한 번 렌더를 트리거해 지구를 표시
  useEffect(() => {
    invalidate()
  }, [map])

  return (
    <mesh>
      <sphereGeometry args={[1.5, 64, 64]} />
      <meshStandardMaterial map={map} roughness={1} metalness={0} />
    </mesh>
  )
}

/* ── 외곽 대기 아우라 ── */
function Atmosphere() {
  return (
    <mesh scale={1.18}>
      <sphereGeometry args={[1.5, 64, 64]} />
      <shaderMaterial
        vertexShader={atmosphereVertex}
        fragmentShader={atmosphereFragment}
        side={THREE.BackSide}
        blending={THREE.AdditiveBlending}
        transparent
        depthWrite={false}
      />
    </mesh>
  )
}

function PlanetUI() {
  return (
    <div className="planet-viewport">
      <Canvas
        camera={{ position: [0, 0, 5], fov: 45 }}
        // demand: invalidate() 호출 시에만 렌더 → 유휴 시 프레임 0 (캡처 렉 없음)
        frameloop="demand"
        dpr={[1, 1.5]}
        gl={{ alpha: true, antialias: true, powerPreference: 'high-performance' }}
      >
        {/* 환경광을 올려 밤 영역 지형도 은은하게 보이도록 + 방향광으로 낮/밤 경계 입체감 유지 */}
        <ambientLight intensity={0.45} />
        <directionalLight position={[5, 2, 5]} intensity={2.2} />

        <Atmosphere />
        <Suspense fallback={null}>
          <Planet />
        </Suspense>

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
