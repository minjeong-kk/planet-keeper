# planet-keeper

An educational climate game to reach planetary equilibrium through environmental control and science quizzes.

알베도와 온실효과를 직접 조절해 행성의 **에너지 평형**(흡수 = 방출)을 맞추는 지구과학Ⅰ 학습 게임입니다.
행성을 만들고 → 문제를 풀어 기후 제어 장비를 얻고 → 장비로 조성을 바꿔 평형에 도달한 뒤,
그 평형을 유지한 채 지구와 비슷한 온도까지 맞추면 클리어입니다.

---

# 게임 실행

```bash
cd planet-keeper
npm install
npm run dev            # http://localhost:5173
```

| 명령 | 설명 |
|------|------|
| `npm run dev` | 개발 서버 |
| `npm run build` | 프로덕션 빌드 (`dist/`) |
| `npm run preview` | 빌드 결과 미리보기 |
| `npm run lint` | oxlint |

`vercel.json`은 SPA 라우팅용입니다 - `/report`처럼 하위 경로로 **직접 접속**하면
그 경로의 파일이 없어 404가 나므로, 정적 파일이 아닌 요청은 `index.html`로 보내
React Router가 처리하게 합니다(정적 파일은 파일시스템이 먼저 응답하므로 영향 없음).

> 아래 **데이터 파이프라인은 실행하지 않아도 게임이 돌아갑니다.** 수집·도출 결과가
> `src/data/climateThresholds.js`와 `src/data/climatePoints.js`로 이미 커밋되어 있습니다.
> API 키가 필요한 건 그 데이터를 **다시 수집할 때**뿐입니다.

## 화면 구성

| 경로 | 화면 | 하는 일 |
|------|------|---------|
| `/` | 시작 | 게임 소개 · 기후 개념 도감 · 다크/라이트 전환 |
| `/planet-create` | 행성 만들기 | 슬라이더 5종(빙하·바다·구름·대기두께·CO₂)으로 조성 설정, 또는 실측 지점 5곳 중 선택 |
| `/game` | 플레이 | 1단계 에너지 평형 만들기 → 2단계 지구 유사 온도 맞추기. 문제 풀이·장비 사용·이상기후 대응 |
| `/report` | 리포트 | 행성 변화 타임라인 · 문제 풀이 결과 · 핵심 개념 정리 |

정의되지 않은 경로는 시작 화면으로 리다이렉트됩니다(`App.jsx`).

## 소스 구조

```
planet-keeper/src/
├─ App.jsx                    라우팅 + 경로 변경 시 스크롤 초기화
├─ Components/
│  ├─ Start-Page/             시작 화면, 개념 도감(ConceptBook), 마스코트
│  ├─ Planet-Create-Page/     슬라이더 조성 설정, 지점 선택 지도
│  ├─ Game-Page/              HUD·문제·장비·모달 (플레이 화면 전체)
│  ├─ Report-Page/            결과 리포트
│  ├─ common/                 용어 툴팁(Term) · 온보딩(Tutorial) · 퀴즈 해설(QuizReview)
│  │                          · useEscapeKey · useTheme(다크/라이트)
│  └─ Planet-ui.jsx           three.js 3D 행성 렌더링
├─ store/
│  ├─ useClimateStore.js      행성 조성(슬라이더)과 현재 온도 — "입력"
│  └─ useGameStore.js         단계·문제·장비·타임라인 — "게임 진행"
├─ utils/
│  ├─ physicsEngine.js        알베도·온실효과·ΔE·상태 판정 (순수 물리)
│  ├─ planetAnalysis.js       판정 결과를 설명 문장으로 (물리 → 한국어)
│  ├─ climateVisual.js        슬라이더·온도 → 3D 외형 props
│  └─ geo.js                  위경도 → 지도 % 좌표
└─ data/                      문제은행 · 장비 · 용어집 · 지점/임계값(파이프라인 산출물)
                              · referenceValues.js(학습 문구가 인용하는 기준 수치를
                                물리엔진에서 유도 — 재수집해도 문구가 낡지 않게)
```

물리 결과는 store에 저장하지 않습니다 — 조성과 온도만 있으면 언제든 다시 계산되는
순수 함수이므로, 쓰는 쪽에서 `computeClimateV2`로 파생시킵니다.

---

# 데이터 파이프라인 실행

실측 데이터를 수집해 물리 엔진의 판정 임계값·지점 프리셋을 도출합니다. **게임 자체는
이 과정을 실행하지 않아도 동작합니다** — 결과가 `src/data/climateThresholds.js`와
`src/data/climatePoints.js`로 이미 커밋되어 있습니다. 다시 수집할 때만 필요합니다.

## 설치

```bash
cd planet-keeper/data-pipeline
python3 -m venv .venv
source .venv/bin/activate      # Windows: .venv\Scripts\activate
pip install -r requirements.txt
```

## 실행 순서

```bash
# 1. 실측 수집 (API 키 필요 — .env.example을 .env로 복사하고
#    기상청 API 허브 https://apihub.kma.go.kr 에서 발급받은 개인 키를 API_KEY에 넣으세요)
cd Scripts                     # (저장소 루트라면 cd planet-keeper/data-pipeline/Scripts)
python3 observed-kim.py        # 자체 생성 전지구 무작위 좌표의 KIM t2m/psl → observed_kim_dataset.csv  [사용: 판정 임계값]
python3 physics-kim.py         # KIM 전지구 필드 평균 → physics_kim_dataset.csv              [중간 산출물]
python3 physics-merge.py       # 위 결과 + CO2 병합 → physics_reference.csv                  [+ physicsEngine.js 상수 2개 자동 반영]

# 2. 지점 선택용 실측 수집 (행성 만들기의 "특정 지점 선택")
python3 probe-kim-vars.py      # 필요한 KIM 변수가 살아 있는지 확인 (선행, 산출물 없음)      [진단용]
python3 preset-kim.py          # 5지점 × 변수 4종 → preset_kim_cache.csv                     [사용: 지점 프리셋]

# 3. 도출·변환
cd ../Analysis
python3 derive_thresholds.py   # 실측 t2m 분포 → climate_thresholds.json                    [미사용 — 기록용]
                                #                + src/data/climateThresholds.js             [사용]
python3 build_presets.py       # preset_kim_cache.csv → src/data/climatePoints.js            [사용]
```

> 학습 화면(문제은행·용어집·도감)의 숫자는 재수집 뒤에 손으로 고칠 것이 없습니다 —
> `src/data/referenceValues.js`가 물리엔진에서 유도한 값을 문구에 끼워 쓰기 때문입니다
> (DATA_PIPELINE.md "학습 화면의 숫자는 손으로 옮기지 않습니다" 참고).
>
> `derive_thresholds.py`와 `build_presets.py`가 각 출력 파일의 유일한 생성자라 값이
> 어긋날 수 없습니다. `preset-kim.py`는 한 건씩 캐시에 flush하므로 중간에 끊겨도
> 다시 실행하면 이어받습니다. `physics-merge.py`는 파일을 새로 만드는 대신
> `physicsEngine.js`의 `SOLAR_CONSTANT`/`CO2_BASELINE_PPM` 두 줄만 정규식으로
> 덮어씁니다 — 왜 위성 없이 좌표를 자체 생성하는지, 이 상수 자동 반영이 정확히
> 어떻게 동작하는지는 [DATA_PIPELINE.md](DATA_PIPELINE.md), 바꾼 이유는
> [LIMITATIONS.md](LIMITATIONS.md) 5·7번 참고.

스크립트별 상세 역할, 실측 데이터가 쓰이는 경로 다이어그램은
[DATA_PIPELINE.md](DATA_PIPELINE.md)에 정리해 두었습니다.

---

# 프로젝트 한계 및 계획서 대비 변경 사항

→ [LIMITATIONS.md](LIMITATIONS.md) 로 옮겼습니다. 물리 엔진 기준값의 근거, 실측 데이터의
한계, ML(ONNX) 분류 모델을 걷어낸 이유 등 개발계획서 대비 달라진 점을 정리해 두었습니다.

---

# Assets & Licensing

이 프로젝트가 쓰는 외부 저작물의 출처와 이용조건입니다. 아래 네 갈래로 나눠 적습니다.

- [이미지](#이미지) — 지구 텍스처, 마스코트, 지점 사진, 파비콘
- [기상·기후 데이터](#기상기후-데이터) — 기상청 API 허브
- [라이브러리](#라이브러리) — npm / PyPI 패키지
- [폰트](#폰트)

## 이미지

All textures are bundled locally (not hot-linked) to avoid runtime/CORS dependency.

- **Earth day map** (`public/assets/earth.jpg`)
  - "Earth Day Map" (2k) by **Solar System Scope**
  - **CC BY 4.0**
  - https://www.solarsystemscope.com/textures/

- **Earth clouds** (`public/assets/earth-clouds.jpg`)
  - "Earth Clouds" (2k) by **Solar System Scope**
  - **CC BY 4.0**
  - https://www.solarsystemscope.com/textures/

- **Earth elevation / height map** (`public/assets/earth-height.jpg`)
  - Grayscale elevation map derived from **NASA Visible Earth** (Public Domain)
  - via `turban/webgl-earth` (MIT)
  - https://github.com/turban/webgl-earth

- **CC BY 4.0 license**
  - https://creativecommons.org/licenses/by/4.0/

- **Atmosphere / CO₂ glow**
  - Fresnel rim-glow shader technique from public Three.js examples
  - (a technique, not a copyrighted asset)

- **기상청 마스코트 '기상이'** (`public/assets/gisangi_10.png`)
  - 저작물명: **기상청 캐릭터 기상이** / 제공: **기상청(Korea Meteorological Administration)**
  - 원본 파일: 기상청 캐릭터 이미지 배포본 중 `10인사-기상이.png` (2022) — 프로젝트에서는 `gisangi_10.png`로 이름만 바꿔 사용
  - 이용조건: **공공누리 제2유형 — 출처표시 + 상업적 이용금지**
  - 출처(공유마당): https://gongu.copyright.or.kr/gongu/wrt/wrt/view.do?wrtSn=227435
  - ⚠️ **비상업적 목적(교육·경진대회)에서만 사용할 수 있습니다.** 상업적 배포·수익화를 하게 되면 이 이미지를 빼거나 기상청의 별도 이용 허락을 받아야 합니다. (이미지 표시는 `src/Components/Start-Page/MascotGuide.jsx` 한 곳에서만 하며, 파일이 없으면 자체 제작 SVG 실루엣으로 자동 대체됩니다.)

- **사하라 사막 지점 사진** (`public/assets/location-sahara.jpg`)
  - 저작물명: "Eroded Beauty in the Sahara Desert" (원본 파일명 `iss061e098063_lrg.jpg`)
  - 우주비행사 사진(Astronaut Photograph) ISS061-E-98063, 2019년 12월 25일 국제우주정거장에서 니콘 D5(800mm)로 촬영
  - 제공: **NASA** (ISS Crew Earth Observations Facility / Earth Science and Remote Sensing Unit, Johnson Space Center)
  - 라이선스: **Public Domain** (미국 정부 저작물)
  - 출처: https://science.nasa.gov/earth/earth-observatory/eroded-beauty-in-the-sahara-desert-150604/
  - 원본(5568×3712)을 프로젝트에서 960×640으로 리사이즈·재압축(용량 절감, 화질 손실 미미)해 로컬 번들
  - 사용처: 행성 만들기 페이지의 "특정 지점 선택" — 사하라 사막 선택 시 미리보기(`src/data/climatePoints.js`)

- **파비콘** (`public/favicon.svg`)
  - 프로젝트에서 직접 제작한 SVG (외부 저작물 없음)
  - 게임 UI와 같은 청록 팔레트(#5eead4 ~ #0f766e)의 행성 + 고리
  - 사용처: `index.html`의 `<link rel="icon">`
- **아마존 지점 사진** (`public/assets/location-amazon.jpg`)
  - 저작물명: "Rio Negro, Amazonia, Brazil" (원본 파일명 `ISS013-E-74843_lrg.jpg`)
  - 우주비행사 사진(Astronaut Photograph) ISS013-E-74843, 2006년 9월 2일 국제우주정거장에서 Kodak 760C(180mm)로 촬영
  - 제공: **NASA** (ISS Crew Earth Observations Facility / Earth Science and Remote Sensing Unit, Johnson Space Center)
  - 라이선스: **Public Domain** (미국 정부 저작물)
  - 출처: https://science.nasa.gov/earth/earth-observatory/rio-negro-amazonia-brazil-7169/
  - 원본(1000×662)을 프로젝트에서 960×636으로 리사이즈·재압축(용량 절감, 화질 손실 미미)해 로컬 번들
  - 사용처: 행성 만들기 페이지의 "특정 지점 선택" — 아마존 선택 시 미리보기(`src/data/climatePoints.js`)

## 기상·기후 데이터

게임의 물리 기준값과 판정 임계값은 **기상청 API 허브**에서 받은 실측·수치예보 자료에서
도출합니다. 수집 결과를 CSV로 저장소에 함께 담아 배포하므로(아래 "재배포" 참고), 단순
API 호출을 넘어 출처 표기가 필요합니다.

- **제공**: **기상청(Korea Meteorological Administration)** — 기상청 API 허브
  - https://apihub.kma.go.kr
- **이용조건**: 기상청 API 허브를 통해 제공되는 기상·기후 데이터는 **공공누리(KOGL)** 가
  적용됩니다.
  - ⚠️ **적용 유형(제1~4유형)은 아직 확인하지 않았습니다.** 유형에 따라 상업적 이용·변형
    허용 범위가 달라지므로, 배포·공개 전에 API 허브의 이용약관 또는 각 자료의 공공누리
    표시를 확인하고 이 줄을 정확한 유형으로 바꿔야 합니다.
  - 공공누리 유형 안내: https://www.kogl.or.kr/info/license.do
  - 이 프로젝트는 **비상업적 교육·경진대회 목적**으로만 사용합니다(마스코트 이미지의
    공공누리 제2유형 조건과 같은 범위).
- **사용한 자료**
  - **KIM (한국형수치예보모델)** 전지구 예보 필드 — 물리 기준 상수와 관측 분포
    - 지점 조회: `nph-kim_nc_pt_txt2` / 격자 조회: `nph-kim_nc_xy_txt2`
    - 수집: `data-pipeline/Scripts/observed-kim.py`, `physics-kim.py`, `preset-kim.py`
  - **기상청 관측소 CO₂ 실측** (울릉도·독도 / 안면도 / 고산, 2024년 월별)
    - `CO2_BASELINE_PPM = 429.53` 의 근거 (`data-pipeline/Datasets/co2_data.csv`)
  - **GK2A (천리안위성 2A호)** 위성 산출물 — 지금은 쓰지 않습니다
    - 옛 방식 재현용으로 `data-pipeline/Scripts/legacy/` 에만 남아 있습니다
- **재배포**: 수집 결과를 `data-pipeline/Datasets/*.csv` 로 저장소에 포함합니다. 원자료를
  그대로 옮긴 것이 아니라 평균·필드 추출 등 가공을 거친 파생 자료입니다.
  - `physics_reference.csv`, `observed_kim_dataset.csv`, `physics_kim_dataset.csv`,
    `physics_kim_monthly_cache.csv`, `preset_kim_cache.csv`, `co2_data.csv`,
    `climate_thresholds.json`
  - 도출 과정은 [DATA_PIPELINE.md](DATA_PIPELINE.md), 한계는 [LIMITATIONS.md](LIMITATIONS.md)
- **API 키**: 개인 발급 키이므로 저장소에 넣지 않습니다.
  `data-pipeline/.env.example` 을 같은 폴더의 `.env` 로 복사해 `API_KEY=` 에 본인 키를 넣어
  주세요(`.env` 는 `.gitignore` 에 등록돼 있고, 수집 스크립트가 `load_dotenv()` 로 읽습니다).

## 라이브러리

전부 각 저작권자가 배포하는 오픈소스이며, 원본을 수정하지 않고 패키지 매니저로 설치해
그대로 사용합니다. 버전은 실제 설치본 기준입니다.

### 웹 앱 (npm)

| 패키지 | 버전 | 라이선스 | 용도 |
|---|---|---|---|
| [react](https://react.dev/) | 19.2 | MIT | UI |
| [react-dom](https://react.dev/) | 19.2 | MIT | DOM 렌더러 |
| [react-router-dom](https://github.com/remix-run/react-router) | 7.18 | MIT | 화면 라우팅 |
| [zustand](https://github.com/pmndrs/zustand) | 5.0 | MIT | 상태 관리(게임·기후 스토어) |
| [three](https://threejs.org/) | 0.185 | MIT | 3D 행성 렌더링 |
| [@react-three/fiber](https://github.com/pmndrs/react-three-fiber) | 9.6 | MIT | three.js의 React 바인딩 |
| [@react-three/drei](https://github.com/pmndrs/drei) | 10.7 | MIT | three.js 헬퍼 |
| [lucide-react](https://lucide.dev) | 1.28 | ISC | 아이콘 |

빌드·개발 도구(배포본에 포함되지 않음): [vite](https://vite.dev) 8.1 (MIT),
[@vitejs/plugin-react](https://github.com/vitejs/vite-plugin-react) 6.0 (MIT),
[oxlint](https://oxc.rs) 1.75 (MIT), `@types/react`·`@types/react-dom` (MIT,
DefinitelyTyped).

### 데이터 파이프라인 (PyPI)

`data-pipeline/requirements.txt` 참고.

| 패키지 | 버전 | 라이선스 | 용도 |
|---|---|---|---|
| [requests](https://requests.readthedocs.io/) | 2.34 | Apache-2.0 | API 허브 호출 |
| [numpy](https://numpy.org/) | 2.5 | BSD-3-Clause (일부 0BSD/MIT/Zlib/CC0-1.0) | 수치 계산 |
| [pandas](https://pandas.pydata.org/) | 3.0 | BSD-3-Clause | 임계값 도출 |
| [python-dotenv](https://github.com/theskumar/python-dotenv) | 1.2 | BSD-3-Clause | `.env` 에서 API 키 읽기 |

`Scripts/legacy/` (옛 GK2A 위성 방식 재현용, 메인 파이프라인에는 필요 없음):
[xarray](https://xarray.dev/) 2026.7 (Apache-2.0),
[netCDF4](https://unidata.github.io/netcdf4-python/) 1.7 (MIT),
[pyproj](https://pyproj4.github.io/pyproj/) 3.7 (MIT).

## 폰트

**외부 폰트를 쓰지 않습니다.** 웹폰트를 불러오지 않고(`@font-face` 없음, Google Fonts 등
외부 폰트 CDN 링크 없음) 실행 환경의 시스템 폰트를 그대로 씁니다. 그래서 별도 폰트
라이선스가 없고, 오프라인에서도 글꼴이 깨지지 않습니다.

- 본문: 브라우저 기본 산세리프
- 숫자·수식·코드: `--mono: ui-monospace, Consolas, monospace` (`src/index.css`) — OS가 가진
  고정폭 폰트를 순서대로 시도합니다.

## 그 밖에

- 게임 코드·문제 데이터·해설 문구·SVG 도형(파비콘, 마스코트 대체 실루엣)은 이 프로젝트에서
  직접 만든 것입니다.
- 이모지는 저작물이 아니라 유니코드 문자이며, 실제 글리프는 실행 환경(OS·브라우저)이
  제공합니다.
