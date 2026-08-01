"""climate_rf.pkl -> climate_rf.onnx 변환 (skl2onnx 사용).

브라우저(onnxruntime-web)에서 바로 추론할 수 있게 sklearn 모델을 ONNX
포맷으로 변환한다. 입력 피처 개수는 config.FEATURES 길이를 그대로 쓰므로,
FEATURES가 늘어나도 이 스크립트는 수정할 필요 없다.

사용법:
    python3 train_rf.py   # 먼저 실행해서 climate_rf.pkl을 만들어둘 것
    python3 export_onnx.py
"""

import logging
import pickle
import sys
from pathlib import Path

from skl2onnx import convert_sklearn
from skl2onnx.common.data_types import FloatTensorType

import config

logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(message)s")
logger = logging.getLogger(__name__)


def load_model(path: Path):
    if not path.exists():
        raise FileNotFoundError(f"모델을 찾을 수 없습니다: {path}. train_rf.py를 먼저 실행하세요.")
    with open(path, "rb") as f:
        return pickle.load(f)


def convert_to_onnx(model, n_features: int):
    initial_type = [("input", FloatTensorType([None, n_features]))]
    return convert_sklearn(model, initial_types=initial_type)


def save_onnx(onnx_model, path: Path) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    with open(path, "wb") as f:
        f.write(onnx_model.SerializeToString())
    logger.info(f"ONNX 변환 완료: {path}")


def main() -> None:
    model = load_model(config.MODEL_PKL)
    onnx_model = convert_to_onnx(model, len(config.FEATURES))
    save_onnx(onnx_model, config.MODEL_ONNX)


if __name__ == "__main__":
    try:
        main()
    except Exception as e:
        logger.error(f"ONNX 변환 실패: {e}")
        sys.exit(1)
