// 좌측 영역: 기상청 마스코트 '기상이'(10 인사 버전) + 말풍선.
// 원본 PNG이 이미 알파 투명 배경이라 블렌드 모드 없이 그대로 얹는다.
// 이미지가 없을 때만 onError 로 SVG 실루엣이 대신 표시된다.
//
// 이미지 출처 (README '기상청 마스코트 기상이' 항목과 같은 내용)
//   저작물: "기상청 캐릭터 기상이" / 제공: 기상청
//   원본 파일: 기상청 캐릭터 이미지 배포본 10인사-기상이.png (2022)
//   이용조건: 공공누리 제2유형 - 출처표시 + 상업적 이용금지 (비상업적 용도만 가능)
//   https://gongu.copyright.or.kr/gongu/wrt/wrt/view.do?wrtSn=227435
const MASCOT_IMAGE_SRC = "/assets/gisangi_10.png";

/** 마스코트 이미지가 없을 때 쓰는 대체 실루엣(구름 캐릭터). */
function GisangiFallback() {
  return (
    <svg viewBox="0 0 160 160" role="img" aria-label="기상이 캐릭터" focusable="false">
      <circle cx="112" cy="52" r="18" fill="#ffd166" opacity="0.9" />
      <g fill="#eaf6ff" stroke="rgba(45, 212, 191, 0.55)" strokeWidth="2">
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

// 말풍선 꼬리. 본체(둥근 사각형)는 CSS가 그리고 꼬리만 고정 크기 SVG로 얹는다 -
// 전체를 늘어나는 SVG 하나로 그리면 문장 길이에 따라 곡선이 눌리고, 회전한 네모를
// 붙이면 각진 사다리꼴이 된다. viewBox 의 y=2 가 본체 아래 테두리 선이며,
//   ① fill  : 꼬리 안쪽을 본체와 '같은 단색'으로 채운다(반투명이면 이음새에서 색이 튄다)
//   ② cover : 꼬리 입구를 지나가는 본체 테두리 1px 을 덮어 지운다
//   ③ edge  : 본체 테두리에서 이어지는 곡선 외곽선만 마지막에 덧그린다
const TAIL_CURVE = "M 33,2 C 32,13 25,24 5,31 C 16,22 19,11 13,2";

function MascotGuide() {
  return (
    <div className="start-page__stage">
      <div className="start-page__bubble">
        {/* 줄바꿈은 어절/문장부호 경계에서만 일어나게 하고, 갈라지면 어색한
            구절은 nowrap 스팬으로 한 줄에 묶어 둔다. */}
        <div className="start-page__bubble-text">
          <p>안녕, 나는 기상이야!</p>
          <p>
            이 행성의 온도,{" "}
            <span className="start-page__nowrap">아직 아무도 못 맞췄어.</span>
          </p>
          <p>
            <span className="start-page__nowrap">너무 뜨겁지도 차갑지도 않게</span>{" "}
            <strong className="start-page__nowrap">같이 맞춰보자!</strong>
          </p>
        </div>

        <svg className="start-page__bubble-tail" viewBox="0 0 44 34" aria-hidden="true" focusable="false">
          <path className="start-page__bubble-tail-fill" d={`${TAIL_CURVE} Z`} />
          <rect className="start-page__bubble-tail-fill" x="13" y="0" width="20" height="3" />
          <path className="start-page__bubble-tail-edge" d={TAIL_CURVE} />
        </svg>
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
