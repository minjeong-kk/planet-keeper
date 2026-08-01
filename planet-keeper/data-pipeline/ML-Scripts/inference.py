"""ONNX 모델(climate_rf.onnx)로 CSV 한 행을 추론한다.

onnxruntime으로 climate_rf.onnx를 로드하고, 입력 CSV의 한 행(FEATURES
컬럼)을 넣어 예측 클래스를 출력한다. 실제 게임에서 onnxruntime-web이
쓰는 것과 동일한 입출력 형식을 그대로 재현한다.

사용법:
    python3 export_onnx.py                      # 먼저 실행해서 climate_rf.onnx를 만들어둘 것
    python3 inference.py ../Datasets/test_split.csv --row 0
"""

import argparse
import logging
import sys
from pathlib import Path

import numpy as np
import onnxruntime as ort
import pandas as pd

import config

logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(message)s")
logger = logging.getLogger(__name__)


def load_session(path: Path) -> ort.InferenceSession:
    if not path.exists():
        raise FileNotFoundError(f"ONNX 모델을 찾을 수 없습니다: {path}. export_onnx.py를 먼저 실행하세요.")
    return ort.InferenceSession(str(path))


def load_row(csv_path: Path, row_index: int) -> np.ndarray:
    if not csv_path.exists():
        raise FileNotFoundError(f"입력 CSV를 찾을 수 없습니다: {csv_path}")

    df = pd.read_csv(csv_path)

    missing = [c for c in config.FEATURES if c not in df.columns]
    if missing:
        raise ValueError(f"입력 CSV에 없는 피처 컬럼: {missing}")

    if not 0 <= row_index < len(df):
        raise IndexError(f"행 인덱스 {row_index}가 범위를 벗어남 (전체 {len(df)}행)")

    row = df.iloc[[row_index]][config.FEATURES]
    return row.to_numpy(dtype=np.float32)


def predict(session: ort.InferenceSession, x: np.ndarray) -> list:
    input_name = session.get_inputs()[0].name
    return session.run(None, {input_name: x})


def main(csv_path: Path, row_index: int) -> None:
    session = load_session(config.MODEL_ONNX)
    x = load_row(csv_path, row_index)
    outputs = predict(session, x)

    predicted_label = outputs[0][0]
    logger.info(f"입력 파일: {csv_path} (행 {row_index})")
    logger.info(f"예측 결과(state): {predicted_label}")

    if len(outputs) > 1:
        logger.info(f"클래스별 확률: {outputs[1][0]}")


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="ONNX 모델로 CSV 한 행 추론")
    parser.add_argument("csv_path", type=Path, help="입력 CSV 경로")
    parser.add_argument("--row", type=int, default=0, help="추론할 행 인덱스 (기본 0)")
    args = parser.parse_args()

    try:
        main(args.csv_path, args.row)
    except Exception as e:
        logger.error(f"추론 실패: {e}")
        sys.exit(1)
