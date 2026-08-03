// generate_dataset.py가 호출하는 Node 브릿지.
//
// src/utils/physicsEngine.js를 Python으로 재구현하지 않고 그대로 불러서 실행한다
// - 게임(브라우저)과 학습 데이터 생성이 서로 다른 물리 공식을 쓰게 되는 걸 막기 위함.
//
// 라벨(state)도 여기서 planetStateOf로 계산한다. 임계값이 이미 실측 도출 파일
// (src/data/climateThresholds.js)에서 오므로, 라벨과 물리 계산이 같은 소스를 쓴다.
// label_rules.py의 assign_label은 같은 규칙의 Python 구현이며, 두 결과가 일치하는지는
// verify_sync.py가 검사한다.
//
// 입력: stdin으로 JSON 배열
//   [{glacierRatio, oceanRatio, cloudRatio, atmThickness, co2Ppm, temperatureOffsetK}, ...]
//
//   temperatureOffsetK 는 "평형온도에서 얼마나 떨어져 있는가"다. 절대 온도를 Python이
//   직접 만들지 않는 이유: 평형온도는 조성에 의존하므로 엔진이 계산해야 하고, 그래야
//   생성 표본이 게임에서 실제로 나타나는 궤적(평형으로 수렴하는 중의 온도)과 같은
//   분포를 갖는다.
//
// 출력: stdout으로 JSON 배열 (입력과 같은 순서)

import {
  computeClimateV2,
  albedoOf,
  equilibriumTemperatureOf,
  planetStateOf,
  TEMPERATURE_FLOOR_K,
  TEMPERATURE_CEILING_K,
  REFERENCE_TEMP_K,
} from "../../src/utils/physicsEngine.js";

const clamp = (x, lo, hi) => Math.min(hi, Math.max(lo, x));

function evaluate(sim) {
  const { glacierRatio, oceanRatio, cloudRatio, atmThickness, co2Ppm } = sim;
  const composition = { glacierRatio, oceanRatio, cloudRatio, atmThickness, co2Ppm };

  // 1) 이 조성의 평형온도 (어떤 온도를 넣어 계산해도 같은 값이 나온다)
  const probe = computeClimateV2({ ...composition, currentTemperature: REFERENCE_TEMP_K });
  const equilibriumTemperature = equilibriumTemperatureOf(probe);

  // 2) 평형온도에서 offset만큼 떨어진 지점을 "현재 온도"로 삼아 수지를 평가한다.
  const temperature = clamp(
    equilibriumTemperature + (sim.temperatureOffsetK ?? 0),
    TEMPERATURE_FLOOR_K,
    TEMPERATURE_CEILING_K,
  );
  const physics = computeClimateV2({ ...composition, currentTemperature: temperature });

  return {
    // ── ML 피처 (config.py FEATURES와 이름이 같아야 한다) ──
    temperature,
    co2: co2Ppm,
    // 지표면 반사도: 천리안 SAL과 같은 정의를 맞추려고 구름을 뺀 값으로 계산한다.
    surface_albedo: albedoOf({ glacierRatio, oceanRatio, cloudRatio: 0 }),
    atm_thickness: atmThickness,

    // ── 라벨 ──
    state: planetStateOf(physics.deltaEnergy, temperature),

    // ── 진단용 (피처 아님 — config.py FEATURES에 넣지 말 것) ──
    // 라벨을 직접 결정하는 값이라 학습 입력에 들어가면 그대로 라벨 누수가 된다.
    delta_energy: physics.deltaEnergy,
    equilibrium_temperature: equilibriumTemperature,
    albedo: physics.albedo,
    greenhouse_strength: physics.greenhouseStrength,
  };
}

let input = "";
process.stdin.setEncoding("utf-8");
process.stdin.on("data", (chunk) => {
  input += chunk;
});
process.stdin.on("end", () => {
  const simulations = JSON.parse(input);
  process.stdout.write(JSON.stringify(simulations.map(evaluate)));
});
