// generate_dataset.py가 호출하는 Node 브릿지.
//
// src/utils/physicsEngine.js의 computeClimateV2()를 재구현하지 않고 그대로
// 불러서 실행한다 - 게임(브라우저)과 학습 데이터 생성이 서로 다른 물리 공식을
// 쓰게 되는 걸 막기 위함.
//
// 입력: stdin으로 JSON 배열
//   [{glacierRatio, oceanRatio, cloudRatio, atmThickness, co2Ppm, currentTemperature}, ...]
// 출력: stdout으로 JSON 배열 [computeClimateV2() 결과, ...] (입력과 같은 순서)

import { computeClimateV2 } from "../../src/utils/physicsEngine.js";

let input = "";
process.stdin.setEncoding("utf-8");
process.stdin.on("data", (chunk) => {
  input += chunk;
});
process.stdin.on("end", () => {
  const simulations = JSON.parse(input);
  const results = simulations.map((sim) => computeClimateV2(sim));
  process.stdout.write(JSON.stringify(results));
});
