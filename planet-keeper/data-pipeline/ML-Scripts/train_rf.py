"""RandomForestClassifier 학습 스크립트.

Datasets/의 CSV(FEATURES + LABEL_COLUMN 컬럼 필요)를 읽어 8:2로 나누고
학습한 뒤 Models/climate_rf.pkl로 저장한다.

피처 목록은 config.py 한 곳에서만 관리한다 - 물리엔진 피처가 추가되면
config.py의 FEATURES만 수정하면 이 스크립트는 그대로 재사용된다.

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
            f"물리엔진 결과가 합쳐진 최종 데이터셋(final_ml_dataset.csv)이 준비되면 "
            f"--dataset 옵션으로 그 파일을 넘겨서 다시 실행하세요."
        )

    return df


def split_features_labels(df: pd.DataFrame) -> tuple[pd.DataFrame, pd.Series]:
    """FEATURES/LABEL 분리. 결측치가 있는 행은 제거한다."""
    subset = df[config.FEATURES + [config.LABEL_COLUMN]].dropna()
    dropped = len(df) - len(subset)
    if dropped:
        logger.info(f"결측치로 제외된 행: {dropped}개")

    X = subset[config.FEATURES]
    y = subset[config.LABEL_COLUMN]
    return X, y


def train_model(X_train: pd.DataFrame, y_train: pd.Series) -> RandomForestClassifier:
    model = RandomForestClassifier(random_state=config.RANDOM_STATE)
    model.fit(X_train, y_train)
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

    X, y = split_features_labels(df)
    n_classes = y.nunique()
    logger.info(f"학습 가능한 행 {len(X)}개, 피처 {len(config.FEATURES)}개, 클래스 {n_classes}개")

    if n_classes < 2:
        logger.warning(
            "라벨 클래스가 1개뿐입니다. 물리엔진 이상값(클래스 1~3)이 아직 "
            "합쳐지지 않은 임시 데이터셋으로 보입니다 - 학습은 되지만 의미있는 "
            "분류 성능은 나오지 않습니다."
        )

    X_train, X_test, y_train, y_test = train_test_split(
        X, y,
        test_size=config.TEST_SIZE,
        random_state=config.RANDOM_STATE,
        stratify=y if n_classes > 1 else None,
    )
    logger.info(f"train {len(X_train)}행 / test {len(X_test)}행")

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
