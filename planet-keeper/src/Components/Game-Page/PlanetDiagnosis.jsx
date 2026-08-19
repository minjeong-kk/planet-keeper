import { useMemo } from "react";
import { analyzePlanetState, labelTone } from "../../utils/planetAnalysis.js";
import { PLANET_STATES } from "../../utils/physicsEngine.js";

// 오른쪽 패널 아래의 "행성 진단". 예전 InfoPanel의 Planet Summary(현재 상태 /
// 원인 / 현재 문제 / 해결 방향)와 같은 데이터를 쓰지만, 문장을 박스마다 여러 줄로
// 쌓지 않고 게임 상태창처럼 "항목 : 한 줄"로 압축한다. 판정 근거가 되는 긴
// 설명(현재 문제 등)은 항목의 title 툴팁으로만 남긴다.
//
// analyzePlanetState의 sections 제목은 라벨에 따라 달라진다("현재 상태"/"원인"/
// "현재 문제"/"해결 방향", Earth-like Stable일 땐 제목 없는 보충 섹션도 있다) -
// 제목으로 찾아 쓰고, 없으면 그 줄은 그냥 표시하지 않는다.
const KOREAN_LABEL = Object.fromEntries(PLANET_STATES.map(({ label, korean }) => [label, korean]));

const TAG_ICON = { earth: "✔", warm: "⚠", cold: "⚠", neutral: "…" };

// 여러 줄로 나온 원인/해결 방향은 " · "로 이어 한 줄로 만든다.
const joinLines = (section) => (section?.lines?.length ? section.lines.join(" · ") : null);

function PlanetDiagnosis({ physicsResult, mlResult, co2Ppm, atmThickness }) {
  const analysis = useMemo(
    () => analyzePlanetState({ physicsResult, mlResult, co2Ppm, atmThickness }),
    [physicsResult, mlResult, co2Ppm, atmThickness],
  );

  const tone = labelTone(mlResult?.label);
  const verdict = mlResult ? (KOREAN_LABEL[mlResult.label] ?? mlResult.label) : "판정 대기";

  const sections = analysis?.sections ?? [];
  const find = (title) => sections.find((sec) => sec.title === title);
  const rows = [
    { label: "현재 상태", value: joinLines(find("현재 상태")) },
    { label: "원인", value: joinLines(find("원인")) },
    { label: "해결 방향", value: joinLines(find("해결 방향")) },
  ].filter((row) => row.value);

  // "현재 문제"(장기적으로 온도가 계속 상승/하강합니다 등)는 카드에 상시 노출하지
  // 않고 판정 배지의 툴팁으로만 둔다.
  const problemDetail = joinLines(find("현재 문제"));

  return (
    <section className="panel panel--diagnosis">
      <header className="panel__head">
        <h2 className="panel__title">행성 진단</h2>
        <span className={`status-tag status-tag--${tone}`} title={problemDetail ?? undefined}>
          <span aria-hidden="true">{TAG_ICON[tone]}</span>
          {verdict}
        </span>
      </header>

      {rows.length > 0 ? (
        <dl className="diagnosis-list">
          {rows.map((row) => (
            <div key={row.label} className="diagnosis-row">
              <dt>{row.label}</dt>
              <dd>{row.value}</dd>
            </div>
          ))}
        </dl>
      ) : (
        <p className="panel__placeholder">아직 행성 상태를 계산하지 않았습니다.</p>
      )}
    </section>
  );
}

export default PlanetDiagnosis;
