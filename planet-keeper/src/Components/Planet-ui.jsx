import { Component, Suspense, useEffect, useMemo, useRef } from 'react'
import * as THREE from 'three'
import { Canvas, invalidate, useFrame } from '@react-three/fiber'
import { OrbitControls, useTexture } from '@react-three/drei'
import './Planet-ui.css'

/*
 * ─────────────────────────────────────────────────────────────
 *  Texture Sources (저작권 출처 — 모두 로컬 번들, 외부 URL/CORS 없음)
 *   - earth.jpg        : Solar System Scope "Earth Day Map"  (CC BY 4.0)
 *   - earth-clouds.jpg : Solar System Scope "Earth Clouds"   (CC BY 4.0)
 *   - earth-height.jpg : NASA Visible Earth 기반 고도(elevation) 맵
 *                        (turban/webgl-earth, MIT / 원본 NASA Public Domain)
 *  프레넬 대기 글로우는 공개 Three.js 기법으로 저작 에셋이 아님.
 * ─────────────────────────────────────────────────────────────
 *
 *  구조: "본체 셰이더 1개 + 구름 셸 1개 + 대기 프레넬 링 1개".
 *    · 본체 셰이더가 컬러맵 + 하이트맵으로 바다 침수를 직접 마스킹.
 *    · 대기/CO₂ 는 외곽 프레넬 글로우 링으로만 표현.
 */

const DAY_URL = '/assets/earth.jpg'
const CLOUD_URL = '/assets/earth-clouds.jpg'
const HEIGHT_URL = '/assets/earth-height.jpg'
const R = 1.5 // 행성 기준 반지름
const LIGHT_DIR = new THREE.Vector3(5, 2, 5).normalize()

/* ═══════════════ 본체 셰이더 (컬러 + 고도 기반 바다 + 조명) ═══════════════ */
const planetVertex = /* glsl */ `
  varying vec2 vUv;
  varying vec3 vWorldN;
  varying vec3 vWorldPos;
  void main() {
    vUv = uv;
    vWorldN = normalize(mat3(modelMatrix) * normal);
    vec4 wp = modelMatrix * vec4(position, 1.0);
    vWorldPos = wp.xyz;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`
const planetFragment = /* glsl */ `
  uniform sampler2D uDay;
  uniform sampler2D uHeight;
  uniform float uSeaLevel; // 이 고도 아래는 물에 잠김
  uniform vec3 uLightDir;
  varying vec2 vUv;
  varying vec3 vWorldN;
  varying vec3 vWorldPos;

  void main() {
    vec3 base = texture2D(uDay, vUv).rgb;
    float h = texture2D(uHeight, vUv).r; // 0(해저/저지) ~ 1(고지)

    // ── 바다: 고도가 낮은 곳부터 차례로 침수 ──
    float water = smoothstep(uSeaLevel + 0.02, uSeaLevel - 0.02, h);
    vec3 shallow = vec3(0.10, 0.38, 0.62);
    vec3 deep = vec3(0.02, 0.12, 0.32);
    vec3 waterCol = mix(deep, shallow, smoothstep(0.0, uSeaLevel + 0.05, h));
    vec3 col = mix(base, waterCol, water * 0.92);

    // ── 조명 (ambient + lambert) ──
    vec3 N = normalize(vWorldN);
    vec3 L = normalize(uLightDir);
    float diff = max(dot(N, L), 0.0);
    col *= (0.35 + 0.95 * diff);

    // ── 물 위 스페큘러 글린트 ──
    vec3 V = normalize(cameraPosition - vWorldPos);
    vec3 Hn = normalize(L + V);
    float spec = pow(max(dot(N, Hn), 0.0), 60.0) * water * diff;
    col += spec * 0.5;

    gl_FragColor = vec4(col, 1.0);
  }
`

/* ═══════════════ 대기 프레넬 링 ═══════════════ */
// rim 을 clamp(0,1)로 묶고 color·alpha 를 모두 intensity 로 곱해(premultiplied)
// additive 합성 시 음수/검은 테두리가 생기지 않게 한다.
const glowVertex = /* glsl */ `
  varying vec3 vNormal;
  void main() {
    vNormal = normalize(normalMatrix * normal);
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`
const glowFragment = /* glsl */ `
  uniform vec3 uColor;
  uniform float uStrength;
  varying vec3 vNormal;
  void main() {
    float d = dot(vNormal, vec3(0.0, 0.0, 1.0));
    float rim = clamp(0.75 - d, 0.0, 1.0);
    float intensity = pow(rim, 2.2) * uStrength;
    gl_FragColor = vec4(uColor * intensity, intensity);
  }
`

/* ═══════════════ 컴포넌트 ═══════════════ */

/* 본체: 하이트맵 기반 셰이더 하나로 지형/바다를 표현 */
function PlanetBody({ seaLevel }) {
  const [day, height] = useTexture([DAY_URL, HEIGHT_URL])

  const uniforms = useMemo(
    () => ({
      uDay: { value: day },
      uHeight: { value: height },
      uSeaLevel: { value: seaLevel },
      uLightDir: { value: LIGHT_DIR },
    }),
    [], // eslint-disable-line react-hooks/exhaustive-deps
  )

  useMemo(() => {
    day.colorSpace = THREE.SRGBColorSpace
    day.anisotropy = 8
    height.anisotropy = 4
  }, [day, height])

  useEffect(() => {
    uniforms.uDay.value = day
    uniforms.uHeight.value = height
    uniforms.uSeaLevel.value = seaLevel
    invalidate()
  }, [day, height, seaLevel, uniforms])

  return (
    <mesh>
      <sphereGeometry args={[R, 128, 128]} />
      <shaderMaterial
        vertexShader={planetVertex}
        fragmentShader={planetFragment}
        uniforms={uniforms}
      />
    </mesh>
  )
}

/* 텍스처 로딩/실패 시 안전 폴백 (basic material) */
function BasicPlanet({ color = '#2a3a5a' }) {
  useEffect(() => {
    invalidate()
  }, [color])
  return (
    <mesh>
      <sphereGeometry args={[R, 48, 48]} />
      <meshStandardMaterial color={color} roughness={1} />
    </mesh>
  )
}

/* 구름: 부드럽게 떠서 자전하는 반투명 셸 1개 */
function Clouds({ ratio }) {
  const map = useTexture(CLOUD_URL)
  const ref = useRef()
  useFrame((_, dt) => {
    if (ref.current) {
      ref.current.rotation.y += dt * 0.015 // 본체와 독립된 느린 자전
      invalidate()
    }
  })
  return (
    <mesh ref={ref} scale={1.015}>
      <sphereGeometry args={[R, 64, 64]} />
      <meshStandardMaterial
        color="#ffffff"
        alphaMap={map}
        transparent
        opacity={Math.min(1, Math.max(0, ratio)) * 0.85}
        depthWrite={false}
        roughness={1}
      />
    </mesh>
  )
}

/* 외곽 대기 프레넬 링 (CO₂ 상승 시 색이 붉게 데워짐) */
function AtmosphereRing({ scale, co2Level }) {
  const color = useMemo(() => {
    const c = new THREE.Color('#4d99ff')
    c.lerp(new THREE.Color('#ff6a3a'), Math.min(1, Math.max(0, co2Level)) * 0.85)
    return c
  }, [co2Level])
  const uniforms = useMemo(
    () => ({ uColor: { value: color.clone() }, uStrength: { value: 1 } }),
    [], // eslint-disable-line react-hooks/exhaustive-deps
  )
  useEffect(() => {
    uniforms.uColor.value.copy(color)
    uniforms.uStrength.value = 0.9 + co2Level * 0.5
    invalidate()
  }, [color, co2Level, scale, uniforms])

  return (
    <mesh scale={scale}>
      <sphereGeometry args={[R, 64, 64]} />
      <shaderMaterial
        vertexShader={glowVertex}
        fragmentShader={glowFragment}
        uniforms={uniforms}
        side={THREE.BackSide}
        blending={THREE.AdditiveBlending}
        transparent
        depthWrite={false}
      />
    </mesh>
  )
}

/* 텍스처 로드 실패 시 Canvas 전체가 깨지지 않도록 방어 (에러 바운더리는 클래스 필수) */
class TextureErrorBoundary extends Component {
  constructor(props) {
    super(props)
    this.state = { hasError: false }
  }
  static getDerivedStateFromError() {
    return { hasError: true }
  }
  componentDidCatch(error) {
    console.error('[PlanetUI] 텍스처 로드 실패 → 기본 재질로 폴백:', error)
  }
  render() {
    return this.state.hasError ? this.props.fallback : this.props.children
  }
}

/**
 * 재사용 3D 행성 뷰어.
 * 슬라이더 상위 state 를 하이트맵 셰이더 uniform 과 프레넬 링에 실시간 반영한다.
 * 모든 prop 은 기본값이 있어 <PlanetUI /> 무-props 로도 동작한다.
 */
function PlanetUI({
  oceanRatio = 0,
  cloudRatio = 0,
  co2Level = 0,
  atmosphereScale = 1.18,
}) {
  // 바다 슬라이더 → 해수면(고도 임계). 0.03(자연 해안) ~ 1.03(전면 침수/워터월드)
  const seaLevel = 0.03 + Math.min(1, Math.max(0, oceanRatio)) * 1.0
  const showClouds = cloudRatio > 0.001

  return (
    <div className="planet-viewport">
      <Canvas
        camera={{ position: [0, 0, 5], fov: 45 }}
        frameloop="demand" // 유휴 0프레임 (구름이 있을 때만 애니메이션 렌더)
        dpr={[1, 1.5]}
        gl={{ alpha: true, antialias: true, powerPreference: 'high-performance' }}
      >
        <ambientLight intensity={0.4} />
        <directionalLight position={[5, 2, 5]} intensity={1.5} />

        <TextureErrorBoundary fallback={<BasicPlanet />}>
          <Suspense fallback={<BasicPlanet color="#22314f" />}>
            <PlanetBody seaLevel={seaLevel} />
            {showClouds && <Clouds ratio={cloudRatio} />}
          </Suspense>
        </TextureErrorBoundary>

        <AtmosphereRing scale={atmosphereScale} co2Level={co2Level} />

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
