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
python3 train_rf.py            # RandomForest 학습 → climate_rf.pkl, test_split.csv
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
| **train_rf.py** | RandomForest 학습(층화 8:2 분할), 모델(.pkl)과 테스트셋 저장. 트리 크기를 제한해 ONNX 용량을 관리. |
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
| Accuracy (층화 8:2 분할) | **0.7635** |
| Macro F1 | 0.7464 |
| 클래스 수 / 찍기 기준선 | 5개 / 0.2000 |
| ONNX 크기 | 273.7 KB |

- 이 모델은 **물리 엔진이 계산한 상태를 관측 가능한 변수만으로 추정**하는 문제를 풉니다.
  입력은 `temperature`, `co2`, `surface_albedo`, `atm_thickness` 4개이며,
  라벨을 직접 결정하는 `deltaEnergy`는 **의도적으로 입력에서 제외**했습니다.
- 정확도가 100%에 도달하지 않는 것이 정상입니다. `surface_albedo`는 천리안 SAL과 같이
  **구름을 제외한** 지표면 반사도이므로, 구름량이 모델에게 보이지 않는 변수로 남습니다.
  실제 위성 관측이 구름 아래 상태를 완전히 알 수 없는 것과 같은 구조입니다.
- 물리 엔진의 규칙 판정과 ML 예측의 일치율은 **0.8167**입니다. 즉 ML은 규칙을 그대로
  복사하는 것이 아니라 불확실한 영역에서 독립적인 판단을 내립니다.

### 이전 버전(정확도 0.9996)과의 차이

초기 구현에서는 `deltaEnergy`와 `temperature`가 모두 입력 피처에 포함되어 있었습니다.
라벨이 이 두 값만의 결정론적 함수였으므로, 모델은 학습이 아니라 정답을 계산하고
있었습니다(데이터셋 10,825행 전부에서 규칙이 라벨을 100% 재현). 당시 정확도 0.9996은
성능이 아니라 라벨 누수의 신호였습니다.

누수를 제거하면서 정확도가 낮아졌고 모델 크기는 커졌습니다. 정답을 볼 수 없게 되어
결정 경계를 실제로 근사해야 하기 때문이며, 두 변화 모두 의도된 결과입니다.

> `verify_sync.py`가 이 구조를 매번 검사합니다. `FEATURES`에 `deltaEnergy` 계열이
> 다시 들어가면 실패합니다.

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