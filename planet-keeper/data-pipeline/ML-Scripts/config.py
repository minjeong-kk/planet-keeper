"""ML 파이프라인 공용 설정.

FEATURES 리스트만 수정하면 train_rf.py / evaluate.py / export_onnx.py /
inference.py는 전부 그대로 재사용할 수 있다.
"""

from pathlib import Path

# ── 피처 정의 (여기만 수정하면 됨) ─────────────────────────────────────
# 실측 KIM/GK2A 변수 + 물리엔진(computeClimateV2) 출력.
FEATURES: list[str] = [
    "SAL",  # Black-Sky Albedo = 지표면 반사도
    "TPW",  # Total Precipitable Water = 가강수량
    "CLA",  # Cloud Amount = 구름량
    "SST",  # Sea Surface Temperature = 해수면온도
    "t2m",  # 기온(2m)
    "psl",  # 해면기압
    "co2",  # 시뮬레이션에 쓰인 CO2 농도(ppm)
    "absorbedRadiation",  # 물리엔진: ASR
    "outgoingRadiation",  # 물리엔진: OLR (현재 온도 기준)
    "deltaEnergy",        # 물리엔진: ASR - OLR
    "greenhouseStrength",  # 물리엔진
    "albedo",              # 물리엔진
]

LABEL_COLUMN: str = "state"

# ── 경로 ──────────────────────────────────────────────────────────────
ML_SCRIPTS_DIR = Path(__file__).resolve().parent
DATA_PIPELINE_DIR = ML_SCRIPTS_DIR.parent
DATASETS_DIR = DATA_PIPELINE_DIR / "Datasets"
MODELS_DIR = DATA_PIPELINE_DIR / "Models"

# 지금은 임시 데이터셋, 물리엔진 결과가 합쳐지면 FINAL_DATASET으로 바꿔서 사용
CURRENT_DATASET = DATASETS_DIR / "ml_dataset.csv"
FINAL_DATASET = DATASETS_DIR / "final_ml_dataset.csv"
TEST_SPLIT_DATASET = DATASETS_DIR / "test_split.csv"

MODEL_PKL = MODELS_DIR / "climate_rf.pkl"
MODEL_ONNX = MODELS_DIR / "climate_rf.onnx"
CONFUSION_MATRIX_IMAGE = MODELS_DIR / "confusion_matrix.png"

# ── 학습 설정 ─────────────────────────────────────────────────────────
RANDOM_STATE = 42
TEST_SIZE = 0.2
