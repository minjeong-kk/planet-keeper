import { Component, Suspense, memo, useEffect, useMemo, useRef } from 'react'
import * as THREE from 'three'
import { Canvas, invalidate, useFrame, useThree } from '@react-three/fiber'
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
// 카메라([0,0,5]) 쪽으로 치우친 광원 → 보이는 반구의 60~65%가 낮 영역이 되도록
const LIGHT_DIR = new THREE.Vector3(2, 1.2, 4).normalize()

// ── 순수 헬퍼/상수 (모듈 스코프 → 렌더마다 재생성 방지) ──
const clamp01 = (v) => Math.min(1, Math.max(0, v))

// 바다 슬라이더 → 해수면. 3구간 Piecewise 선형 (중반 완만 → 50%=절반).
const oceanToSeaLevel = (o) => {
  if (o <= 0.2) return o * 0.65 // [0~20%] 1%부터 해구 차오름
  if (o <= 0.6) return 0.13 + (o - 0.2) * 0.25 // [20~60%] 완만 (50% → 0.205)
  return 0.23 + (o - 0.6) * 0.85 // [60~100%] 고지대→최고봉 제외 완전 침수
}

// 대기 팔레트 (1회만 생성, AtmosphereRing 이 재사용해 GC 압박 제거)
const ATM_BLUE = new THREE.Color('#5aa0ff')
const ATM_VIOLET = new THREE.Color('#9b6cff')
const ATM_RED = new THREE.Color('#ff6b7d')

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
  uniform float uIce;      // 0(빙하 없음) ~ 1(스노우볼)
  uniform float uOcean;    // oceanRatio(0~1): 대륙 초록 생명력 연동용
  uniform vec3 uLightDir;
  varying vec2 vUv;
  varying vec3 vWorldN;
  varying vec3 vWorldPos;

  // ── 값 노이즈 (빙하 경계 이음새 + 얼음 질감용) ──
  float hash(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453123); }
  float noise(vec2 p){
    vec2 i = floor(p), f = fract(p);
    float a = hash(i), b = hash(i + vec2(1.0, 0.0));
    float c = hash(i + vec2(0.0, 1.0)), d = hash(i + vec2(1.0, 1.0));
    vec2 u = f * f * (3.0 - 2.0 * f);
    return mix(mix(a, b, u.x), mix(c, d, u.x), u.y);
  }
  float fbm(vec2 p){
    return 0.5 * noise(p) + 0.25 * noise(p * 2.03) + 0.125 * noise(p * 4.01);
  }

  void main() {
    vec3 base = texture2D(uDay, vUv).rgb;
    float h = texture2D(uHeight, vUv).r; // 0(해저/저지) ~ 1(고지)

    // ── Dry Earth Base: 마른 흙 2톤 그라디언트 (파란 바다 RGB 완전 차단) ──
    vec3 dryLow  = vec3(0.722, 0.624, 0.502); // #b89f80 저지대(밝은 마른 흙)
    vec3 dryHigh = vec3(0.541, 0.435, 0.322); // #8a6f52 고지대(짙은 흙)
    vec3 dryCol = mix(dryLow, dryHigh, smoothstep(0.0, 0.5, h));
    float dryTex = fbm(vUv * 90.0);
    dryCol *= (0.85 + dryTex * 0.30); // 말라붙은 지표 질감

    // ── 대륙 황폐화: 초록 채도를 oceanRatio 에 연동 (0=메마른 갈색, ↑=생명력 회복) ──
    // (파란 바다 감지는 '원본' base 로 먼저 계산한 뒤 육지 색만 황폐화한다.)
    float lum = dot(base, vec3(0.299, 0.587, 0.114));
    vec3 barren = mix(vec3(lum), base, 0.25) * vec3(1.10, 0.92, 0.70); // 채도 억제 + 흙빛 틴트
    vec3 landCol = mix(barren, base, smoothstep(0.0, 0.6, uOcean));     // oceanRatio↑ → 초록 부활

    // 마른 흙 ↔ 육지(황폐화 반영) 텍스처를 '넓은 smoothstep 전이'로 부드럽게 블렌딩
    // → 경계선이 들뜨지 않고 자연스럽게 스며듦. 파란 바다(파랑 우세)는 절대 노출 금지.
    float texOcean = smoothstep(0.0, 0.18, base.b - max(base.r, base.g));
    float lowLand  = 1.0 - smoothstep(0.03, 0.16, h);
    float dryMask  = clamp(max(texOcean, lowLand), 0.0, 1.0);
    vec3 surface = mix(landCol, dryCol, dryMask);

    // ── 바다: 고도가 uSeaLevel '아래'인 곳만 물 (한쪽 방향 smoothstep) ──
    // uSeaLevel=0 이면 h>=0 전체가 물 0 → 0% 에서 물 완전 소멸 (음수 오프셋 불필요).
    float shore = 0.04;
    float water = smoothstep(uSeaLevel, uSeaLevel - shore, h);
    vec3 shallow = vec3(0.10, 0.40, 0.64);
    vec3 deep = vec3(0.02, 0.11, 0.30);
    vec3 waterCol = mix(deep, shallow, smoothstep(0.0, max(uSeaLevel, 0.06), h));
    vec3 col = mix(surface, waterCol, water * 0.92);

    // ── 빙하: 노이즈 이음새 경계 + 푸른빛 얼음 질감 ──
    // vUv.y: 0(남극)~1(북극) → polar = 0(적도)~1(양극)
    float polar = abs(vUv.y - 0.5) * 2.0;
    float edgeN = (fbm(vUv * vec2(18.0, 9.0)) - 0.5) * 0.14; // 경계를 울퉁불퉁하게
    float threshold = 1.15 - uIce * 1.25; // uIce=0 → 얼음 전무, uIce=1 → 스노우볼
    float latIce = smoothstep(threshold - 0.05, threshold + 0.05, polar + edgeN);
    float highIce = smoothstep(0.55, 0.82, h) * smoothstep(0.05, 0.55, uIce);
    float ice = clamp(max(latIce, highIce), 0.0, 1.0);

    // 얼음 색: 푸른빛 감도는 흰색에 미세 질감 노이즈
    float iceTex = fbm(vUv * 60.0);
    vec3 iceCol = mix(vec3(0.78, 0.87, 0.98), vec3(0.95, 0.98, 1.0), iceTex);
    col = mix(col, iceCol, ice);

    // ── 조명 (ambient + lambert). 밤(그림자)도 윤곽이 보이도록 ambient 상향 ──
    vec3 N = normalize(vWorldN);
    vec3 L = normalize(uLightDir);
    float diff = max(dot(N, L), 0.0);
    col *= (0.5 + 0.9 * diff);

    vec3 V = normalize(cameraPosition - vWorldPos);
    vec3 Hn = normalize(L + V);

    // ── 물 스페큘러 글린트 (빙하 영역 제외) ──
    float spec = pow(max(dot(N, Hn), 0.0), 60.0) * water * (1.0 - ice) * diff;
    col += spec * 0.5;

    // ── 얼음 스페큘러: 더 날카롭고 차가운(푸른) 반사광 → 진짜 빙하 질감 ──
    float iceSpec = pow(max(dot(N, Hn), 0.0), 140.0) * ice * diff;
    col += iceSpec * vec3(0.70, 0.85, 1.0) * 0.9;

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

/* 본체: 하이트맵 기반 셰이더 하나로 지형/바다/빙하를 표현.
   memo → seaLevel/ice/oceanRatio 가 안 바뀌면(구름·CO₂ 조작 등) 리렌더 skip. */
const PlanetBody = memo(function PlanetBody({ seaLevel, ice, oceanRatio }) {
  const [day, height] = useTexture([DAY_URL, HEIGHT_URL])
  const matRef = useRef()
  // 이 Canvas 루트에 정확히 바인딩된 invalidate (모듈 전역 invalidate 의 루트 불일치 방지)
  const invalidateThis = useThree((s) => s.invalidate)

  // '단 1개의 고정된' uniforms 객체 (초기값). 이후엔 material 의 실제 uniforms 를 직접 수정.
  const uniforms = useMemo(
    () => ({
      uDay: { value: day },
      uHeight: { value: height },
      uSeaLevel: { value: seaLevel },
      uIce: { value: ice },
      uOcean: { value: oceanRatio },
      uLightDir: { value: LIGHT_DIR },
    }),
    [], // eslint-disable-line react-hooks/exhaustive-deps
  )

  useMemo(() => {
    day.colorSpace = THREE.SRGBColorSpace
    day.anisotropy = 8
    height.anisotropy = 4
  }, [day, height])

  // props 변경 시 '렌더러가 실제로 쓰는 material.uniforms' 를 ref 로 직접 갱신 →
  // uniforms 참조 불일치 원천 차단. 갱신 직후 invalidate() 로 demand 렌더 트리거.
  useEffect(() => {
    const mat = matRef.current
    if (!mat) return
    mat.uniforms.uSeaLevel.value = seaLevel
    mat.uniforms.uIce.value = ice
    mat.uniforms.uOcean.value = oceanRatio
    invalidateThis()
  }, [seaLevel, ice, oceanRatio, invalidateThis])

  return (
    <mesh>
      <sphereGeometry args={[R, 96, 96]} />
      <shaderMaterial
        ref={matRef}
        vertexShader={planetVertex}
        fragmentShader={planetFragment}
        uniforms={uniforms}
      />
    </mesh>
  )
})

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

/* 구름: 부드럽게 떠서 자전하는 반투명 셸 1개.
   memo → ratio 안 바뀌면(바다·빙하·CO₂ 조작) 리렌더 skip. */
const Clouds = memo(function Clouds({ ratio }) {
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
        opacity={clamp01(ratio) * 0.85}
        depthWrite={false}
        roughness={1}
      />
    </mesh>
  )
})

/* 외곽 대기 프레넬 링 (CO₂ 상승: 파랑 → 보라 → 붉은빛, 은은한 글로우).
   memo → scale/co2Level 안 바뀌면 리렌더 skip. 색상은 기존 uColor.value 를 mutate(할당 0). */
const AtmosphereRing = memo(function AtmosphereRing({ scale, co2Level }) {
  const uniforms = useMemo(
    () => ({ uColor: { value: ATM_BLUE.clone() }, uStrength: { value: 0.85 } }),
    [], // eslint-disable-line react-hooks/exhaustive-deps
  )
  useEffect(() => {
    // 3단계 파스텔 그라디언트를 기존 Color 인스턴스에 직접 반영(신규 할당 없음)
    const c = clamp01(co2Level)
    const col = uniforms.uColor.value
    if (c < 0.5) col.copy(ATM_BLUE).lerp(ATM_VIOLET, c / 0.5)
    else col.copy(ATM_VIOLET).lerp(ATM_RED, (c - 0.5) / 0.5)
    uniforms.uStrength.value = 0.72 + co2Level * 0.3 // 은은하게(0.72~1.02)
    invalidate()
  }, [co2Level, scale, uniforms])

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
})

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
  glacierRatio = 0,
  cloudRatio = 0,
  co2Level = 0,
  atmosphereScale = 1.18,
}) {
  // 순수 매핑(clamp01/oceanToSeaLevel)은 모듈 스코프 헬퍼 재사용
  const ocean = clamp01(oceanRatio)
  const seaLevel = oceanToSeaLevel(ocean)
  const ice = clamp01(glacierRatio) // 빙하: 0 없음 ~ 1 스노우볼
  const showClouds = cloudRatio > 0.001

  return (
    <div className="planet-viewport">
      <Canvas
        camera={{ position: [0, 0, 5], fov: 45 }}
        frameloop="demand" // 유휴 시 프레임 0 (GPU 0%). 변경 시 invalidate()로 즉시 렌더
        dpr={[1, 1.5]}
        gl={{ alpha: true, antialias: true, powerPreference: 'high-performance' }}
      >
        <ambientLight intensity={0.65} />
        <directionalLight position={[2, 1.2, 4]} intensity={2.4} />

        <TextureErrorBoundary fallback={<BasicPlanet />}>
          <Suspense fallback={<BasicPlanet color="#22314f" />}>
            <PlanetBody seaLevel={seaLevel} ice={ice} oceanRatio={ocean} />
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

/* ═══════════════ 지점 사진용 작은 3D 액자 (PlanetLocationPicker 미리보기) ═══════════════ */
/* 실제 지리 정보 없이(위경도 반영 없음), 기존 PlanetUI 구체와 같은 느낌으로
   사진 한 장을 구체 표면에 입힌다 - PlanetBody와 같은 조명(ambient+directional)
   구성, 같은 방식의 드래그 회전(OrbitControls)을 그대로 재사용해서 "작은
   지구"처럼 보이게 한다. 텍스처 로드 실패해도 캔버스가 안 깨지도록
   TextureErrorBoundary를 재사용한다. */
const PhotoSphere = memo(function PhotoSphere({ imageUrl }) {
  const map = useTexture(imageUrl)

  useMemo(() => {
    map.colorSpace = THREE.SRGBColorSpace
    map.anisotropy = 8
  }, [map])

  return (
    <mesh>
      <sphereGeometry args={[R, 64, 64]} />
      <meshStandardMaterial map={map} roughness={1} />
    </mesh>
  )
})

/**
 * 지점 선택 미리보기용 - 사진을 구체에 입혀서 기존 3D 지구(PlanetUI)와 같은
 * 조명·드래그 방식으로 보여준다. 실제 지리 정보는 없다(위경도 미반영) - 순수
 * 시각 효과.
 */
export function LocationPhoto3D({ imageUrl }) {
  return (
    <div className="planet-viewport">
      <Canvas
        camera={{ position: [0, 0, 5], fov: 45 }}
        frameloop="demand"
        dpr={[1, 1.5]}
        gl={{ alpha: true, antialias: true, powerPreference: 'high-performance' }}
      >
        <ambientLight intensity={0.65} />
        <directionalLight position={[2, 1.2, 4]} intensity={2.4} />

        <TextureErrorBoundary fallback={<BasicPlanet />}>
          <Suspense fallback={<BasicPlanet color="#22314f" />}>
            <PhotoSphere imageUrl={imageUrl} />
          </Suspense>
        </TextureErrorBoundary>

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
