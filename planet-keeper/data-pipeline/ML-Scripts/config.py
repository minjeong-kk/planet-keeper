"""ML 파이프라인 공용 설정.

FEATURES 리스트만 수정하면 train_rf.py / evaluate.py / export_onnx.py /
inference.py는 전부 그대로 재사용할 수 있다.
"""

from pathlib import Path

# ── 피처 정의 (여기만 수정하면 됨) ─────────────────────────────────────
# 개발계획서 3쪽 데이터 표의 "ML 피처 여부: Input Feature" 4개와 정확히 일치한다.
# 복사량·에너지 계열(TOA/NSWRF/ASR/DLWRF)은 계획서에서 "ML 피처 아님"으로 명시돼 있다.
#
# ⚠️ deltaEnergy / outgoingRadiation / absorbedRadiation 을 여기 다시 넣지 말 것.
#    라벨(state)이 deltaEnergy와 temperature로 결정되므로, deltaEnergy가 입력에
#    들어가면 모델이 학습 대신 정답을 계산해버린다(정확도 0.9996이 나왔던 원인).
#    자세한 근거는 README '알려진 한계 7번' 참고.
FEATURES: list[str] = [
    "temperature",     # 현재 지표 온도(K) — 게임에서는 피드백 타이머가 움직인다
    "co2",             # CO2 농도(ppm) — 계획서 기준 배경 농도 432 ppm
    "surface_albedo",  # 지표면 반사도 — 천리안 SAL과 같은 정의(구름 제외)
    "atm_thickness",   # 대기 두께(1 = 지구 기준) — 계획서의 해면기압에 대응
]

LABEL_COLUMN: str = "state"

# 데이터셋에는 있지만 학습 입력으로 쓰면 안 되는 컬럼(라벨을 직접 결정하거나 그와
# 동등한 정보). 검증/디버깅 목적으로만 CSV에 남겨 둔다 - verify_sync.py가 이 컬럼이
# FEATURES에 섞여 들어가지 않았는지 검사한다.
LEAKY_COLUMNS: list[str] = [
    "delta_energy",
    "equilibrium_temperature",
    "albedo",
    "greenhouse_strength",
]

# ── 경로 ──────────────────────────────────────────────────────────────
ML_SCRIPTS_DIR = Path(__file__).resolve().parent
DATA_PIPELINE_DIR = ML_SCRIPTS_DIR.parent
DATASETS_DIR = DATA_PIPELINE_DIR / "Datasets"
MODELS_DIR = DATA_PIPELINE_DIR / "Models"

FINAL_DATASET = DATASETS_DIR / "final_ml_dataset.csv"
TEST_SPLIT_DATASET = DATASETS_DIR / "test_split.csv"

# 물리엔진 결과가 합쳐진 최종 데이터셋을 기본값으로 사용
CURRENT_DATASET = FINAL_DATASET

MODEL_PKL = MODELS_DIR / "climate_rf.pkl"
MODEL_ONNX = MODELS_DIR / "climate_rf.onnx"
CONFUSION_MATRIX_IMAGE = MODELS_DIR / "confusion_matrix.png"

# 게임이 실제로 받아 쓰는 배포 경로. export_onnx.py가 MODEL_ONNX와 함께 여기에도
# 쓴다 - 수동 복사를 잊어 배포본만 옛 모델로 남는 사고를 막기 위함.
PUBLIC_MODEL_ONNX = DATA_PIPELINE_DIR.parent / "public" / "models" / "climate_rf.onnx"

# derive_thresholds.py가 실측에서 도출한 라벨 임계값(label_rules.py가 읽음).
CLIMATE_THRESHOLDS = DATASETS_DIR / "climate_thresholds.json"

# ── 학습 설정 ─────────────────────────────────────────────────────────
RANDOM_STATE = 42
TEST_SIZE = 0.2
