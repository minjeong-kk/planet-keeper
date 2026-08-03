"""RandomForestClassifier 학습 스크립트.

Datasets/의 CSV(FEATURES + LABEL_COLUMN 컬럼 필요)를 읽어 8:2로 나누고
학습한 뒤 Models/climate_rf.pkl로 저장한다.

분할 방식
---------
클래스 비율을 유지하는 층화 분할(stratified)을 쓴다. 예전에는 실측 위치 단위
그룹 분할(GroupShuffleSplit)을 썼는데, 그때는 한 실측 위치에서 슬라이더만 바꿔
여러 행을 만들었기 때문에 같은 위치의 행이 train/test에 섞이는 누수가 있었다.
지금은 generate_dataset.py가 (조성 × 온도)를 매 행 독립적으로 샘플링하므로
'같은 위치'라는 개념 자체가 없고, 그룹 분할을 쓸 근거가 사라졌다.

모델 크기
---------
계획서 (2)②는 "단일 .onnx 포맷(수십 KB)"이라고 적고 있는데, 이 수치는 라벨 누수가
있던 시절의 것이다. 그때는 라벨이 deltaEnergy 하나의 임계값과 거의 같아서 트리가
몇 노드만으로 순수해졌다. deltaEnergy를 입력에서 빼면 결정 경계가 실제로 복잡한
곡면이 되므로(축에 평행한 분기로 근사해야 함) 트리가 훨씬 커진다.

실측한 트레이드오프 (final_ml_dataset.csv 53,060행 기준):

    트리/깊이   ONNX      정확도
    40 / 12    7,140 KB   0.7973   ← 제한 없이 키운 경우
    10 /  9      478 KB   0.7704
    10 /  8      274 KB   0.7635   ← 현재 설정
     6 /  8      165 KB   0.7601
    10 /  7      146 KB   0.7363
    10 /  6       73 KB   0.7218   ← 계획서의 '수십 KB'를 맞춘 경우

브라우저가 받는 총량은 onnxruntime-web의 wasm 12.86 MB가 지배하므로, 274 KB는
전체의 2% 수준이다. 73 KB로 줄여 얻는 이득(0.2 MB)보다 잃는 정확도(4.2%p)가 크다고
판단해 10/8을 택했다. 크기를 더 줄여야 하면 아래 두 상수만 바꾸면 된다.

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
from sklearn.ensemble import RandomForestClassifier
from sklearn.model_selection import train_test_split

import config

logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(message)s")
logger = logging.getLogger(__name__)

# ONNX 크기 제한(위 docstring의 트레이드오프 표 참고). ONNX 용량은 총 노드 수에
# 거의 비례하므로, 크기를 줄이려면 이 두 값을 낮추면 된다.
N_ESTIMATORS = 10
MAX_DEPTH = 8


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


def train_model(X_train: pd.DataFrame, y_train: pd.Series) -> RandomForestClassifier:
    model = RandomForestClassifier(
        n_estimators=N_ESTIMATORS,
        max_depth=MAX_DEPTH,
        random_state=config.RANDOM_STATE,
    )
    model.fit(X_train, y_train)
    total_nodes = sum(t.tree_.node_count for t in model.estimators_)
    logger.info(
        f"트리 {N_ESTIMATORS}그루, 최대 깊이 {MAX_DEPTH}, 총 노드 {total_nodes:,}개"
    )
    return model


def save_model(model: RandomForestClassifier, path: Path) -> None:
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
    parser = argparse.ArgumentParser(description="RandomForestClassifier 학습")
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
