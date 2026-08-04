/**
 * climateClassifier.js — 학습된 분류 모델(ONNX)로 행성 상태(state)를 예측한다.
 *
 * 피처 이름·순서는 data-pipeline/ML-Scripts/config.py 의 FEATURES 가 원본이고
 * 여기는 그걸 그대로 따라간다. 어긋나면 에러 없이 조용히 틀린 예측이 나가므로,
 * verify_sync.py 가 양쪽을 대조해 검사한다.
 */

// 'onnxruntime-web'(기본 진입점)은 webgpu(jsep) 백엔드까지 다 포함해 26MB wasm이
// 번들된다. 모델이 가중치 1,413개짜리라 GPU 가속이 무의미하므로 CPU 전용 서브패스로
// import해 webgpu 코드 자체를 번들에서 빼고, wasm(13MB)만 받게 한다.
import * as ort from 'onnxruntime-web/wasm'
import { albedoOf, PLANET_STATES } from './physicsEngine.js'

// 스레드는 꺼둔다(모델이 작아 이득 없고, dev 서버에 COOP/COEP 헤더가 없어
// SharedArrayBuffer를 못 쓰는 환경에서도 그대로 동작하게 하기 위함).
ort.env.wasm.numThreads = 1

const MODEL_URL = '/models/climate_rf.onnx'

// config.py FEATURES와 이름·순서가 같아야 한다(verify_sync.py가 검사).
// 계획서 3쪽 데이터 표의 "Input Feature" 4개 + 구름량.
export const FEATURE_ORDER = [
  'temperature',
  'co2',
  'surface_albedo',
  'atm_thickness',
  'cloud',
]

// physicsEngine의 PLANET_STATES가 원본(label_rules.py와 클래스 번호가 같다).
export const STATE_LABELS = Object.fromEntries(
  PLANET_STATES.map(({ state, label }) => [state, label]),
)

// 모델 로드 재시도 횟수 상한. 실패한 promise를 그대로 캐시하면 새로고침 전까지
// 영구 실패하지만, 무조건 비우면 호출부(피드백 타이머)가 초당 2번씩 영원히
// 재요청한다. 일시적 실패는 몇 번 재시도하고, 계속 실패하면 포기한다.
const MAX_SESSION_LOAD_ATTEMPTS = 3
let sessionPromise = null
let loadAttempts = 0

function getSession() {
  if (!sessionPromise) {
    loadAttempts += 1
    const attempt = loadAttempts
    sessionPromise = ort.InferenceSession.create(MODEL_URL, {
      executionProviders: ['wasm'],
    }).catch((err) => {
      if (attempt < MAX_SESSION_LOAD_ATTEMPTS) sessionPromise = null
      throw err
    })
  }
  return sessionPromise
}

/**
 * 게임의 현재 상태를 학습된 모델의 입력 4개로 변환한다.
 *
 * 학습 데이터를 만든 run_physics_engine.mjs 와 같은 방식으로 계산해야 한다
 * (특히 surface_albedo 는 천리안 SAL 정의에 맞춰 구름을 제외한 값).
 */
function toFeatureValues(climateInputs, physics) {
  const byName = {
    temperature: physics.currentTemperature,
    co2: climateInputs.co2Ppm,
    surface_albedo: albedoOf({ ...climateInputs, cloudRatio: 0 }),
    atm_thickness: climateInputs.atmThickness,
    cloud: climateInputs.cloudRatio,
  }

  return FEATURE_ORDER.map((key) => {
    const value = byName[key]
    if (typeof value !== 'number' || Number.isNaN(value)) {
      throw new Error(`[climateClassifier] 피처 '${key}' 값을 만들 수 없습니다.`)
    }
    return value
  })
}

/**
 * @param {{glacierRatio:number, oceanRatio:number, cloudRatio:number,
 *   atmThickness:number, co2Ppm:number}} climateInputs mapSlidersToClimateInputs() 결과
 * @param {{currentTemperature:number}} physics computeClimateV2() 결과
 * @returns {Promise<{state:number, label:string}>}
 */
export async function predictClimateState(climateInputs, physics) {
  const session = await getSession()

  const tensor = new ort.Tensor(
    'float32',
    Float32Array.from(toFeatureValues(climateInputs, physics)),
    [1, FEATURE_ORDER.length],
  )

  // skl2onnx 분류기는 라벨(텐서) + 확률(ZipMap, 텐서 아님) 2개를 출력한다.
  // fetches 없이 run()하면 확률 출력까지 읽으려다 실패하므로 라벨만 명시적으로 fetch.
  const inputName = session.inputNames[0]
  const labelOutput = session.outputNames[0]
  const results = await session.run({ [inputName]: tensor }, [labelOutput])
  const state = Number(results[labelOutput].data[0])

  return { state, label: STATE_LABELS[state] ?? 'Unknown' }
}
