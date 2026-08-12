# planet-keeper

An educational climate game to reach planetary equilibrium through environmental control and science quizzes.

---

# 데이터 수집 스크립트 설치

```bash
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
```

---

# 데이터 파이프라인

실측 데이터를 수집해 물리 엔진의 판정 임계값을 도출합니다.

```bash
# 1. 실측 수집 (API 키 필요, .env 참고)
cd data-pipeline/Scripts
python3 ml-gk2a.py             # 천리안 산출물 + 좌표 앵커 → ml_gk2a_dataset.csv
python3 ml-kim.py              # 같은 좌표의 KIM t2m/psl → ml_dataset.csv
python3 physics-kim.py         # KIM 전지구 필드 평균 → physics_kim_dataset.csv
python3 physics-gk2a.py        # 천리안 SWRAD 평균 → physics_gk2a_dataset.csv
python3 physics-merge.py       # 위 결과 + CO2 병합 → physics_reference.csv

# 2. 임계값 도출
cd ../ML-Scripts
python3 derive_thresholds.py   # 실측 t2m 분포 → climate_thresholds.json
                               #                + src/data/climateThresholds.js
```

> `derive_thresholds.py`가 두 출력 파일의 **유일한 생성자**입니다. 값이 어긋날 수 없는
> 구조이므로 별도의 동기화 검사가 필요 없습니다.

## 실측 데이터가 쓰이는 경로

```
ml_dataset.csv (KIM t2m, 1,498지점)
        │
        └─ derive_thresholds.py ─→ COLD_STABLE_MAX_K / EARTH_LIKE_MAX_K
                                            │
                                            └─→ physicsEngine.planetStateOf()
                                                 (게임의 5분류 판정)
```

---

# 파일별 역할

| 파일 | 역할 |
|------|------|
| **Scripts/ml-gk2a.py** | 천리안(GK2A) 산출물을 받고, 정지궤도 투영으로 위경도를 계산해 표본 좌표를 만듦. |
| **Scripts/ml-kim.py** | 위 좌표와 같은 지점·시각의 KIM 수치모델 `t2m`/`psl`을 조회해 1:1 매칭. |
| **Scripts/physics-kim.py** | KIM 전지구 필드 평균(복사 5변수)을 월별로 수집. |
| **Scripts/physics-gk2a.py** | 천리안 SWRAD(지면 흡수단파) 전지구 평균을 월별로 수집. |
| **Scripts/physics-merge.py** | 위 둘과 CO₂ 실측을 합쳐 `physics_reference.csv` 생성. |
| **ML-Scripts/config.py** | 데이터 파이프라인 공용 경로 상수. |
| **ML-Scripts/derive_thresholds.py** | 실측 t2m 분포에서 판정 임계값을 도출해 `climate_thresholds.json`(기록용)과 `src/data/climateThresholds.js`(프론트가 import)에 저장. |

> 폴더 이름 `ML-Scripts/`는 분류 모델을 제거하기 전의 이름입니다(7장 참고).
> 파일명 `ml-*.py` / `ml_dataset.csv` 도 마찬가지로 과거형이며, 실제 내용은 실측 수집·임계값 도출입니다.

---

# 알려진 한계 (Known Limitations)

## 1. Physics Engine 기준값의 한계

- `physics_reference.csv`는 최근 7일 평균 데이터를 기반으로 생성됩니다.
- 특정 계절과 동아시아(GK2A 관측 영역) 데이터를 사용하므로, 전 지구 연평균이 아닌 해당 기간·지역의 대표값입니다.
- 따라서 절대적인 지구 기준값이 아닌, 물리 엔진 계산을 위한 기준값으로 사용합니다.

### 기준 알베도

기준 조성(빙하 10% / 바다 70% / 구름 30%)의 행성 알베도는 **0.28**입니다.

```
지표면분 0.130  +  구름분 0.150  =  0.280      (실제 지구 ≈ 0.30)
```

구름 계수는 개발계획서 (3)1의 알베도 공식(구름량 × 0.5)을 따릅니다. 초기 구현은 0.3을
써서 기준 알베도가 0.22였고, 계획서 데이터 표의 지구 평균 0.30과 어긋났습니다.
지표면분(0.130)은 실제 지구와 이미 일치했으므로 어긋난 항은 구름 기여 하나였습니다.

> 물리 엔진은 기준 조성이 288 K에서 에너지 평형이 되도록 유효 σ를 자동 보정하므로,
> 알베도 절대값이 바뀌어도 평형 기준점(288 K)은 유지됩니다.
> 다만 구름 슬라이더의 영향력이 약 2배가 되어 게임 전체가 이전보다 차가워집니다.

---

## 2. 실측 데이터의 한계

- `ml_dataset.csv`는 KMA API 조회 기간(최대 약 180일)의 제약을 받습니다.
- 모든 계절을 포함하지 못하며, 특정 기간의 실제 기상 특성을 반영합니다.
- 표본 좌표가 천리안 관측 영역(동아시아·서태평양) 안에 있어 여름철·저위도로 치우쳐
  있습니다. 그래서 `derive_thresholds.py`는 관측 **평균**을 쓰지 않고 **분포의 폭(IQR)**
  만 가져오며, 중심은 계획서 기준값 288.15 K에 고정합니다.

---

## 3. CO₂ 데이터 시차

- CO₂는 기후변화감시소의 실측 자료를 사용합니다.
- KIM/GK2A 데이터보다 약 1~2년 이전 자료를 사용하지만, CO₂는 단기간 변화가 비교적 작아 근사값으로 활용합니다.

---

## 4. 이상 기후 상태

- 온실폭주(Runaway Greenhouse), 스노우볼(Snowball), 극한 고온·저온 등 실제 관측이 어려운 기후 상태는 물리 엔진이 직접 계산합니다.
- 따라서 해당 상태의 품질은 물리 엔진 모델(0차원 에너지 수지)의 타당성에 의존합니다.

---

## 5. 위성 데이터 격자 매칭

- GK2A 산출물(SAL, TPW, CLA 등)은 서로 다른 공간 해상도를 가지므로, 최근접 이웃(Nearest Neighbor) 방식으로 동일 위치를 매칭합니다.
- 이 과정에서 작은 공간 오차가 발생할 수 있습니다.

---

## 6. SWRAD(태양복사) 평균값 편향

- 계산된 SWRAD 평균은 일반적으로 알려진 지구 평균(약 240 W/m²)보다 높게 나타날 수 있습니다.
- 주요 원인은 다음과 같습니다.
  - 여름철 및 동아시아 영역 중심의 자료를 사용하여 계절·지역 편향이 존재함
  - 위성 영상의 픽셀을 동일 가중치로 평균하여, 실제 면적보다 저위도(태양복사가 강한 지역)의 영향이 크게 반영됨
- 본 프로젝트에서는 절대적인 전 지구 평균을 재현하기보다, 물리 엔진 계산을 위한 대표 기준값으로 활용합니다.

---

## 7. 분류 모델(ML)을 제거한 이유

계획서 (2)①은 ML 분류기를 명시했고, 실제로 구현해 **정확도 0.9694**까지 확보했습니다.
그러나 성능을 측정하는 과정에서 **라벨이 입력 피처만으로 완전히 결정된다**는 사실이
드러나 최종적으로 제거했습니다.

피처 5개를 조합하면 알베도가 그대로 복원되고,

```
albedo = min(0.9, surface_albedo + 0.5 × cloud)
ΔE     = S(1 − albedo) − (1 − greenhouse) · σ · T⁴
```

라벨을 정하는 `ΔE`까지 계산됩니다. 즉 모델은 **게임이 이미 정확히 계산할 수 있는
함수를 근사**하고 있었고, 물리 엔진 규칙과의 일치율은 0.9720이었습니다.
**나머지 2.8%는 모델이 틀린 것입니다.**

지금은 `src/utils/physicsEngine.js`의 `planetStateOf()`가 같은 판정을 정확값으로
수행합니다.

| | 제거 전 (ONNX) | 제거 후 (물리 엔진) |
|---|---|---|
| 물리 규칙 일치율 | 0.9720 | **1.0000** |
| 번들 크기 | wasm 13 MB + 모델 7 KB | **0** |
| 판정 방식 | 비동기 (모델 로드 후 추론) | **동기, 즉시** |
| 학습 파이프라인 | 스크립트 8개 + 합성 52,056행 | **불필요** |

### 제거 전까지의 모델 탐색 기록

계획서가 명시한 RandomForest가 이 문제에 맞지 않는다는 것도 이 과정에서 확인했습니다.
라벨 경계가 `σ·T⁴`와 `log₂(CO₂)`가 섞인 **매끄러운 곡면**인데, RandomForest는 축에
평행한 계단으로만 자릅니다. 신경망은 연속 함수라 가중치 1,413개로 같은 경계를
표현했습니다.

| 모델 (피처 5개) | 정확도 | ONNX | 불평형 오판율 |
|---|---|---|---|
| RandomForest(10, 깊이8) | 0.7513 | 272.6 KB | 54.6% |
| RandomForest(30, 깊이12) | 0.8236 | 6,079.8 KB | 39.9% |
| GradientBoosting(100) | 0.7966 | 276.7 KB | 47.0% |
| MLP(32, 32) | 0.9694 | 7.0 KB | 5.0% |

모델 계열을 바꿔가며 정확도를 0.75 → 0.97까지 끌어올린 뒤에야, **애초에 근사할
필요가 없는 문제**였다는 결론에 도달했습니다.

### 실측 데이터는 그대로 쓰입니다

ML을 걷어내도 실측 데이터의 소비 경로는 유지됩니다. 학습에 쓰이던 52,056행은
**물리 엔진이 만든 합성 데이터**였고, 실측 `t2m` 1,498지점은 지금도 게임의 판정
임계값을 결정합니다(위 "실측 데이터가 쓰이는 경로" 참고).

---

## 8. 계획서와 달라진 점

### ML 분류기 제거 (7장)

계획서 (2)①의 ML 분류기를 구현했다가 제거했습니다. 창의성 항목의
*"ML 분류 결과가 게임 판정(클리어 조건)에 직접 반영"* 도 함께 해당됩니다.

판정은 물리 엔진(`planetStateOf`)이 담당합니다 — 100% 정확하고 즉시 계산되며,
ML은 그 규칙의 근사일 뿐이었기 때문입니다. 계획서가 요구한 **"실측으로 정의한
'현대 지구형 안정 평형' 표준 범위로 행성 상태를 5분류 판정"** 이라는 기능 자체는
그대로 유지되며, 그 판정을 근사 모델이 아니라 정확한 계산으로 수행합니다.

### 참고: 라벨 누수를 겪은 이력

초기 구현에서는 `deltaEnergy`와 `outgoingRadiation`이 입력 피처에 포함되어 있었고,
당시 정확도 0.9996은 성능이 아니라 **라벨 누수의 신호**였습니다. 이 변수들을 빼서
0.9694를 얻었지만, 결국 남은 피처 5개만으로도 라벨이 복원된다는 것을 확인하고
모델 자체를 걷어냈습니다(7장).

이 이력이 남긴 결론은 그대로 유효합니다 — **라벨을 결정하는 값을 입력에 넣으면
모델은 학습하지 않고 정답을 읽는다.**

---

# Assets & Licensing

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