"""데이터 파이프라인 공용 경로 상수.

예전에는 ML 학습 설정(FEATURES / LEAKY_COLUMNS / 모델 경로 / 학습 하이퍼파라미터)도
여기 있었지만, 분류 모델을 걷어내면서 전부 제거했다. 라벨은 ΔE와 온도만으로 완전히
결정되므로 모델은 물리 규칙의 근사(정확도 0.9694)에 지나지 않았고, 지금은
src/utils/physicsEngine.js 의 planetStateOf 가 정확값을 바로 계산한다.

지금 이 파일을 쓰는 곳은 derive_thresholds.py 하나다.
"""

from pathlib import Path

ML_SCRIPTS_DIR = Path(__file__).resolve().parent
DATA_PIPELINE_DIR = ML_SCRIPTS_DIR.parent
DATASETS_DIR = DATA_PIPELINE_DIR / "Datasets"
