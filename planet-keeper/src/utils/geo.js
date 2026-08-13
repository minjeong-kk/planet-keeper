// 위경도 -> 화면 % 좌표 변환만 모아두는 파일. 지금은 목데이터라 등장방형
// (equirectangular) 투영 하나로 충분하다 - 실측 위경도가 들어와도 지도 배경이
// 등장방형 이미지라면 이 함수는 그대로 쓰고, 다른 투영법 이미지로 바뀌면 이
// 함수 내부만 바꾸면 된다(호출부인 PlanetLocationPicker는 그대로 둔다).
export function latLngToPercent(lat, lng) {
  const left = ((lng + 180) / 360) * 100;
  const top = ((90 - lat) / 180) * 100;
  return {
    left: Math.min(100, Math.max(0, left)),
    top: Math.min(100, Math.max(0, top)),
  };
}
