/**
 * climateClassifier.js — 학습된 RandomForest(ONNX)로 행성 상태(state)를 예측한다.
 *
 * data-pipeline/ML-Scripts/config.py FEATURES / label_rules.py LABEL_NAMES와
 * 반드시 순서·이름이 같아야 한다 (Python 쪽이 원본, 여기는 그걸 그대로 따라감).
 */

// 'onnxruntime-web'(기본 진입점)은 webgpu(jsep) 백엔드까지 다 포함해 26MB wasm이
// 번들된다. RandomForest는 GPU 가속 대상이 아니므로 CPU 전용 서브패스로 import해
// webgpu 코드 자체를 번들에서 빼고, wasm(13MB)만 받게 한다.
import * as ort from 'onnxruntime-web/wasm'
import { albedoOf } from './physicsEngine.js'

// 스레드는 꺼둔다(모델이 작아 이득 없고, dev 서버에 COOP/COEP 헤더가 없어
// SharedArrayBuffer를 못 쓰는 환경에서도 그대로 동작하게 하기 위함).
ort.env.wasm.numThreads = 1

const MODEL_URL = '/models/climate_rf.onnx'

// config.py FEATURES와 동일한 순서
const FEATURE_ORDER = [
  'SAL', 'TPW', 'CLA', 'SST', 't2m', 'psl',
  'co2', 'absorbedRadiation', 'outgoingRadiation', 'deltaEnergy',
  'greenhouseStrength', 'albedo',
]

// ponytail: TPW(가강수량)·psl(해면기압)은 게임 슬라이더 5개 중 어느 것과도
// 물리적으로 이어지는 근거가 없다(대기두께는 온실효과 배율일 뿐 실제 기압/수증기량과
// 무관). 억지로 공식을 만들면 근거 없는 값을 진짜처럼 보이게 할 뿐이라, 정직하게
// final_ml_dataset.csv 전체 평균으로 고정해 둔다 - 실제로 이어줄 근거가 생기면 교체.
const REAL_WORLD_DEFAULTS = {
  TPW: 24.0505,
  psl: 101029.9061,
}

// label_rules.py LABEL_NAMES와 동일
export const STATE_LABELS = {
  0: 'Energy Deficit',
  1: 'Cold Stable',
  2: 'Earth-like Stable',
  3: 'Warm Stable',
  4: 'Energy Surplus',
}

let sessionPromise = null
function getSession() {
  if (!sessionPromise) {
    sessionPromise = ort.InferenceSession.create(MODEL_URL, { executionProviders: ['wasm'] })
  }
  return sessionPromise
}

/**
 * @param {{glacierRatio:number, oceanRatio:number, cloudRatio:number, co2Ppm:number}} climateInputs mapSlidersToClimateInputs() 결과
 * @param {{currentTemperature:number, absorbedRadiation:number, outgoingRadiation:number,
 *   deltaEnergy:number, greenhouseStrength:number, albedo:number}} physics computeClimateV2() 결과
 */
export async function predictClimateState(climateInputs, physics) {
  const session = await getSession()

  const featureValues = FEATURE_ORDER.map((key) => {
    if (key === 't2m' || key === 'SST') return physics.currentTemperature
    if (key === 'CLA') return climateInputs.cloudRatio
    if (key === 'SAL') return albedoOf({ ...climateInputs, cloudRatio: 0 })
    if (key === 'co2') return climateInputs.co2Ppm
    if (key in REAL_WORLD_DEFAULTS) return REAL_WORLD_DEFAULTS[key]
    return physics[key]
  })

  const tensor = new ort.Tensor('float32', Float32Array.from(featureValues), [1, FEATURE_ORDER.length])
  // skl2onnx 분류기는 라벨(텐서) + 확률(ZipMap, 텐서 아님) 2개를 출력한다.
  // fetches 없이 run()하면 확률 출력까지 읽으려다 실패하므로 라벨만 명시적으로 fetch.
  const labelOutput = session.outputNames[0]
  const results = await session.run({ input: tensor }, [labelOutput])
  const state = Number(results[labelOutput].data[0])

  return { state, label: STATE_LABELS[state] ?? 'Unknown' }
}
