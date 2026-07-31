# planet-keeper
An educational climate game to reach planetary equilibrium through environmental control and science quizzes.

## 데이터 수집 스크립트 설치
```

python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt

```

## ML 모델 학습 파이프라인
`data-pipeline/ML-Scripts/` 안에서 실행합니다(상대경로 `../Datasets`, `../Models` 기준).

```
cd data-pipeline/ML-Scripts

python3 generate_dataset.py   # 실측 데이터 + 물리엔진 시뮬레이션 → final_ml_dataset.csv
python3 train_rf.py           # RandomForest 학습 → climate_rf.pkl, test_split.csv
python3 export_onnx.py        # climate_rf.pkl → climate_rf.onnx (브라우저용 변환)
python3 evaluate.py           # test_split.csv로 성능 평가 → confusion_matrix.png

cp ../Models/climate_rf.onnx ../../public/models/climate_rf.onnx  # 게임(프론트)에 반영
```

`train_rf.py`/`export_onnx.py`/`evaluate.py`를 수정했으면 이 순서대로 다시 실행해야
모델·ONNX·평가 결과·프론트 반영본이 서로 어긋나지 않습니다.

### 파일별 역할
- **config.py** — 피처 목록, 경로, 학습 설정을 모아둔 공용 설정. 이 파일만 고치면 나머지 스크립트는 그대로 재사용됨.
- **label_rules.py** — 물리엔진 출력(deltaEnergy·온도)으로 5-class 라벨(state 0~4)을 매기는 규칙.
- **generate_dataset.py** — 실측 데이터 각 행마다 슬라이더 조합을 무작위로 만들어 물리엔진에 돌리고, 라벨까지 붙여 최종 학습 데이터셋을 만듦.
- **run_physics_engine.mjs** — generate_dataset.py가 `src/utils/physicsEngine.js`(JS)를 그대로 호출하기 위한 Node 브릿지.
- **train_rf.py** — RandomForest 학습, 8:2로 나눠 모델(.pkl)과 테스트셋을 저장.
- **export_onnx.py** — 학습된 모델을 브라우저에서 쓸 수 있게 ONNX로 변환.
- **evaluate.py** — 테스트셋으로 Accuracy/Precision/Recall/F1과 Confusion Matrix 이미지를 생성.
- **inference.py** — ONNX 모델로 CSV 한 행을 추론해보는 디버깅용 스크립트.

## 알려진 한계 (Known Limitations)
### 1. Physics Engine 기준값의 한계
- `physics_reference.csv`는 최근 7일 평균 데이터를 기반으로 생성됩니다.
- 특정 계절과 동아시아(GK2A 관측 영역) 데이터를 사용하므로, 전 지구 연평균이 아닌 해당 기간·지역의 대표값입니다.
- 따라서 절대적인 지구 기준값이 아닌, 물리 엔진 계산을 위한 기준값으로 사용합니다.

### 2. 머신러닝 학습 데이터의 한계
- `ml_dataset.csv`는 KMA API 조회 기간(최대 약 180일)의 제약을 받습니다.
- 모든 계절을 포함하지 못하며, 특정 기간의 실제 기상 특성을 반영합니다.

### 3. CO₂ 데이터 시차
- CO₂는 기후변화감시소의 실측 자료를 사용합니다.
- KIM/GK2A 데이터보다 약 1~2년 이전 자료를 사용하지만, CO₂는 단기간 변화가 비교적 작아 근사값으로 활용합니다.

### 4. 이상 기후 데이터
- 온실폭주(Runaway Greenhouse), 스노우볼(Snowball), 극한 고온·저온 등 실제 관측이 어려운 기후 상태는 물리 엔진을 이용한 합성 데이터로 생성합니다.
- 따라서 해당 클래스의 품질은 물리 엔진 모델의 정확도에 의존합니다.

### 5. 위성 데이터 격자 매칭
- GK2A 산출물(SAL, TPW, CLA 등)은 서로 다른 공간 해상도를 가지므로, 최근접 이웃(Nearest Neighbor) 방식으로 동일 위치를 매칭합니다.
- 이 과정에서 작은 공간 오차가 발생할 수 있습니다.

### 6. SWRAD(태양복사) 평균값 편향
- 계산된 SWRAD 평균은 일반적으로 알려진 지구 평균(약 240 W/m²)보다 높게 나타날 수 있습니다.
- 주요 원인은 다음과 같습니다.
  - 여름철 및 동아시아 영역 중심의 자료를 사용하여 계절·지역 편향이 존재함
  - 위성 영상의 픽셀을 동일 가중치로 평균하여, 실제 면적보다 저위도(태양복사가 강한 지역)의 영향이 크게 반영됨
- 본 프로젝트에서는 절대적인 전 지구 평균을 재현하기보다, 물리 엔진 계산을 위한 대표 기준값으로 활용합니다.

## Assets & Licensing
All textures are bundled locally (not hot-linked) to avoid runtime/CORS dependency.
- **Earth day map** (`public/assets/earth.jpg`) — "Earth Day Map" (2k) by
  **Solar System Scope**, **CC BY 4.0**. https://www.solarsystemscope.com/textures/
- **Earth clouds** (`public/assets/earth-clouds.jpg`) — "Earth Clouds" (2k) by
  **Solar System Scope**, **CC BY 4.0**. https://www.solarsystemscope.com/textures/
- **Earth elevation / height map** (`public/assets/earth-height.jpg`) — grayscale
  elevation map derived from **NASA Visible Earth** (Public Domain), via
  `turban/webgl-earth` (MIT). https://github.com/turban/webgl-earth
- CC BY 4.0 license: https://creativecommons.org/licenses/by/4.0/
- **Atmosphere / CO₂ glow:** the Fresnel rim-glow *shader technique* from public
  Three.js examples (a technique, not a copyrighted asset).
