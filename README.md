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

# ML 모델 학습 파이프라인

`data-pipeline/ML-Scripts/` 안에서 실행합니다.
(상대경로 `../Datasets`, `../Models` 기준)

```bash
cd data-pipeline/ML-Scripts

python3 derive_thresholds.py   # 실측 → 라벨 임계값 도출 (climate_thresholds.json)
python3 generate_dataset.py    # 물리엔진 합성 시뮬레이션 → final_ml_dataset.csv
python3 train_rf.py            # 분류 모델 학습 → climate_rf.pkl, test_split.csv
python3 export_onnx.py         # → Models/ 와 public/models/ 에 climate_rf.onnx 동시 저장
python3 evaluate.py            # test_split.csv로 성능 평가 → confusion_matrix.png
python3 verify_sync.py         # Python↔JS 동기화 검사 (마지막에 항상 실행)
```

> 이 순서대로 실행해야 임계값, 데이터셋, 모델, ONNX, 프론트 반영본이 서로 어긋나지 않습니다.
> ONNX는 `export_onnx.py`가 `public/models/`에도 직접 쓰므로 수동 복사가 필요 없습니다.
> 마지막 `verify_sync.py`가 실패하면 어딘가 어긋난 것이므로 머지하지 마세요.

## 실측 데이터와 합성 데이터의 역할

개발계획서 (2)의 구조를 그대로 따릅니다.

| | 쓰이는 곳 |
|---|---|
| **실측** (`ml_dataset.csv`, 기상청·천리안) | `derive_thresholds.py`가 '현대 지구형 안정 평형' 표준 범위(라벨 임계값)를 도출 |
| **합성** (`generate_dataset.py` + 물리엔진) | 게임에서 나올 수 있는 조성 × 온도를 넓게 훑어 학습 표본 생성 |

---

# 파일별 역할

| 파일 | 역할 |
|------|------|
| **config.py** | 피처 목록, 경로, 학습 설정을 모아둔 공용 설정. **`FEATURES`가 유일한 피처 정의 지점.** |
| **derive_thresholds.py** | 실측 t2m 분포에서 라벨 임계값을 도출해 `climate_thresholds.json`(Python용)과 `src/data/climateThresholds.js`(프론트용)에 저장. |
| **label_rules.py** | 도출된 임계값으로 5-class 라벨(state 0~4)을 매기는 규칙. 임계값을 직접 갖고 있지 않고 JSON에서 읽음. |
| **generate_dataset.py** | 슬라이더 조합과 현재 온도를 샘플링해 물리엔진에 돌리고, 클래스 균등화까지 해서 학습 데이터셋 생성. |
| **run_physics_engine.mjs** | `src/utils/physicsEngine.js`(JS)를 그대로 호출하기 위한 Node 브릿지. 피처와 라벨을 모두 여기서 계산. |
| **train_rf.py** | 분류 모델 학습(StandardScaler + MLP, 층화 8:2 분할), 모델(.pkl)과 테스트셋 저장. 파일명이 `_rf`인 이유는 8장 참고. |
| **export_onnx.py** | ONNX 변환 후 `Models/`와 `public/models/`에 동시 저장. |
| **evaluate.py** | 테스트셋으로 Accuracy / Precision / Recall / F1과 Confusion Matrix 이미지를 생성. |
| **verify_sync.py** | Python↔JS의 피처 목록·임계값·라벨 규칙이 일치하는지, 배포 ONNX가 최신인지 기계적으로 검사. |
| **inference.py** | ONNX 모델로 CSV 한 행을 추론해보는 디버깅용 스크립트. |

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

## 2. 머신러닝 학습 데이터의 한계

- `ml_dataset.csv`는 KMA API 조회 기간(최대 약 180일)의 제약을 받습니다.
- 모든 계절을 포함하지 못하며, 특정 기간의 실제 기상 특성을 반영합니다.

---

## 3. CO₂ 데이터 시차

- CO₂는 기후변화감시소의 실측 자료를 사용합니다.
- KIM/GK2A 데이터보다 약 1~2년 이전 자료를 사용하지만, CO₂는 단기간 변화가 비교적 작아 근사값으로 활용합니다.

---

## 4. 이상 기후 데이터

- 온실폭주(Runaway Greenhouse), 스노우볼(Snowball), 극한 고온·저온 등 실제 관측이 어려운 기후 상태는 물리 엔진을 이용한 합성 데이터로 생성합니다.
- 따라서 해당 클래스의 품질은 물리 엔진 모델의 정확도에 의존합니다.

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

## 7. 분류 모델 성능 지표의 해석

현재 성능은 다음과 같습니다.

| 항목 | 값 |
|---|---|
| Accuracy (층화 8:2 분할) | **0.9694** |
| Macro F1 | 0.9693 |
| 클래스 수 / 찍기 기준선 | 5개 / 0.2000 |
| ONNX 크기 | **7.0 KB** (파라미터 1,413개) |
| 불평형 오판율 | 5.0% |

클래스별 recall: 저온불평형 0.95 / 저온안정 0.97 / 지구형안정 1.00 / 고온안정 0.98 / 고온불평형 0.95

- 이 모델은 **물리 엔진이 계산한 상태를 관측 가능한 변수만으로 추정**하는 문제를 풉니다.
  라벨을 직접 결정하는 `deltaEnergy`는 **의도적으로 입력에서 제외**했습니다.
- 정확도가 높은 이유는 라벨을 정하는 식(`ΔE = S(1−albedo) − (1−greenhouse)·σ·T⁴`)이
  결정론적 함수이고, 신경망이 이 매끄러운 곡면을 잘 근사하기 때문입니다.
  피처 5개를 조합하면 `albedo = min(0.9, surface_albedo + 0.5×cloud)` 로 복원되므로
  `deltaEnergy`도 계산 가능합니다.
  **즉 이 모델은 물리 규칙을 근사한 것이며, 규칙에 없는 정보를 추가하지는 않습니다.**
  물리 엔진 규칙과의 일치율은 0.9720입니다.
- 이는 개발계획서가 전제한 구조입니다 — *"물리 엔진 수식과 연동해 극단적 이상 기후
  합성 데이터를 추가 생성한다"*. 따라서 정확도를 모델의 예측 능력으로 홍보하지 않고
  아래 표현을 사용합니다.

> "기상청·천리안 실측으로 정의한 '현대 지구형 안정 평형' 표준 범위를
> 브라우저에서 0.01초 내에 실시간 판정하는 경량 ONNX 분류기"

---

## 8. 계획서와 달라진 점 (2건)

### ① 모델 계열: RandomForest → MLP

계획서 (2)①은 RandomForest를 명시했고 초기 구현도 그랬으나, 측정 결과 이 문제에
맞지 않아 교체했습니다.

라벨 경계가 `σ·T⁴`와 `log₂(CO₂)`가 섞인 **매끄러운 곡면**인데, RandomForest는 축에
평행한 계단으로만 자릅니다. 곡면을 근사하려면 노드가 수만 개 필요하고 그래도 잘
맞지 않습니다. 신경망은 연속 함수라 가중치 1,413개로 같은 경계를 표현합니다.

| 모델 (피처 5개) | 정확도 | ONNX | 불평형 오판율 |
|---|---|---|---|
| RandomForest(10, 깊이8) | 0.7513 | 272.6 KB | 54.6% |
| RandomForest(30, 깊이12) | 0.8236 | 6,079.8 KB | 39.9% |
| GradientBoosting(100) | 0.7966 | 276.7 KB | 47.0% |
| **MLP(32, 32)** | **0.9694** | **7.0 KB** | **5.0%** |

**정확도가 오르면서 파일이 39배 작아집니다.** 7 KB는 계획서가 명시한 "수십 KB"
기준도 충족합니다 — RandomForest로는 맞출 수 없었던 기준입니다.

파일명(`train_rf.py` / `climate_rf.pkl` / `climate_rf.onnx`)은 README·프론트 경로에서
이미 참조하고 있어 그대로 두었습니다. 이름만 과거형이고 내용은 MLP입니다.

### ② 피처: 4개 → 5개 (`cloud` 추가)

구름량이 없으면 모델이 평형온도를 **평균 10.96 K 오차**로만 추정할 수 있는데,
평형/불평형 판정 기준선은 약 **±4.6 K**입니다. 재려는 대상보다 측정 오차가 2배 커서
불평형 판정이 원리적으로 불가능했습니다.

| | 피처 4개 | 피처 5개(+cloud) |
|---|---|---|
| 평형온도 추정 오차 | 10.96 K | **3.89 K** |
| 불평형 오판율 | 61.7% | **5.0%** |

불평형 오판율 61.7%는 **실제로 온도가 변하는 중인 행성의 62%를 "안정"이라고 잘못
알려주는 것**이므로, 에너지 평형을 가르치는 게임에서는 그대로 둘 수 없었습니다.

구름량은 계획서의 알베도 공식(구름 × 0.5)에도 들어가는 1급 변수이고, 게임 슬라이더가
정확히 알고 있어 학습–추론 불일치도 생기지 않습니다.

### 참고: ML 결과와 게임 승패 판정

계획서 창의성 항목은 *"ML 분류 결과가 게임 판정(클리어 조건)에 직접 반영"*이라고
적고 있습니다. 다만 승패 판정은 물리 엔진(ΔE 계산)이 담당하는 것이 안전합니다 —
물리 엔진은 100% 정확하고 즉시 계산되며, ML은 어디까지나 근사이기 때문입니다.

### 이전 버전(정확도 0.9996)과의 차이

초기 구현에서는 `deltaEnergy`와 `outgoingRadiation`이 입력 피처에 포함되어 있었습니다.
라벨이 `deltaEnergy`·`temperature`만의 결정론적 함수였으므로, 모델은 정답을 그대로
읽고 있었습니다(데이터셋 10,825행 전부에서 규칙이 라벨을 100% 재현).
당시 정확도 0.9996은 성능이 아니라 라벨 누수의 신호였습니다.

지금은 정확도가 비슷해 보이지만 성격이 다릅니다.

| | 이전 | 현재 |
|---|---|---|
| 입력에 정답 변수 | **포함** (`deltaEnergy`) | 제외 |
| 정확도의 의미 | 정답을 읽음 | 물리 공식을 근사함 |
| 실측 데이터 역할 | 거의 없음 (중요도 0.02) | 라벨 임계값 도출 |

> `verify_sync.py`가 이 구조를 매번 검사합니다. `FEATURES`에 `deltaEnergy`,
> `outgoingRadiation`, `absorbedRadiation`, `albedo`, `greenhouse_strength`가
> 들어가면 실패합니다.

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