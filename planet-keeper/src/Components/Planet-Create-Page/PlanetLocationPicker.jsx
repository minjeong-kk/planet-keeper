import { useState } from "react";
import { CLIMATE_POINTS } from "../../data/climatePoints.js";
import { latLngToPercent } from "../../utils/geo.js";
import useClimateStore from "../../store/useClimateStore";
import {
  computeClimateV2,
  mapSlidersToClimateInputs,
  ENERGY_BALANCE_EPSILON,
} from "../../utils/physicsEngine.js";
import "./PlanetLocationPicker.css";

// 행성 생성 화면 아래쪽의 "특정 지점에서 시작하기" 카드.
//
// 5개 대표 지점(climatePoints.js)은 기상청 KIM 지점 실측값이다(data-pipeline/
// Analysis/build_presets.py가 생성) - 예전엔 실측 전이라 목데이터였지만 지금은
// 아니다. 마커를 클릭하면 그 지점의 물리값을 슬라이더 "초기값"으로만 세팅한다
// (setValuesFromPoint) - 그 이후는 평소처럼 슬라이더를 자유롭게 다시 만질 수 있고
// 잠기지 않는다(선택 로직 자체는 예전과 동일).
//
// 지도 배경은 3D 지구가 이미 쓰는 earth.jpg(Solar System Scope, CC BY 4.0,
// README에 출처 기록됨)를 그대로 재사용한다(PlanetLocationPicker.css) - 새
// 이미지를 따로 구하지 않아 CLAUDE.md의 라이선스 확인 절차가 새로 필요 없다.
// 마커 좌표 계산(latLngToPercent)은 배경이 어떤 이미지든 무관하게 동작한다.
//
// "적용됨" 상태는 useClimateStore.isViewingLocationImage를 그대로 따른다(자체
// 타이머·자체 변경 추적 없음) - 슬라이더를 실제로 움직이면 스토어가 그 플래그를
// 내리고, 그 순간 화면도 "직접 조정한 설정"으로 자연스럽게 넘어간다.
// onStart: "이 지점으로 시작" 버튼이 눌렸을 때 실제로 게임을 시작하는 콜백
// (PlanetCreatePage의 "행성 만들기 완료"와 같은 함수를 그대로 받는다).
function PlanetLocationPicker({ onStart }) {
  const selectedLocation = useClimateStore((state) => state.selectedLocation);
  const isViewingLocationImage = useClimateStore((state) => state.isViewingLocationImage);
  const setValuesFromPoint = useClimateStore((state) => state.setValuesFromPoint);
  const [hoveredId, setHoveredId] = useState(null);
  // null: 안내 없음. { imbalanced }: 방금 선택한 지점이 (실제 온도 기준으로) 불평형인지.
  const [balanceNote, setBalanceNote] = useState(null);

  const handleSelect = (point) => {
    setValuesFromPoint(point);

    // t2m이 있는 지점만 "실제로 이 지점이 평형인가"를 계산해 보여준다 - 값을
    // 반영한 직후의 스토어 상태를 그대로 읽는다(setValuesFromPoint가 동기 처리).
    if (typeof point.t2m === "number") {
      const state = useClimateStore.getState();
      const physics = computeClimateV2({
        ...mapSlidersToClimateInputs(state.values),
        currentTemperature: state.currentTemperature,
      });
      setBalanceNote({ imbalanced: Math.abs(physics.deltaEnergy) > ENERGY_BALANCE_EPSILON });
    } else {
      setBalanceNote(null);
    }
  };

  return (
    <section className="picker" data-tour="create-picker">
      <header className="picker__head">
        <h2 className="picker__title">🌍 특정 지점에서 시작하기</h2>
        <p className="picker__desc">
          원하는 지점을 선택하면 해당 지역의 기후 데이터를 기반으로 행성 설정이 적용됩니다.
        </p>
      </header>

      <div className="picker__body">
        <div className="picker__map">
          {CLIMATE_POINTS.map((point) => {
            const { top, left } = latLngToPercent(point.lat, point.lng);
            // 그 지점 값이 "지금 적용 중"일 때만 강조한다 - 슬라이더를 직접 움직여
            // 값이 달라지면 useClimateStore가 isViewingLocationImage를 내리고, 그 순간
            // 지도의 링·광원 표시도 같이 풀린다.
            const isSelected = isViewingLocationImage && selectedLocation?.id === point.id;
            return (
              <button
                key={point.id}
                type="button"
                className={`picker__marker${isSelected ? " picker__marker--selected" : ""}`}
                style={{ top: `${top}%`, left: `${left}%` }}
                onClick={() => handleSelect(point)}
                onMouseEnter={() => setHoveredId(point.id)}
                onMouseLeave={() => setHoveredId((current) => (current === point.id ? null : current))}
                onFocus={() => setHoveredId(point.id)}
                onBlur={() => setHoveredId((current) => (current === point.id ? null : current))}
                aria-label={`${point.name} 값으로 시작하기`}
                aria-pressed={isSelected}
              >
                {isSelected && <span className="picker__ring" aria-hidden="true" />}
                <span className="picker__dot" aria-hidden="true" />
                {(hoveredId === point.id || isSelected) && (
                  <span className="picker__tooltip">{point.name}</span>
                )}
              </button>
            );
          })}
        </div>

        {/* 선택 여부를 확인하는 정도의 요약만 - 결과 수치를 나열하지 않는다 */}
        <aside className="picker__info">
          {selectedLocation ? (
            <>
              <p className="picker__info-name">
                📍 {selectedLocation.name}
                {balanceNote?.imbalanced && (
                  <span
                    className="picker__flag-note"
                    title="이 지점은 실제로 에너지 불균형 상태입니다. 실제 지구에서는 대기와 해류가 이 열을 다른 지역으로 옮겨 지구 전체는 균형을 이룹니다. 이 게임은 한 지점만 계산하므로 그 이동 효과는 반영되지 않습니다."
                  >
                    ⚠ 실제 불균형
                  </span>
                )}
              </p>
              <dl className="picker__info-list">
                {typeof selectedLocation.t2m === "number" && (
                  <div>
                    <dt>평균 온도</dt>
                    <dd>{selectedLocation.t2m.toFixed(1)} K</dd>
                  </div>
                )}
                <div>
                  <dt>바다</dt>
                  <dd>{selectedLocation.values.ocean}%</dd>
                </div>
                <div>
                  <dt>빙하</dt>
                  <dd>{selectedLocation.values.iceThickness}%</dd>
                </div>
                <div>
                  <dt>구름</dt>
                  <dd>{selectedLocation.values.cloud}%</dd>
                </div>
                <div>
                  <dt>CO₂</dt>
                  <dd>{Math.round(selectedLocation.values.co2)} ppm</dd>
                </div>
              </dl>

              {/* 정보 -> 상태 -> 행동 순서 */}
              <p className={`picker__state${isViewingLocationImage ? " is-applied" : ""}`}>
                {isViewingLocationImage ? "✅ 지점 데이터 적용됨" : "✏️ 직접 조정한 설정으로 변경됨"}
              </p>

              {/* 그 지점 값을 다시 적용한 뒤 곧바로 게임을 시작한다 - "행성 만들기 완료"와
                  같은 동작이다(setValuesFromPoint가 동기라 시작 시점엔 값이 이미 반영돼 있다). */}
              <button
                type="button"
                className="picker__apply"
                onClick={() => {
                  handleSelect(selectedLocation);
                  onStart?.();
                }}
              >
                이 지점으로 시작
              </button>

            </>
          ) : (
            <>
              <p className="picker__info-name picker__info-name--empty">지점 미선택</p>
              <p className="picker__info-empty">
                지도의 표시를 누르면 그 지역의 실측 기후 값이 적용됩니다. 선택하지 않고 직접 설정한
                행성으로 시작해도 됩니다.
              </p>
            </>
          )}
        </aside>
      </div>
    </section>
  );
}

export default PlanetLocationPicker;
