"""저장된 모델(climate_rf.pkl)의 성능을 평가한다.

train_rf.py가 저장해둔 테스트셋(test_split.csv)으로 Accuracy/Precision/
Recall/F1-score/Classification Report/Confusion Matrix를 출력하고,
Confusion Matrix는 이미지로도 저장한다.

사용법:
    python3 train_rf.py   # 먼저 실행해서 모델 + 테스트셋을 만들어둘 것
    python3 evaluate.py
"""

import logging
import pickle
import sys
from pathlib import Path

import matplotlib
matplotlib.use("Agg")  # 화면 없는 환경에서도 이미지 저장 가능하게
import matplotlib.pyplot as plt
import pandas as pd
from sklearn.metrics import (
    accuracy_score,
    classification_report,
    confusion_matrix,
    ConfusionMatrixDisplay,
    f1_score,
    precision_score,
    recall_score,
)

import config

logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(message)s")
logger = logging.getLogger(__name__)


def load_model(path: Path):
    if not path.exists():
        raise FileNotFoundError(f"모델을 찾을 수 없습니다: {path}. train_rf.py를 먼저 실행하세요.")
    with open(path, "rb") as f:
        return pickle.load(f)


def load_test_set(path: Path) -> tuple[pd.DataFrame, pd.Series]:
    if not path.exists():
        raise FileNotFoundError(f"테스트셋을 찾을 수 없습니다: {path}. train_rf.py를 먼저 실행하세요.")
    df = pd.read_csv(path)
    return df[config.FEATURES], df[config.LABEL_COLUMN]


def print_metrics(y_test: pd.Series, y_pred) -> None:
    logger.info(f"Accuracy : {accuracy_score(y_test, y_pred):.4f}")
    logger.info(f"Precision: {precision_score(y_test, y_pred, average='macro', zero_division=0):.4f}")
    logger.info(f"Recall   : {recall_score(y_test, y_pred, average='macro', zero_division=0):.4f}")
    logger.info(f"F1-score : {f1_score(y_test, y_pred, average='macro', zero_division=0):.4f}")

    print("\n=== Classification Report ===")
    print(classification_report(y_test, y_pred, zero_division=0))


def save_confusion_matrix(y_test: pd.Series, y_pred, class_labels, out_path: Path) -> None:
    cm = confusion_matrix(y_test, y_pred, labels=class_labels)
    print("=== Confusion Matrix ===")
    print(cm)

    out_path.parent.mkdir(parents=True, exist_ok=True)
    disp = ConfusionMatrixDisplay(confusion_matrix=cm, display_labels=class_labels)
    fig, ax = plt.subplots(figsize=(6, 6))
    disp.plot(ax=ax, cmap="Blues", colorbar=False)
    fig.tight_layout()
    fig.savefig(out_path)
    plt.close(fig)
    logger.info(f"Confusion matrix 이미지 저장: {out_path}")


def main() -> None:
    model = load_model(config.MODEL_PKL)
    X_test, y_test = load_test_set(config.TEST_SPLIT_DATASET)

    y_pred = model.predict(X_test)

    print_metrics(y_test, y_pred)
    save_confusion_matrix(y_test, y_pred, model.classes_, config.CONFUSION_MATRIX_IMAGE)


if __name__ == "__main__":
    try:
        main()
    except Exception as e:
        logger.error(f"평가 실패: {e}")
        sys.exit(1)
