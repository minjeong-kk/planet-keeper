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

// 5개 대표 지점(climatePoints.js)은 기상청 KIM 지점 실측값이다(data-pipeline/
// Analysis/build_presets.py가 생성) - 예전엔 실측 전이라 목데이터였지만 지금은
// 아니다. 마커를 클릭하면 그 지점의 물리값을 슬라이더 "초기값"으로만 세팅한다(setValuesFromPoint) -
// 그 이후는 평소처럼 슬라이더를 자유롭게 다시 만질 수 있고 잠기지 않는다.
// 지도 배경은 3D 지구가 이미 쓰는 earth.jpg(Solar System Scope, CC BY 4.0,
// README에 출처 기록됨)를 그대로 재사용한다(PlanetLocationPicker.css) - 새
// 이미지를 따로 구하지 않아 CLAUDE.md의 라이선스 확인 절차가 새로 필요 없다.
// 마커 좌표 계산(latLngToPercent)은 배경이 어떤 이미지든 무관하게 동작한다.
//
// 안내 문구("✅ OO 값이 적용됐습니다")는 useClimateStore.isViewingLocationImage를
// 그대로 따른다(자체 타이머·자체 변경 추적 없음) - 슬라이더를 실제로 움직이면
// 스토어가 그 플래그를 내리고, 그 순간 이 문구도 같이 사라진다. "다른 지점을
// 선택하면 문구가 바뀐다"도 같은 스토어 값을 다시 세팅하는 것뿐이라 별도 처리가
// 필요 없다 - PlanetCreatePage(3D 지구 ↔ 이미지 전환)와 항상 같은 판단 기준을 쓴다.
function PlanetLocationPicker() {
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
    <div className="location-picker">
      <p className="location-picker__title">🌍 특정 지점에서 시작하기</p>
      <div className="location-picker__map">
        {CLIMATE_POINTS.map((point) => {
          const { top, left } = latLngToPercent(point.lat, point.lng);
          return (
            <button
              key={point.id}
              type="button"
              className="location-picker__marker"
              style={{ top: `${top}%`, left: `${left}%` }}
              onClick={() => handleSelect(point)}
              onMouseEnter={() => setHoveredId(point.id)}
              onMouseLeave={() => setHoveredId((current) => (current === point.id ? null : current))}
              onFocus={() => setHoveredId(point.id)}
              onBlur={() => setHoveredId((current) => (current === point.id ? null : current))}
              aria-label={`${point.name} 값으로 시작하기`}
            >
              <span className="location-picker__flag" aria-hidden>
                🚩
              </span>
              {hoveredId === point.id && <span className="location-picker__tooltip">{point.name}</span>}
            </button>
          );
        })}
      </div>
      {isViewingLocationImage && selectedLocation && (
        <p className="location-picker__applied">
          ✅ {selectedLocation.name} 값이 슬라이더에 적용됐습니다.
          {balanceNote?.imbalanced && (
            <>
              {" "}이 지점은 실제로 에너지 불균형 상태입니다 — 실제 지구에서는 대기와 해류가 이
              열을 다른 지역으로 옮겨서 지구 전체는 균형을 이룹니다. 이 게임은 한 지점만
              계산하므로 그 이동 효과는 반영되지 않습니다.
            </>
          )}
        </p>
      )}
    </div>
  );
}

export default PlanetLocationPicker;
