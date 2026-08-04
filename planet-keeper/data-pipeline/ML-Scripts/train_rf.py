"""기후 분류 모델 학습 스크립트.

Datasets/의 CSV(FEATURES + LABEL_COLUMN 컬럼 필요)를 읽어 8:2로 나누고
학습한 뒤 Models/climate_rf.pkl로 저장한다.

파일명·산출물명이 `_rf`인 이유
------------------------------
개발계획서는 RandomForest를 명시했고 초기 구현도 그랬지만, 측정 결과 이 문제에는
RandomForest가 맞지 않아 작은 신경망(MLP)으로 교체했다(아래 '모델 선택' 참고).
파일명(train_rf.py / climate_rf.pkl / climate_rf.onnx)은 README·계획서·프론트
경로에서 이미 참조하고 있어 그대로 두었다. 이름만 과거형이고 내용은 MLP다.

모델 선택
---------
라벨을 정하는 식은 ΔE = S(1−albedo) − (1−greenhouse)·σ·T⁴ 이고, 이건 매끄러운
곡면이다. RandomForest는 축에 평행한 계단으로만 자르므로 이 곡면을 근사하려면
노드가 수만 개 필요하고, 그래도 잘 안 맞는다. 신경망은 연속 함수라 가중치 수백
개로 같은 경계를 표현한다.

실측 비교 (final_ml_dataset.csv, 피처 5개):

    모델                      정확도   ONNX 크기   불평형 오판율
    RandomForest(10, 깊이8)   0.7513    272.6 KB     54.6%
    RandomForest(30, 깊이12)  0.8236   6,079.8 KB    39.9%
    GradientBoosting(100)     0.7966    276.7 KB     47.0%
    MLP(32, 32)               0.9694      7.0 KB      5.0%   ← 현재 설정
    MLP(128, 128)             0.9765     71.5 KB      2.2%

정확도가 오르면서 파일이 39배 작아진다. 7 KB는 계획서가 명시한 "수십 KB" 기준도
충족한다(RandomForest로는 맞출 수 없었다).

입력 스케일이 서로 크게 다르므로(온도 ~10², CO2 ~10³, 알베도 ~10⁰) StandardScaler를
파이프라인 앞에 붙인다. 스케일링도 ONNX에 함께 들어가므로 프론트에서 따로 할 일은 없다.

분할 방식
---------
클래스 비율을 유지하는 층화 분할(stratified)을 쓴다. 예전에는 실측 위치 단위
그룹 분할(GroupShuffleSplit)을 썼는데, 그때는 한 실측 위치에서 슬라이더만 바꿔
여러 행을 만들었기 때문에 같은 위치의 행이 train/test에 섞이는 누수가 있었다.
지금은 generate_dataset.py가 (조성 × 온도)를 매 행 독립적으로 샘플링하므로
'같은 위치'라는 개념 자체가 없고, 그룹 분할을 쓸 근거가 사라졌다.

피처 목록은 config.py 한 곳에서만 관리한다.

사용법:
    python3 train_rf.py                       # config.CURRENT_DATASET 사용
    python3 train_rf.py --dataset ../Datasets/final_ml_dataset.csv
"""

import argparse
import logging
import pickle
import sys
from pathlib import Path

import pandas as pd
from sklearn.model_selection import train_test_split
from sklearn.neural_network import MLPClassifier
from sklearn.pipeline import make_pipeline
from sklearn.preprocessing import StandardScaler

import config

logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(message)s")
logger = logging.getLogger(__name__)

# 은닉층 크기. 키우면 정확도가 아주 조금 오르고 ONNX가 커진다(위 표 참고).
HIDDEN_LAYERS = (32, 32)
MAX_ITER = 800


def load_dataset(csv_path: Path) -> pd.DataFrame:
    """CSV를 읽고 FEATURES/LABEL_COLUMN이 전부 있는지 검증한다."""
    if not csv_path.exists():
        raise FileNotFoundError(f"데이터셋을 찾을 수 없습니다: {csv_path}")

    df = pd.read_csv(csv_path)

    missing_features = [c for c in config.FEATURES if c not in df.columns]
    if missing_features:
        raise ValueError(
            f"데이터셋에 없는 피처 컬럼: {missing_features}\n"
            f"config.py의 FEATURES와 CSV 컬럼명이 일치하는지 확인하세요."
        )

    if config.LABEL_COLUMN not in df.columns:
        raise ValueError(
            f"라벨 컬럼 '{config.LABEL_COLUMN}'이 데이터셋에 없습니다. "
            f"generate_dataset.py를 먼저 실행하세요."
        )

    return df


def split_features_labels(df: pd.DataFrame) -> tuple[pd.DataFrame, pd.Series]:
    """FEATURES/LABEL 분리. 결측치가 있는 행은 제거한다."""
    subset = df[config.FEATURES + [config.LABEL_COLUMN]].dropna()
    dropped = len(df) - len(subset)
    if dropped:
        logger.info(f"결측치로 제외된 행: {dropped}개")

    return subset[config.FEATURES], subset[config.LABEL_COLUMN]


def train_model(X_train: pd.DataFrame, y_train: pd.Series):
    """StandardScaler + MLP 파이프라인. 스케일링도 ONNX에 함께 들어간다."""
    model = make_pipeline(
        StandardScaler(),
        MLPClassifier(
            hidden_layer_sizes=HIDDEN_LAYERS,
            max_iter=MAX_ITER,
            random_state=config.RANDOM_STATE,
        ),
    )
    model.fit(X_train, y_train)

    mlp = model[-1]
    n_params = sum(w.size for w in mlp.coefs_) + sum(b.size for b in mlp.intercepts_)
    logger.info(
        f"MLP 은닉층 {HIDDEN_LAYERS}, 학습 반복 {mlp.n_iter_}회, 파라미터 {n_params:,}개"
    )
    if mlp.n_iter_ >= MAX_ITER:
        logger.warning(
            f"최대 반복({MAX_ITER})에 도달했습니다 - 수렴하지 않았을 수 있습니다. "
            f"MAX_ITER를 늘려보세요."
        )
    return model


def save_model(model, path: Path) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    with open(path, "wb") as f:
        pickle.dump(model, f)
    logger.info(f"모델 저장 완료: {path}")


def save_test_split(X_test: pd.DataFrame, y_test: pd.Series, path: Path) -> None:
    """evaluate.py가 재사용할 수 있도록 테스트셋을 그대로 저장한다."""
    path.parent.mkdir(parents=True, exist_ok=True)
    X_test.assign(**{config.LABEL_COLUMN: y_test.values}).to_csv(path, index=False)
    logger.info(f"테스트셋 저장: {path}")


def main(dataset_path: Path) -> None:
    logger.info(f"데이터셋 로드: {dataset_path}")
    df = load_dataset(dataset_path)

    leaked = [c for c in config.LEAKY_COLUMNS if c in config.FEATURES]
    if leaked:
        raise ValueError(
            f"라벨을 직접 결정하는 컬럼이 FEATURES에 들어 있습니다: {leaked}\n"
            f"이 컬럼이 입력에 있으면 모델이 학습 대신 정답을 계산합니다. "
            f"config.py의 FEATURES에서 제거하세요."
        )

    X, y = split_features_labels(df)
    n_classes = y.nunique()
    logger.info(
        f"학습 가능한 행 {len(X):,}개, 피처 {len(config.FEATURES)}개 "
        f"{config.FEATURES}, 클래스 {n_classes}개"
    )

    if n_classes < 2:
        raise ValueError(
            f"라벨 클래스가 {n_classes}개뿐입니다. generate_dataset.py를 다시 실행해 "
            f"5개 클래스가 모두 포함된 데이터셋을 만드세요."
        )

    X_train, X_test, y_train, y_test = train_test_split(
        X,
        y,
        test_size=config.TEST_SIZE,
        random_state=config.RANDOM_STATE,
        stratify=y,
    )
    logger.info(f"train {len(X_train):,}행 / test {len(X_test):,}행 (층화 분할)")

    model = train_model(X_train, y_train)

    save_test_split(X_test, y_test, config.TEST_SPLIT_DATASET)
    save_model(model, config.MODEL_PKL)


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="기후 분류 모델 학습 (StandardScaler + MLP)")
    parser.add_argument(
        "--dataset", type=Path, default=config.CURRENT_DATASET,
        help="학습에 쓸 CSV 경로 (기본: config.CURRENT_DATASET)",
    )
    args = parser.parse_args()

    try:
        main(args.dataset)
    except Exception as e:
        logger.error(f"학습 실패: {e}")
        sys.exit(1)
