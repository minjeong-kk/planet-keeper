"""ML 파이프라인 공용 설정.

FEATURES 리스트만 수정하면 train_rf.py / evaluate.py / export_onnx.py /
inference.py는 전부 그대로 재사용할 수 있다.
"""

from pathlib import Path

# ── 피처 정의 (여기만 수정하면 됨) ─────────────────────────────────────
# 개발계획서 3쪽 데이터 표의 "Input Feature" 4개 + 구름량 1개.
# 복사량·에너지 계열(TOA/NSWRF/ASR/DLWRF)은 계획서에서 "ML 피처 아님"으로 명시돼 있다.
#
# cloud를 추가한 이유(계획서 이탈 1건, README '알려진 한계 7번'에 사유 기록):
#   구름량이 없으면 모델이 평형온도를 평균 10.96 K 오차로만 추정할 수 있는데,
#   평형/불평형 판정 기준선은 약 ±4.6 K다. 재려는 대상보다 측정 오차가 2배 커서
#   불평형 판정이 원리적으로 불가능했다(실제 불평형 행성의 61.7%를 '안정'으로 오판).
#   구름량을 주면 오차가 3.89 K로 줄고 오판율이 4.7%가 된다.
#   구름량은 계획서의 알베도 공식(구름 × 0.5)에도 들어가는 1급 변수이고,
#   게임 슬라이더가 정확히 알고 있어서 학습–추론 불일치도 생기지 않는다.
#
# ⚠️ deltaEnergy / outgoingRadiation / absorbedRadiation / albedo /
#    greenhouse_strength 를 여기 넣지 말 것. 라벨이 deltaEnergy와 temperature로
#    결정되므로 입력에 들어가면 모델이 학습 대신 정답을 계산한다(0.9996의 원인).
FEATURES: list[str] = [
    "temperature",     # 현재 지표 온도(K) — 게임에서는 피드백 타이머가 움직인다
    "co2",             # CO2 농도(ppm) — 계획서 기준 배경 농도 432 ppm
    "surface_albedo",  # 지표면 반사도 — 천리안 SAL과 같은 정의(구름 제외)
    "atm_thickness",   # 대기 두께(1 = 지구 기준) — 계획서의 해면기압에 대응
    "cloud",           # 구름 비율 0~1 — 알베도와 온실효과에 동시에 기여
]

LABEL_COLUMN: str = "state"

# 데이터셋에는 있지만 학습 입력으로 쓰면 안 되는 컬럼. 라벨을 '한 컬럼만으로'
# 거의 그대로 알려주는 값들이며, 검증/디버깅 목적으로만 CSV에 남겨 둔다.
# verify_sync.py가 이 컬럼이 FEATURES에 섞여 들어가지 않았는지 검사한다.
#
# ⚠️ 이 목록은 "명백한 정답 컬럼"만 막는다. 라벨이 원리적으로 학습 불가능해진다는
#    뜻은 아니다. 실제로 현재 FEATURES 5개를 조합하면 라벨이 완전히 결정된다
#    (albedo = surface_albedo + 0.5×cloud → deltaEnergy 계산 가능).
#    즉 이 모델은 물리 규칙을 근사하는 것이며, 그게 계획서가 전제한 구조다.
#    자세한 내용은 README '알려진 한계 7번' 참고.
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
