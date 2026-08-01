"""RandomForestClassifier 학습 스크립트.

Datasets/의 CSV(FEATURES + LABEL_COLUMN 컬럼 필요)를 읽어 8:2로 나누고
학습한 뒤 Models/climate_rf.pkl로 저장한다.

같은 실측 위치(SAL/TPW/CLA/SST/t2m/psl)에서 슬라이더만 바꿔 생성된 여러 행이
train/test에 동시에 섞이지 않도록, row 단위가 아니라 실측 위치 단위(Group)로
분리한다(GroupShuffleSplit).

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
from sklearn.model_selection import GroupShuffleSplit

import config

logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(message)s")
logger = logging.getLogger(__name__)

# generate_dataset.py는 하나의 실측 위치(이 6개 컬럼)당 슬라이더만 바꿔 여러 행을
# 만든다. row 단위로 무작위 분할하면 같은 위치의 행이 train/test에 동시에 들어가
# 모델이 위치를 암기해버리므로(데이터 누수), 이 컬럼들로 묶은 그룹 단위로 분리한다.
GROUP_COLUMNS = ["SAL", "TPW", "CLA", "SST", "t2m", "psl"]


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


def split_features_labels(df: pd.DataFrame) -> tuple[pd.DataFrame, pd.Series, pd.Series]:
    """FEATURES/LABEL/그룹id 분리. 결측치가 있는 행은 제거한다.

    그룹id는 실측 위치(GROUP_COLUMNS)를 그대로 이어붙인 문자열이다 - 같은
    실측 위치에서 나온 시뮬레이션 행은 전부 같은 그룹이 된다.
    """
    subset = df[config.FEATURES + [config.LABEL_COLUMN]].dropna()
    dropped = len(df) - len(subset)
    if dropped:
        logger.info(f"결측치로 제외된 행: {dropped}개")

    X = subset[config.FEATURES]
    y = subset[config.LABEL_COLUMN]
    groups = subset[GROUP_COLUMNS].astype(str).agg("_".join, axis=1)
    return X, y, groups


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

    X, y, groups = split_features_labels(df)
    n_classes = y.nunique()
    logger.info(
        f"학습 가능한 행 {len(X)}개, 피처 {len(config.FEATURES)}개, "
        f"클래스 {n_classes}개, 실측 위치(그룹) {groups.nunique()}개"
    )

    if n_classes < 2:
        logger.warning(
            "라벨 클래스가 1개뿐입니다. 물리엔진 이상값(클래스 1~3)이 아직 "
            "합쳐지지 않은 임시 데이터셋으로 보입니다 - 학습은 되지만 의미있는 "
            "분류 성능은 나오지 않습니다."
        )

    splitter = GroupShuffleSplit(
        n_splits=1, test_size=config.TEST_SIZE, random_state=config.RANDOM_STATE
    )
    train_idx, test_idx = next(splitter.split(X, y, groups=groups))
    X_train, X_test = X.iloc[train_idx], X.iloc[test_idx]
    y_train, y_test = y.iloc[train_idx], y.iloc[test_idx]

    overlap = set(groups.iloc[train_idx]) & set(groups.iloc[test_idx])
    assert not overlap, f"train/test에 겹치는 그룹이 있습니다: {len(overlap)}개"

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
