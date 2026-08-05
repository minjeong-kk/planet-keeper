// 우측 영역: 기상청 마스코트 '기상이'(10 인사 버전) + 말풍선.
// 원본 PNG이 이미 알파 투명 배경이라 블렌드 모드 없이 그대로 얹는다.
// 이미지가 없을 때만 onError 로 SVG 실루엣이 대신 표시된다.
const MASCOT_IMAGE_SRC = "/assets/gisangi_10.png";

/** 마스코트 이미지가 없을 때 쓰는 대체 실루엣(구름 캐릭터). */
function GisangiFallback() {
  return (
    <svg viewBox="0 0 160 160" role="img" aria-label="기상이 캐릭터" focusable="false">
      <circle cx="112" cy="52" r="18" fill="#ffd166" opacity="0.9" />
      <g fill="#eaf6ff" stroke="rgba(88, 224, 255, 0.55)" strokeWidth="2">
        <circle cx="58" cy="88" r="26" />
        <circle cx="92" cy="82" r="30" />
        <circle cx="118" cy="98" r="21" />
        <rect x="36" y="90" width="98" height="34" rx="17" />
      </g>
      <circle cx="72" cy="92" r="4.5" fill="#0e1220" />
      <circle cx="102" cy="90" r="4.5" fill="#0e1220" />
      <path d="M80 102 q7 8 14 0" fill="none" stroke="#0e1220" strokeWidth="2.6" strokeLinecap="round" />
    </svg>
  );
}

function MascotGuide() {
  return (
    <div className="start-page__stage">
      <div className="start-page__bubble">
        <p className="start-page__bubble-text">
          안녕, 나는 기상이야! 방금 행성 하나가 새로 배정됐는데{" "}
          <strong>온도 조절은 아직 아무도 안 해놨어.</strong>
        </p>
        <p className="start-page__bubble-text">
          너무 뜨겁지도, 얼어붙지도 않게 — 우리가 딱 맞춰볼래?
        </p>
      </div>

      <div className="start-page__mascot">
        <span className="start-page__mascot-glow" aria-hidden="true" />
        <img
          className="start-page__mascot-img"
          src={MASCOT_IMAGE_SRC}
          alt="기상청 마스코트 기상이"
          onError={(e) => e.currentTarget.classList.add("is-missing")}
        />
        <span className="start-page__mascot-fallback" aria-hidden="true">
          <GisangiFallback />
        </span>
      </div>
    </div>
  );
}

export default MascotGuide;
